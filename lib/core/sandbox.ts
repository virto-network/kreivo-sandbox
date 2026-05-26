import { defaultPortForChain, type ChainId } from "../config/network.js";
import { resolvePresetEndpoints, type EndpointMap, type EndpointPresetName } from "../config/endpoints.js";
import { createSandboxChain, type CreateSandboxChainOptions, type SandboxChain } from "./sandbox-chain.js";
import { applyChainStorageOverride, loadStorageOverrideFiles } from "../services/storage-overrides.js";
import { runRuntimeUpgrade, type RuntimeUpgradeOptions } from "../services/upgrade.js";

export type CreateSandboxOptions = {
  network?: EndpointPresetName;
  endpoints?: EndpointMap;
  atBlock?: number | string;
  withRelay?: boolean;
  siblings?: ChainId[];
  runtimeWasmOverrides?: Partial<Record<ChainId, string | Uint8Array>>;
  storageOverrideFiles?: string[];
  serve?: boolean;
  host?: string;
  ports?: Partial<Record<ChainId, number>>;
  buildBlockMode?: CreateSandboxChainOptions["buildBlockMode"];
  finalizeMode?: CreateSandboxChainOptions["finalizeMode"];
  disableOnIdle?: boolean;
  mockSignatureHost?: boolean;
  logLevel?: CreateSandboxChainOptions["logLevel"];
  upgrade?: RuntimeUpgradeOptions | false;
};

const toUniqueParachainPairs = (chainIds: ChainId[]) => {
  const pairs: Array<[ChainId, ChainId]> = [];
  for (let leftIndex = 0; leftIndex < chainIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < chainIds.length; rightIndex += 1) {
      pairs.push([chainIds[leftIndex], chainIds[rightIndex]]);
    }
  }

  return pairs;
};

export class Sandbox {
  constructor(readonly chains: Map<ChainId, SandboxChain>) {}

  get(name: ChainId) {
    const chain = this.chains.get(name);
    if (!chain) {
      throw new Error(`Sandbox chain ${name} is not available`);
    }

    return chain;
  }

  async attachRelay(child: ChainId, relay: ChainId = "relay") {
    const relayChain = this.get(relay);
    const childChain = this.get(child);
    if (!relayChain.wsUrl) {
      await relayChain.listen({ port: defaultPortForChain(relay) });
    }
    await childChain.attachRelay(relayChain.wsUrl!);
  }

  async attachSibling(left: ChainId, right: ChainId) {
    const rightChain = this.get(right);
    const leftChain = this.get(left);
    if (!rightChain.wsUrl) {
      await rightChain.listen({ port: defaultPortForChain(right) });
    }
    await leftChain.attachSibling(rightChain.wsUrl!);
  }

  async runUpgrade(options: RuntimeUpgradeOptions) {
    await runRuntimeUpgrade(this.get("kreivo"), {
      ...options,
      relay: this.chains.get("relay"),
    });
  }

  async destroy() {
    await Promise.all([...this.chains.values()].map((chain) => chain.destroy()));
  }
}

export const createSandbox = async ({
  network = "kusama",
  endpoints,
  atBlock,
  withRelay = false,
  siblings = [],
  runtimeWasmOverrides = {},
  storageOverrideFiles = [],
  serve = false,
  host = "127.0.0.1",
  ports = {},
  buildBlockMode,
  finalizeMode,
  disableOnIdle,
  mockSignatureHost,
  logLevel,
  upgrade = false,
}: CreateSandboxOptions = {}) => {
  const resolvedEndpoints = {
    ...resolvePresetEndpoints(network),
    ...endpoints,
  };

  const requestedChainIds: ChainId[] = [
    ...(withRelay ? (["relay"] as const) : []),
    "kreivo",
    ...siblings,
  ];

  const chains = await Promise.all(
    requestedChainIds.map(async (chainId) => {
      const endpoint = resolvedEndpoints[chainId];
      if (!endpoint) {
        throw new Error(`No endpoint configured for chain ${chainId}`);
      }

      const chain = await createSandboxChain({
        chainId,
        endpoint,
        atBlock,
        runtimeWasmOverride: runtimeWasmOverrides[chainId],
        buildBlockMode,
        finalizeMode,
        disableOnIdle,
        mockSignatureHost,
        logLevel,
      });

      return [chainId, chain] as const;
    }),
  );

  const sandbox = new Sandbox(new Map(chains));

  if (storageOverrideFiles.length > 0) {
    const overrides = await loadStorageOverrideFiles(storageOverrideFiles);
    await Promise.all(
      overrides.map((override) =>
        applyChainStorageOverride(sandbox.get(override.chainId), override),
      ),
    );
  }

  const needsTopologySockets = withRelay || siblings.length > 0;
  if (serve || needsTopologySockets) {
    await Promise.all(
      chains.map(([, chain]) =>
        chain.listen({
          host,
          port: serve
            ? ports[chain.chainId ?? "kreivo"] ??
              (chain.chainId ? defaultPortForChain(chain.chainId) : 0)
            : ports[chain.chainId ?? "kreivo"] ?? 0,
        }),
      ),
    );
  }

  if (withRelay) {
    const relayChain = sandbox.get("relay");
    const relayChildren: ChainId[] = ["kreivo", ...siblings];
    await Promise.all(
      relayChildren.map((chainId) =>
        sandbox.get(chainId).attachRelay(relayChain.wsUrl!),
      ),
    );
  }

  const parachains: ChainId[] = ["kreivo", ...siblings];
  for (const [left, right] of toUniqueParachainPairs(parachains)) {
    await sandbox.attachSibling(left, right);
  }

  if (upgrade) {
    await sandbox.runUpgrade(upgrade);
  }

  return sandbox;
};
