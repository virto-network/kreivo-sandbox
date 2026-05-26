import { run_task, type JsCallback } from "@acala-network/chopsticks-executor";
import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata, type Codec } from "@polkadot-api/substrate-bindings";
import { Binary, type BlockHeader, type HexString } from "polkadot-api";

import { RUNTIME_CODE_KEY } from "../core/forklift-source.js";

const MIN_PREFIX_LEN = 32 * 2 + 2;
const DEFAULT_STORAGE_PROOF_SIZE = 1_000;
const DEFAULT_KEY_PAGE_SIZE = 256;
let nextReplayTaskId = 0;

export type ReplayClient = {
  getBlockBody(hash: HexString): Promise<Uint8Array[]>;
  getBlockHeader(hash: HexString): Promise<BlockHeader>;
  getMetadata(hash: HexString): Promise<Uint8Array>;
  rawQuery(
    storageKey: HexString | string,
    options?: {
      at?: HexString | "best" | "finalized";
      signal?: AbortSignal;
    },
  ): Promise<HexString | null>;
  _request<TResult, TParams extends unknown[]>(
    method: string,
    params: TParams,
  ): Promise<TResult>;
};

export type ReplayExistingBlockInput = {
  blockHash: HexString;
};

export type ReplaySyntheticBlockInput = {
  blockHash?: HexString;
  extrinsics: HexString[];
  header: BlockHeader;
  parentHash: HexString;
};

export type ReplayBlockInput = ReplayExistingBlockInput | ReplaySyntheticBlockInput;

export type ReplayRawStorageDiffEntry = {
  key: HexString;
  value: HexString | null;
};

export type ReplayPhaseName = "Initialization" | "Finalization" | number;

export type ReplayPhaseResult = {
  call: string;
  logs: string[];
  phase: ReplayPhaseName;
  result: unknown;
  resultHex: HexString;
  storageDiff: ReplayRawStorageDiffEntry[];
};

export type ReplayExtrinsicResult = {
  extrinsic: HexString;
  index: number;
  result: unknown;
  resultHex: HexString;
  success: boolean | null;
};

export type ReplayBlockDetails = {
  events?: unknown[];
  extrinsics: ReplayExtrinsicResult[];
  timestamp?: unknown;
};

export type ReplayBlockOptions = {
  allowUnresolvedImports?: boolean;
  includeEvents?: boolean;
  includeFinalStorageDiff?: boolean;
  mockSignatureHost?: boolean;
  runtimeLogLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  storageProofSize?: number;
};

export type ReplayBlockResult = {
  blockDetails: ReplayBlockDetails;
  blockHash?: HexString;
  finalStorageDiff?: ReplayRawStorageDiffEntry[];
  header: unknown;
  parentHash: HexString;
  phases: ReplayPhaseResult[];
};

type RuntimeTaskResponse = {
  Call?: {
    result: HexString;
    runtimeLogs: string[];
    storageDiff: Array<[HexString, HexString | null]>;
  };
  Error?: string;
};

type RuntimeTaskCodec = {
  args: Codec<any[]>;
  value: Codec<any>;
};

type ReplayExecutor = {
  runTask(task: Record<string, unknown>, callback: JsCallback): Promise<RuntimeTaskResponse>;
};

type ReplayResolvedInput = {
  blockHash?: HexString;
  extrinsics: HexString[];
  header: BlockHeader;
  parentHash: HexString;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickFirst = <T>(...values: Array<T | undefined>) => values.find((value) => value !== undefined);

export const serializeReplayValue = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return Binary.toHex(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeReplayValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeReplayValue(entry)]),
    );
  }

  return value;
};

export const applyReplayStorageDiff = (
  overlay: Record<HexString, HexString | null>,
  storageDiff: Array<[HexString, HexString | null]>,
) => {
  for (const [key, value] of storageDiff) {
    overlay[key] = value;
  }

  return overlay;
};

const formatRawStorageDiff = (
  storageDiff: Array<[HexString, HexString | null]>,
): ReplayRawStorageDiffEntry[] =>
  storageDiff.map(([key, value]) => ({ key, value }));

const inferReplaySuccess = (decodedResult: unknown): boolean | null => {
  if (!isRecord(decodedResult)) {
    return null;
  }

  if (typeof decodedResult.success === "boolean") {
    return decodedResult.success;
  }

  if (typeof decodedResult.type === "string") {
    if (["Ok", "Success"].includes(decodedResult.type)) {
      return true;
    }
    if (["Err", "Error", "Failed"].includes(decodedResult.type)) {
      return false;
    }
  }

  return null;
};

const decodeReplayValue = (codec: { dec(value: Uint8Array): any }, value: HexString) => {
  try {
    return serializeReplayValue(codec.dec(Binary.fromHex(value)));
  } catch {
    return value;
  }
};

const decodeOverlayStorageValue = (
  overlay: Record<HexString, HexString | null>,
  key: HexString,
  codec: { dec(value: Uint8Array): any },
) => {
  const value = overlay[key];
  if (!value) {
    return undefined;
  }

  return decodeReplayValue(codec, value);
};

