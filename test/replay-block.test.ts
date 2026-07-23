import { describe, expect, test } from "bun:test";

import { replayBlockInternals } from "../lib/services/replay-block.js";

const { applyReplayStorageDiff, createReplayJsCallback, serializeReplayValue } =
  replayBlockInternals;

describe("replay block internals", () => {
  test("merges replay storage diffs into the shadow overlay", () => {
    const overlay = {
      "0x01": "0xaa",
    } as Record<`0x${string}`, `0x${string}` | null>;

    applyReplayStorageDiff(overlay, [
      ["0x02", "0xbb"],
      ["0x01", null],
    ]);

    expect(overlay).toEqual({
      "0x01": null,
      "0x02": "0xbb",
    });
  });

  test("serializes replay values into JSON-safe output", () => {
    expect(
      serializeReplayValue({
        bytes: Uint8Array.from([1, 2, 3]),
        count: 7n,
        nested: [{ flag: true, total: 9n }],
      }),
    ).toEqual({
      bytes: "0x010203",
      count: "7",
      nested: [{ flag: true, total: "9" }],
    });
  });

  test("prefers overlay values and overlay next keys over base state", async () => {
    const prefix = `0x${"11".repeat(32)}` as `0x${string}`;
    const currentKey = `${prefix}10` as `0x${string}`;
    const overlayNextKey = `${prefix}20` as `0x${string}`;
    const baseNextKey = `${prefix}30` as `0x${string}`;
    const client = {
      _request: async () => [baseNextKey],
      getBlockBody: async () => [],
      getBlockHeader: async () => {
        throw new Error("unused");
      },
      getMetadata: async () => new Uint8Array(),
      rawQuery: async (key: string) => (key === "0xdead" ? "0xbeef" : null),
    };
    const callback = createReplayJsCallback(
      client,
      "0xparent" as `0x${string}`,
      {
        [overlayNextKey]: "0x01",
      },
    );

    expect(await callback.getStorage("0xdead" as `0x${string}`)).toBe("0xbeef");
    expect(await callback.getNextKey(prefix, currentKey)).toBe(overlayNextKey);
  });

  test("skips base next keys that are tombstoned by the overlay", async () => {
    const prefix = `0x${"22".repeat(32)}` as `0x${string}`;
    const currentKey = `${prefix}10` as `0x${string}`;
    const baseKeys = [`${prefix}20`, `${prefix}30`] as `0x${string}`[];
    const client = {
      _request: async () => baseKeys,
      getBlockBody: async () => [],
      getBlockHeader: async () => {
        throw new Error("unused");
      },
      getMetadata: async () => new Uint8Array(),
      rawQuery: async () => null,
    };
    const callback = createReplayJsCallback(
      client,
      "0xparent" as `0x${string}`,
      {
        [baseKeys[0]]: null,
      },
    );

    expect(await callback.getNextKey(prefix, currentKey)).toBe(baseKeys[1]);
  });
});
