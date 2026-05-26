import { readFile, writeFile } from "node:fs/promises";

import YAML from "yaml";

import type { ChainId } from "../config/network.js";
import type { SandboxInfo } from "../rpc/types.js";
import type { Sandbox } from "../core/sandbox.js";

export type SandboxManifest = {
  formatVersion: 1;
  generatedAt: string;
  chains: Partial<Record<ChainId, SandboxInfo>>;
};

export const createSandboxManifest = async (
  sandbox: Sandbox,
): Promise<SandboxManifest> => ({
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  chains: Object.fromEntries(
    await Promise.all(
      [...sandbox.chains.entries()].map(async ([chainId, chain]) => [
        chainId,
        await chain.getInfo(),
      ]),
    ),
  ),
});

export const writeSandboxManifest = async (
  filePath: string,
  sandbox: Sandbox,
) => {
  const manifest = await createSandboxManifest(sandbox);
  await writeFile(filePath, YAML.stringify(manifest), "utf8");
  return manifest;
};

export const readSandboxManifest = async (filePath: string) =>
  YAML.parse(await readFile(filePath, "utf8")) as SandboxManifest;
