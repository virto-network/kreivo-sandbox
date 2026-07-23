import { type Source, wsSource } from "@polkadot-api/forklift";

import type { HexString } from "polkadot-api";

export const RUNTIME_CODE_KEY = "0x3a636f6465" as HexString;

export const withRuntimeOverride = (
  source: Source,
  runtimeWasm: Uint8Array,
): Source => ({
  ...source,
  async getStorage(key) {
    if (key === RUNTIME_CODE_KEY) {
      return runtimeWasm;
    }

    return source.getStorage(key);
  },
  async getStorageBatch(keys) {
    const results = await source.getStorageBatch(
      keys.filter((key) => key !== RUNTIME_CODE_KEY),
    );
    let offset = 0;

    return keys.map((key) => {
      if (key === RUNTIME_CODE_KEY) {
        return runtimeWasm;
      }

      const result = results[offset];
      offset += 1;
      return result ?? null;
    });
  },
  async getStorageDescendants(prefix) {
    const descendants = await source.getStorageDescendants(prefix);
    if (prefix === RUNTIME_CODE_KEY || RUNTIME_CODE_KEY.startsWith(prefix)) {
      descendants[RUNTIME_CODE_KEY] = runtimeWasm;
    }

    return descendants;
  },
});

export const createForkliftSource = ({
  endpoint,
  atBlock,
  runtimeWasm,
}: {
  endpoint: string | string[];
  atBlock?: number | string;
  runtimeWasm?: Uint8Array;
}) => {
  const source = wsSource(endpoint, atBlock === undefined ? undefined : { atBlock });
  return runtimeWasm ? withRuntimeOverride(source, runtimeWasm) : source;
};
