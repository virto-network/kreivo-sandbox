import { describe, expect, test } from "bun:test";

import { createSandboxRpcMethods } from "../lib/rpc/overrides.js";

describe("sandbox RPC overrides", () => {
  test("serializes storage diffs and responds with sandbox info", async () => {
    const sent: unknown[] = [];
    const methods = createSandboxRpcMethods({
      destroy: async () => {},
      getInfo: async () => ({
        name: "kreivo",
        bestHash: "0xaaa",
        finalizedHash: "0xbbb",
        runtimeVersion: 42,
      }),
      setStorageRaw: async () => {},
      setStorageLegacy: async () => {},
    });

    await methods.sandbox_getStorageDiff(
      {
        send(message) {
          sent.push(message);
        },
      },
      {
        id: 1,
        params: ["0xaaa", "0xbbb"],
      },
      {
        chain: {
          async getStorageDiff() {
            return {
              "0x01": {
                value: Uint8Array.from([1]),
                prev: Uint8Array.from([0]),
              },
            };
          },
        },
        async newBlock() {
          return "0xabc";
        },
      } as never,
    );

    await methods.sandbox_info(
      {
        send(message) {
          sent.push(message);
        },
      },
      { id: 2 },
      {
        chain: {
          best$: null,
          finalized$: null,
          getBlock() {
            return undefined;
          },
        },
        async newBlock() {
          return "0xabc";
        },
      } as never,
    );

    expect(sent).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          "0x01": {
            value: "0x01",
            prev: "0x00",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        result: {
          name: "kreivo",
          bestHash: "0xaaa",
          finalizedHash: "0xbbb",
          runtimeVersion: 42,
        },
      },
    ]);
  });

  test("requests asynchronous destroy after acknowledging the RPC", async () => {
    let destroyed = false;
    const sent: unknown[] = [];
    const methods = createSandboxRpcMethods({
      destroy: async () => {
        destroyed = true;
      },
      getInfo: async () => ({
        name: "kreivo",
        bestHash: "0xaaa",
        finalizedHash: "0xbbb",
        runtimeVersion: 42,
      }),
      setStorageRaw: async () => {},
      setStorageLegacy: async () => {},
    });

    await methods.sandbox_destroy(
      {
        send(message) {
          sent.push(message);
        },
      },
      { id: 3 },
      {
        chain: {
          best$: null,
          finalized$: null,
          getBlock() {
            return undefined;
          },
        },
        async newBlock() {
          return "0xabc";
        },
      } as never,
    );

    expect(sent).toEqual([
      {
        jsonrpc: "2.0",
        id: 3,
        result: null,
      },
    ]);

    await new Promise((resolve) => queueMicrotask(resolve));
    expect(destroyed).toBe(true);
  });

  test("dev_setStorage routes a flat array to setStorageRaw", async () => {
    const sent: unknown[] = [];
    const rawCalls: unknown[] = [];
    const methods = createSandboxRpcMethods({
      destroy: async () => {},
      getInfo: async () => ({
        name: "kreivo",
        bestHash: "0xaaa",
        finalizedHash: "0xbbb",
        runtimeVersion: 42,
      }),
      setStorageRaw: async (hash, changes) => {
        rawCalls.push({ hash, changes });
      },
      setStorageLegacy: async () => {
        throw new Error("should not be called for the native format");
      },
    });

    await methods.dev_setStorage(
      {
        send(message) {
          sent.push(message);
        },
      },
      {
        id: 1,
        params: [[["0x01", "0x02"]]],
      },
      {} as never,
    );

    expect(rawCalls).toEqual([{ hash: "0xaaa", changes: { "0x01": "0x02" } }]);
    expect(sent).toEqual([{ jsonrpc: "2.0", id: 1, result: "0xaaa" }]);
  });

  test("dev_setStorage routes a nested pallet/item object to setStorageLegacy", async () => {
    const sent: unknown[] = [];
    const legacyCalls: unknown[] = [];
    const legacyDiff = {
      Preimage: { PreimageFor: [[[["0xhash", 4], "0xdeadbeef"]]] },
    };
    const methods = createSandboxRpcMethods({
      destroy: async () => {},
      getInfo: async () => ({
        name: "kreivo",
        bestHash: "0xaaa",
        finalizedHash: "0xbbb",
        runtimeVersion: 42,
      }),
      setStorageRaw: async () => {
        throw new Error("should not be called for the legacy format");
      },
      setStorageLegacy: async (hash, diff) => {
        legacyCalls.push({ hash, diff });
      },
    });

    await methods.dev_setStorage(
      {
        send(message) {
          sent.push(message);
        },
      },
      {
        id: 2,
        params: [legacyDiff, "0xccc"],
      },
      {} as never,
    );

    expect(legacyCalls).toEqual([{ hash: "0xccc", diff: legacyDiff }]);
    expect(sent).toEqual([{ jsonrpc: "2.0", id: 2, result: "0xccc" }]);
  });
});
