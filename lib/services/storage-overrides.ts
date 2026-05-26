import { readFile } from "node:fs/promises";

import YAML from "yaml";

import type { HexString } from "polkadot-api";

import type { ChainId } from "../config/network.js";
import type { DecodedStorageChange, SandboxChain } from "../core/sandbox-chain.js";

export type ChainStorageOverrideSpec = {
  at?: "best" | "finalized" | HexString;
  decoded?: DecodedStorageChange[];
  raw?: Record<string, string | null> | Array<{ key: string; value: string | null }>;
};

export type NormalizedChainStorageOverride = {
  chainId: ChainId;
  at?: "best" | "finalized" | HexString;
  decoded: DecodedStorageChange[];
  raw: Record<string, string | null>;
  source: string;
};

type TopLevelStorageOverrideFile =
  | ({ chain: ChainId } & ChainStorageOverrideSpec)
  | {
      chains: Partial<Record<ChainId, ChainStorageOverrideSpec>>;
    };

const normalizeRawOverrides = (
  raw?: ChainStorageOverrideSpec["raw"],
): Record<string, string | null> => {
  if (!raw) {
    return {};
  }

  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map(({ key, value }) => [key, value]));
  }

  return raw;
};

const normalizeOverride = (
  source: string,
  chainId: ChainId,
  input: ChainStorageOverrideSpec,
): NormalizedChainStorageOverride => ({
  chainId,
  at: input.at,
  decoded: input.decoded ?? [],
  raw: normalizeRawOverrides(input.raw),
  source,
});

export const loadStorageOverrideFile = async (filePath: string) => {
  const content = await readFile(filePath, "utf8");
  const parsed = YAML.parse(content) as TopLevelStorageOverrideFile;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Storage override file ${filePath} is empty or invalid`);
  }

  if ("chain" in parsed) {
    return [normalizeOverride(filePath, parsed.chain, parsed)];
  }

  if (!parsed.chains || typeof parsed.chains !== "object") {
    throw new Error(
      `Storage override file ${filePath} must define either 'chain' or 'chains'`,
    );
  }

  return Object.entries(parsed.chains).map(([chainId, value]) =>
    normalizeOverride(filePath, chainId as ChainId, value ?? {}),
  );
};

export const loadStorageOverrideFiles = async (filePaths: string[]) =>
  (await Promise.all(filePaths.map((filePath) => loadStorageOverrideFile(filePath)))).flat();

const resolveTargetHash = async (
  chain: SandboxChain,
  at?: "best" | "finalized" | HexString,
) => {
  const info = await chain.getInfo();
  if (!at || at === "best") {
    return info.bestHash;
  }

  if (at === "finalized") {
    return info.finalizedHash;
  }

  return at;
};

export const applyChainStorageOverride = async (
  chain: SandboxChain,
  override: NormalizedChainStorageOverride,
) => {
  const targetHash = await resolveTargetHash(chain, override.at);

  if (Object.keys(override.raw).length > 0) {
    await chain.setStorageRaw(targetHash, override.raw);
  }

  if (override.decoded.length > 0) {
    await chain.setStorageDecoded(targetHash, override.decoded);
  }

  return targetHash;
};