export const createReplayJsCallback = (
  client: ReplayClient,
  at: HexString,
  overlay: Record<HexString, HexString | null>,
  { keyPageSize = DEFAULT_KEY_PAGE_SIZE }: { keyPageSize?: number } = {},
): JsCallback => {
  const queryCache = new Map<HexString, HexString | null>();
  const nextKeyCache = new Map<string, string | undefined>();

  const getOverlayNextKey = (prefix: HexString, key: HexString) =>
    Object.keys(overlay)
      .filter((candidate) => candidate.startsWith(prefix) && candidate > key && overlay[candidate] !== null)
      .sort()[0] as HexString | undefined;

  const getBaseStorage = async (key: HexString) => {
    if (!queryCache.has(key)) {
      queryCache.set(key, await client.rawQuery(key, { at }));
    }

    return queryCache.get(key) ?? null;
  };

  const getBaseNextKey = async (prefix: HexString, key: HexString) => {
    const cacheKey = `${prefix}:${key}`;
    if (!nextKeyCache.has(cacheKey)) {
      const candidates = await client._request<string[], [HexString, number, HexString, HexString]>(
        "state_getKeysPaged",
        [prefix, keyPageSize, key, at],
      );
      const filtered = candidates.find((candidate) => overlay[candidate as HexString] !== null);
      nextKeyCache.set(cacheKey, filtered);
    }

    return nextKeyCache.get(cacheKey) as HexString | undefined;
  };

  return {
    async getStorage(key) {
      if (key in overlay) {
        return overlay[key] ?? undefined;
      }

      const value = await getBaseStorage(key);
      return value ?? undefined;
    },
    async getNextKey(prefix, key) {
      const effectivePrefix = prefix.length < MIN_PREFIX_LEN ? key.slice(0, MIN_PREFIX_LEN) as HexString : prefix;
      const nextOverlayKey = getOverlayNextKey(effectivePrefix, key);
      const nextBaseKey = await getBaseNextKey(effectivePrefix, key);

      return pickFirst(
        [nextOverlayKey, nextBaseKey].filter((candidate): candidate is HexString => Boolean(candidate)).sort()[0],
      );
    },
    async offchainGetStorage() {
      return undefined;
    },
    async offchainRandomSeed() {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Binary.toHex(bytes) as `0x${string}`;
    },
    async offchainSubmitTransaction() {
      return false;
    },
    async offchainTimestamp() {
      return Date.now();
    },
  };
};

const resolveReplayBlockInput = async (
  client: ReplayClient,
  input: ReplayBlockInput,
): Promise<ReplayResolvedInput> => {
  if ("parentHash" in input) {
    return input;
  }

  const header = await client.getBlockHeader(input.blockHash);
  const extrinsics = (await client.getBlockBody(input.blockHash)).map((entry) =>
    Binary.toHex(entry),
  );

  return {
    blockHash: input.blockHash,
    extrinsics,
    header,
    parentHash: header.parentHash,
  };
};

const createRuntimeTask = ({
  allowUnresolvedImports,
  args,
  call,
  mockSignatureHost,
  runtimeLogLevel,
  storageProofSize,
  wasm,
}: {
  allowUnresolvedImports: boolean;
  args: HexString;
  call: string;
  mockSignatureHost: boolean;
  runtimeLogLevel: number;
  storageProofSize: number;
  wasm: HexString;
}) => ({
  allowUnresolvedImports,
  calls: [[call, [args]]],
  id: nextReplayTaskId++,
  mockSignatureHost: mockSignatureHost ? 2 : 0,
  runtimeLogLevel,
  storageProofSize,
  wasm,
});

const runReplayPhase = async (
  executor: ReplayExecutor,
  codec: RuntimeTaskCodec,
  callback: JsCallback,
  overlay: Record<HexString, HexString | null>,
  {
    allowUnresolvedImports,
    args,
    call,
    mockSignatureHost,
    phase,
    runtimeLogLevel,
    storageProofSize,
    wasm,
  }: {
    allowUnresolvedImports: boolean;
    args: HexString;
    call: string;
    mockSignatureHost: boolean;
    phase: ReplayPhaseName;
    runtimeLogLevel: number;
    storageProofSize: number;
    wasm: HexString;
  },
): Promise<ReplayPhaseResult> => {
  const response = await executor.runTask(
    createRuntimeTask({
      allowUnresolvedImports,
      args,
      call,
      mockSignatureHost,
      runtimeLogLevel,
      storageProofSize,
      wasm,
    }),
    callback,
  );

  if (response.Error) {
    throw new Error(`Runtime replay failed during ${call}: ${response.Error}`);
  }

  if (!response.Call) {
    throw new Error(`Runtime replay returned no call result during ${call}`);
  }

  applyReplayStorageDiff(overlay, response.Call.storageDiff);

  return {
    call,
    logs: response.Call.runtimeLogs,
    phase,
    result: decodeReplayValue(codec.value, response.Call.result),
    resultHex: response.Call.result,
    storageDiff: formatRawStorageDiff(response.Call.storageDiff),
  };
};

