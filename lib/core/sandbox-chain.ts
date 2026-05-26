import { readFile } from "node:fs/promises";

import { forklift, logger as forkliftLogger, type Forklift } from "@polkadot-api/forklift";
import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata } from "@polkadot-api/substrate-bindings";
import { Binary, Enum, createClient, type HexString, type JsonRpcProvider } from "polkadot-api";

import { createForkliftSource } from "./forklift-source.js";
import { defaultPortForChain, getChainProfile, type ChainId } from "../config/network.js";
import { createSandboxControlClient, type SandboxControlClient } from "../rpc/client.js";
import { createSandboxRpcMethods } from "../rpc/overrides.js";
import {
  replayBlockOnSandboxChain,
  type ReplayBlockInput,
  type ReplayBlockOptions,
} from "../services/replay-block.js";
import type {
  SandboxInfo,
  SandboxNewBlockOptions,
  SerializedStorageDiff,
} from "../rpc/types.js";
import { NodeWsBridge, type ListenOptions } from "./ws-bridge.js";

export type DelayModeInput = "manual" | { timer: number };

export type CreateSandboxChainOptions = {
  endpoint: string | string[];
  chainId?: ChainId;
  name?: string;
  atBlock?: number | string;
  runtimeWasmOverride?: string | Uint8Array;
  buildBlockMode?: DelayModeInput;
  finalizeMode?: DelayModeInput;
  disableOnIdle?: boolean;
  mockSignatureHost?: boolean;
  logLevel?: "silent" | "error" | "warn" | "info" | "debug" | "trace";
};

export type DecodedStorageChange = {
  pallet: string;
  entry: string;
  keyArgs?: unknown[];
  value: unknown | null;
};

const DEFAULT_BUILD_BLOCK_MODE: DelayModeInput = { timer: 0 };
const DEFAULT_FINALIZE_MODE: DelayModeInput = { timer: 0 };

const resolveWasmOverride = async (input?: string | Uint8Array) => {
  if (!input) {
    return undefined;
  }

  if (typeof input === "string") {
    return new Uint8Array(await readFile(input));
  }

  return input;
};

const toDelayMode = (input: DelayModeInput) =>
  input === "manual" ? Enum("manual") : Enum("timer", input.timer);

const normalizeStorageValue = (value: Uint8Array | string | null) => {
  if (value === null || value instanceof Uint8Array) {
    return value;
  }

  return Binary.fromHex(value as HexString);
};

const serializeStorageDiff = (
  diff: Record<string, { value: Uint8Array | null; prev?: Uint8Array | null }>,
): SerializedStorageDiff =>
  Object.fromEntries(
    Object.entries(diff).map(([key, value]) => [
      key,
      {
        value: value.value === null ? null : Binary.toHex(value.value),
        prev:
          value.prev === undefined
            ? undefined
            : value.prev === null
              ? null
              : Binary.toHex(value.prev),
      },
    ]),
  );

export class SandboxChain {
  readonly chainId?: ChainId;
  readonly forklift: Forklift;
  readonly name: string;
  readonly provider: JsonRpcProvider;

  #bridge?: NodeWsBridge;
  #client?: ReturnType<typeof createClient>;
  #controlClient?: SandboxControlClient;
  #destroyPromise?: Promise<void>;
  #port?: number;
  #runtimeWasmOverride?: Uint8Array;
  #wsUrl?: string;

  private constructor(
    private options: CreateSandboxChainOptions,
    runtimeWasmOverride: Uint8Array | undefined,
  ) {
    this.chainId = options.chainId;
    this.name = options.name ?? options.chainId ?? "sandbox";
    this.#runtimeWasmOverride = runtimeWasmOverride;

    if (options.logLevel) {
      forkliftLogger.level = options.logLevel;
    }

    this.forklift = forklift(
      createForkliftSource({
        endpoint: options.endpoint,
        atBlock: options.atBlock,
        runtimeWasm: runtimeWasmOverride,
      }),
      {
        buildBlockMode: toDelayMode(
          options.buildBlockMode ?? DEFAULT_BUILD_BLOCK_MODE,
        ),
        finalizeMode: toDelayMode(
          options.finalizeMode ?? DEFAULT_FINALIZE_MODE,
        ),
        disableOnIdle: options.disableOnIdle,
        mockSignatureHost: options.mockSignatureHost,
        rpcOverrides: createSandboxRpcMethods({
          getInfo: () => this.getInfo(),
          destroy: () => this.destroy(),
        }) as Record<string, never>,
      },
    );

    this.provider = this.forklift.serve;
  }

  static async create(options: CreateSandboxChainOptions) {
    return new SandboxChain(options, await resolveWasmOverride(options.runtimeWasmOverride));
  }

