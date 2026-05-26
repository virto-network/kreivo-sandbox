import { Binary, type HexString } from "polkadot-api";
import { firstValueFrom } from "rxjs";

import type {
  SandboxInfo,
  SandboxNewBlockOptions,
  SerializedStorageDiff,
} from "./types.js";

type RpcConnection = {
  send(message: unknown): void;
};

type RpcRequest = {
  id: string | number | null;
  params?: unknown;
};

type ForkliftRpcContext = {
  chain: {
    best$: unknown;
    finalized$: unknown;
    getBlock(hash: HexString): {
      runtime: { specVersion: number };
    } | undefined;
  };
  newBlock(options?: Record<string, unknown>): Promise<HexString>;
};

type RpcMethod = (
  connection: RpcConnection,
  request: RpcRequest,
  context: ForkliftRpcContext,
) => void | Promise<void>;

const respond = (id: RpcRequest["id"], result: unknown) => ({
  jsonrpc: "2.0",
  id,
  result,
});

const errorResponse = (id: RpcRequest["id"], error: Error) => ({
  jsonrpc: "2.0",
  id,
  error: {
    code: -32_000,
    message: error.message,
  },
});

const getArrayParams = (request: RpcRequest) =>
  Array.isArray(request.params) ? request.params : [request.params];

const serializeStorageDiff = (
  diff: Record<string, { value: Uint8Array | null; prev?: Uint8Array | null }>,
): SerializedStorageDiff =>
  Object.fromEntries(
    Object.entries(diff).map(([key, value]) => [
      key,
      {
        value: value.value === null ? null : Binary.toHex(value.value),
        prev: value.prev === undefined ? undefined : value.prev === null ? null : Binary.toHex(value.prev),
      },
    ]),
  );

const decodeNewBlockOptions = (
  options?: SandboxNewBlockOptions,
): Record<string, unknown> | undefined => {
  if (!options) {
    return undefined;
  }

  return {
    ...options,
    transactions: options.transactions?.map(Binary.fromHex),
    storage: options.storage
      ? Object.fromEntries(
          Object.entries(options.storage).map(([key, value]) => [
            key,
            value === null ? null : Binary.fromHex(value),
          ]),
        )
      : undefined,
  };
};

const withRpcErrorBoundary =
  (handler: RpcMethod): RpcMethod =>
  async (connection, request, context) => {
    try {
      await handler(connection, request, context);
    } catch (error) {
      const rpcError = error instanceof Error ? error : new Error(String(error));
      connection.send(errorResponse(request.id, rpcError));
    }
  };

export const createSandboxRpcMethods = ({
  getInfo,
  destroy,
}: {
  getInfo(): Promise<SandboxInfo>;
  destroy(): Promise<void>;
}): Record<string, RpcMethod> => ({
  sandbox_newBlock: withRpcErrorBoundary(async (connection, request, context) => {
    const [options] = getArrayParams(request) as [SandboxNewBlockOptions?];
    const hash = await context.newBlock(decodeNewBlockOptions(options));
    connection.send(respond(request.id, hash));
  }),
  sandbox_changeBest: withRpcErrorBoundary(async (connection, request, context) => {
    const [hash] = getArrayParams(request) as [HexString];
    const best = context.chain as unknown as { changeBest(hash: HexString): void };
    best.changeBest(hash);
    connection.send(respond(request.id, null));
  }),
  sandbox_changeFinalized: withRpcErrorBoundary(
    async (connection, request, context) => {
      const [hash] = getArrayParams(request) as [HexString];
      const finalized = context.chain as unknown as {
        changeFinalized(hash: HexString): void;
      };
      finalized.changeFinalized(hash);
      connection.send(respond(request.id, null));
    },
  ),
  sandbox_getStorageDiff: withRpcErrorBoundary(
    async (connection, request, context) => {
      const [hash, baseHash] = getArrayParams(request) as [HexString, HexString?];
      const chain = context.chain as unknown as {
        getStorageDiff(
          hash: HexString,
          baseHash?: HexString,
        ): Promise<Record<string, { value: Uint8Array | null; prev?: Uint8Array | null }>>;
      };
      const diff = await chain.getStorageDiff(hash, baseHash);
      connection.send(respond(request.id, serializeStorageDiff(diff)));
    },
  ),
  sandbox_destroy: withRpcErrorBoundary(async (connection, request) => {
    connection.send(respond(request.id, null));
    queueMicrotask(() => {
      void destroy();
    });
  }),
  sandbox_info: withRpcErrorBoundary(async (connection, request) => {
    connection.send(respond(request.id, await getInfo()));
  }),
});

export const getRuntimeVersionFromContext = async (
  context: ForkliftRpcContext,
): Promise<number> => {
  const bestHash = await firstValueFrom(context.chain.best$ as never);
  return context.chain.getBlock(bestHash as HexString)?.runtime.specVersion ?? 0;
};
