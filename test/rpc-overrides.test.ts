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
});