const defaultReplayExecutor: ReplayExecutor = {
  runTask: (task, callback) => run_task(task, callback) as Promise<RuntimeTaskResponse>,
};

export const replayBlock = async (
  client: ReplayClient,
  input: ReplayBlockInput,
  {
    allowUnresolvedImports = true,
    includeEvents = true,
    includeFinalStorageDiff = true,
    mockSignatureHost = false,
    runtimeLogLevel = 5,
    storageProofSize = DEFAULT_STORAGE_PROOF_SIZE,
  }: ReplayBlockOptions = {},
  executor: ReplayExecutor = defaultReplayExecutor,
): Promise<ReplayBlockResult> => {
  const resolvedInput = await resolveReplayBlockInput(client, input);
  const metadata = unifyMetadata(decAnyMetadata(await client.getMetadata(resolvedInput.parentHash)));
  const builder = getDynamicBuilder(getLookupFn(metadata));
  const initializeCodec = builder.buildRuntimeCall("Core", "initialize_block");
  const applyExtrinsicCodec = builder.buildRuntimeCall("BlockBuilder", "apply_extrinsic");
  const finalizeCodec = builder.buildRuntimeCall("BlockBuilder", "finalize_block");
  const eventsStorage = includeEvents ? builder.buildStorage("System", "Events") : undefined;
  const timestampStorage = includeEvents ? builder.buildStorage("Timestamp", "Now") : undefined;
  const runtimeCode = await client.rawQuery(RUNTIME_CODE_KEY, { at: resolvedInput.parentHash });

  if (!runtimeCode) {
    throw new Error(`No runtime code is available at parent ${resolvedInput.parentHash}`);
  }

  const overlay: Record<HexString, HexString | null> = {};
  const callback = createReplayJsCallback(client, resolvedInput.parentHash, overlay);
  const phases: ReplayPhaseResult[] = [];

  phases.push(
    await runReplayPhase(
      executor,
      initializeCodec,
      callback,
      overlay,
      {
        allowUnresolvedImports,
        args: Binary.toHex(initializeCodec.args.enc([resolvedInput.header])),
        call: "Core_initialize_block",
        mockSignatureHost,
        phase: "Initialization",
        runtimeLogLevel,
        storageProofSize,
        wasm: runtimeCode,
      },
    ),
  );

  const extrinsicResults: ReplayExtrinsicResult[] = [];
  for (const [index, extrinsic] of resolvedInput.extrinsics.entries()) {
    const phase = await runReplayPhase(
      executor,
      applyExtrinsicCodec,
      callback,
      overlay,
      {
        allowUnresolvedImports,
        args: Binary.toHex(applyExtrinsicCodec.args.enc([Binary.fromHex(extrinsic)])),
        call: "BlockBuilder_apply_extrinsic",
        mockSignatureHost,
        phase: index,
        runtimeLogLevel,
        storageProofSize,
        wasm: runtimeCode,
      },
    );
    phases.push(phase);
    extrinsicResults.push({
      extrinsic,
      index,
      result: phase.result,
      resultHex: phase.resultHex,
      success: inferReplaySuccess(phase.result),
    });
  }

  phases.push(
    await runReplayPhase(
      executor,
      finalizeCodec,
      callback,
      overlay,
      {
        allowUnresolvedImports,
        args: Binary.toHex(finalizeCodec.args.enc([])),
        call: "BlockBuilder_finalize_block",
        mockSignatureHost,
        phase: "Finalization",
        runtimeLogLevel,
        storageProofSize,
        wasm: runtimeCode,
      },
    ),
  );

  return {
    blockDetails: {
      events:
        includeEvents && eventsStorage
          ? (decodeOverlayStorageValue(
              overlay,
              eventsStorage.keys.enc() as HexString,
              eventsStorage.value,
            ) as unknown[] | undefined)
          : undefined,
      extrinsics: extrinsicResults,
      timestamp:
        includeEvents && timestampStorage
          ? decodeOverlayStorageValue(
              overlay,
              timestampStorage.keys.enc() as HexString,
              timestampStorage.value,
            )
          : undefined,
    },
    blockHash: resolvedInput.blockHash,
    finalStorageDiff: includeFinalStorageDiff
      ? Object.entries(overlay)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => ({
            key: key as HexString,
            value,
          }))
      : undefined,
    header: serializeReplayValue(resolvedInput.header),
    parentHash: resolvedInput.parentHash,
    phases,
  };
};

export const replayBlockOnSandboxChain = async (
  chain: { client(): ReplayClient },
  input: ReplayBlockInput,
  options?: ReplayBlockOptions,
) => replayBlock(chain.client(), input, options);

export const replayBlockInternals = {
  applyReplayStorageDiff,
  createReplayJsCallback,
  serializeReplayValue,
};
