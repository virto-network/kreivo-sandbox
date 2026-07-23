import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadStorageOverrideFile } from "../lib/services/storage-overrides.js";

describe("storage override files", () => {
  test("loads single-chain YAML overrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kreivo-sandbox-test-"));
    const filePath = join(dir, "single.yml");

    try {
      await writeFile(
        filePath,
        [
          "chain: kreivo",
          "at: best",
          "decoded:",
          "  - pallet: System",
          "    entry: Remark",
          "    value: hello",
        ].join("\n"),
        "utf8",
      );

      const overrides = await loadStorageOverrideFile(filePath);
      expect(overrides).toHaveLength(1);
      expect(overrides[0].chainId).toBe("kreivo");
      expect(overrides[0].decoded).toHaveLength(1);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  test("loads multi-chain YAML overrides", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kreivo-sandbox-test-"));
    const filePath = join(dir, "multi.yml");

    try {
      await writeFile(
        filePath,
        [
          "chains:",
          "  kreivo:",
          "    raw:",
          "      \"0x01\": \"0x02\"",
          "  relay:",
          "    decoded:",
          "      - pallet: Scheduler",
          "        entry: Agenda",
          "        keyArgs: [12]",
          "        value: []",
        ].join("\n"),
        "utf8",
      );

      const overrides = await loadStorageOverrideFile(filePath);
      expect(overrides).toHaveLength(2);
      expect(overrides.map((entry) => entry.chainId).sort()).toEqual([
        "kreivo",
        "relay",
      ]);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