  client() {
    this.#client ??= createClient(this.provider);
    return this.#client;
  }

  async listen(listenOptions: ListenOptions = {}) {
    if (!this.#bridge) {
      this.#bridge = new NodeWsBridge(this.provider);
    }

    const port =
      listenOptions.port ??
      (this.chainId ? defaultPortForChain(this.chainId) : undefined) ??
      0;
    const listener = await this.#bridge.listen({
      host: listenOptions.host,
      port,
    });
    this.#port = listener.port;
    this.#wsUrl = listener.wsUrl;
    return listener;
  }

  async newBlock(options?: SandboxNewBlockOptions) {
    return this.forklift.newBlock({
      ...options,
      transactions: options?.transactions?.map(Binary.fromHex),
      storage: options?.storage
        ? Object.fromEntries(
            Object.entries(options.storage).map(([key, value]) => [
              key,
              value === null ? null : Binary.fromHex(value),
            ]),
          )
        : undefined,
    } as Parameters<Forklift["newBlock"]>[0]);
  }

  async changeBest(hash: HexString) {
    await this.forklift.changeBest(hash);
  }

  async changeFinalized(hash: HexString) {
    await this.forklift.changeFinalized(hash);
  }

  async setStorageRaw(
    hash: HexString,
    changes: Record<string, Uint8Array | string | null>,
  ) {
    await this.forklift.setStorage(
      hash,
      Object.fromEntries(
        Object.entries(changes).map(([key, value]) => [key, normalizeStorageValue(value)]),
      ) as Record<string, Uint8Array>,
    );
  }

  async setStorageDecoded(hash: HexString, changes: DecodedStorageChange[]) {
    const metadata = unifyMetadata(decAnyMetadata(await this.client().getMetadata(hash)));
    const builder = getDynamicBuilder(getLookupFn(metadata));
    const encodedChanges = Object.fromEntries(
      changes.map((change) => {
        const storage = builder.buildStorage(change.pallet, change.entry);
        return [
          storage.keys.enc(...(change.keyArgs ?? [])),
          change.value === null ? null : storage.value.enc(change.value),
        ];
      }),
    );

    await this.setStorageRaw(hash, encodedChanges);
  }

  async getStorageDiff(hash: HexString, baseHash?: HexString) {
    return serializeStorageDiff(await this.forklift.getStorageDiff(hash, baseHash));
  }

  async replayBlock(input: ReplayBlockInput, options?: ReplayBlockOptions) {
    return replayBlockOnSandboxChain(this, input, options);
  }

  async attachRelay(relayWsUrl: string) {
    await this.client()._request<void, [string]>(
      "forklift_xcm_attach_relay",
      [relayWsUrl],
    );
  }

  async attachSibling(siblingWsUrl: string) {
    await this.client()._request<void, [string]>(
      "forklift_xcm_attach_sibling",
      [siblingWsUrl],
    );
  }

  get rpc() {
    if (!this.#wsUrl) {
      throw new Error("Sandbox control RPC requires the chain to be listening");
    }

    this.#controlClient ??= createSandboxControlClient(this.#wsUrl);
    return this.#controlClient;
  }

  get wsUrl() {
    return this.#wsUrl;
  }

  get port() {
    return this.#port;
  }

  async getInfo(): Promise<SandboxInfo> {
    const bestBlocks = await this.client().getBestBlocks();
    const bestHash = bestBlocks[0]?.hash;
    const finalizedHash = bestBlocks[bestBlocks.length - 1]?.hash;

    if (!bestHash || !finalizedHash) {
      throw new Error("Unable to resolve best/finalized heads");
    }

    const profile = this.chainId ? getChainProfile(this.chainId) : undefined;
    const runtimeVersion = (await this.client().getUnsafeApi().apis.Core.version({
      at: bestHash,
    })) as {
      spec_version?: number;
      specVersion?: number;
    };

    return {
      name: this.name,
      chainId: this.chainId,
      paraId: profile?.paraId,
      port: this.#port,
      wsUrl: this.#wsUrl,
      bestHash,
      finalizedHash,
      runtimeVersion: runtimeVersion.spec_version ?? runtimeVersion.specVersion ?? 0,
    };
  }

  async destroy() {
    if (this.#destroyPromise) {
      return this.#destroyPromise;
    }

    this.#destroyPromise = (async () => {
      this.#controlClient?.close();
      await this.#bridge?.destroy();
      this.#client?.destroy();
      this.forklift.destroy();
    })();

    return this.#destroyPromise;
  }
}

export const createSandboxChain = (options: CreateSandboxChainOptions) =>
  SandboxChain.create(options);

export const serve = (chain: SandboxChain, options?: ListenOptions) =>
  chain.listen(options);
