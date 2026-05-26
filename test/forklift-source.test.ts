import { describe, expect, test } from "bun:test";

import { RUNTIME_CODE_KEY, withRuntimeOverride } from "../lib/core/forklift-source.js";

describe("withRuntimeOverride", () => {
  test("overrides the runtime code key consistently", async () => {
    const wasm = Uint8Array.from([1, 2, 3, 4]);
    const source = withRuntimeOverride(
      {
        block: Promise.resolve({
          blockHash: "0x01",
          body: [],
          header: {
            digest: { logs: [] },
            extrinsicsRoot: "0x00",
            number: 1,
            parentHash: "0x00",
            stateRoot: "0x00",
          },
        }),
        destroy() {},
        getChainSpecData: async () => ({
          chainType: "Live",
          genesisHash: "0x00",
          name: "test",
          properties: {},
        }),
        getStorage: async () => Uint8Array.from([9]),
        getStorageBatch: async (keys) => keys.map(() => Uint8Array.from([8])),
        getStorageDescendants: async () => ({
          "0x3a": Uint8Array.from([7]),
        }),
      },
      wasm,
    );

    expect(await source.getStorage(RUNTIME_CODE_KEY)).toEqual(wasm);
    expect(
      await source.getStorageBatch([RUNTIME_CODE_KEY, "0x0102"]),
    ).toEqual([wasm, Uint8Array.from([8])]);

    const descendants = await source.getStorageDescendants("0x3a");
    expect(descendants[RUNTIME_CODE_KEY]).toEqual(wasm);
  });
});
