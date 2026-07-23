import type { ChainId, SiblingChainId } from "./network.js";

export type EndpointValue = string | string[];
export type EndpointPresetName = "kusama" | "paseo";
export type EndpointMap = Partial<Record<ChainId, EndpointValue>>;

type EndpointDefinition = {
  default: EndpointValue;
  env?: string;
};

type EndpointPresetDefinition = Partial<Record<ChainId, EndpointDefinition>>;

export const endpointPresets: Record<
  EndpointPresetName,
  EndpointPresetDefinition
> = {
  kusama: {
    kreivo: {
      env: "KREIVO_ENDPOINT",
      default: ["wss://kreivo.kippu.rocks", "wss://kreivo.io"],
    },
    relay: {
      env: "KUSAMA_ENDPOINT",
      default: ["wss://kusama-rpc.dwellir.com", "wss://rpc.ibp.network/kusama"],
    },
    assetHub: {
      env: "ASSET_HUB_ENDPOINT",
      default: [
        "wss://asset-hub-kusama-rpc.dwellir.com",
        "wss://sys.ibp.network/statemine",
      ],
    },
    bridgeHub: {
      env: "BRIDGE_HUB",
      default: [
        "wss://bridge-hub-kusama-rpc.dwellir.com",
        "wss://sys.ibp.network/bridgehub-kusama",
      ],
    },
    coretime: {
      env: "CORETIME_ENDPOINT",
      default: [
        "wss://coretime-kusama-rpc.dwellir.com",
        "wss://sys.ibp.network/coretime-kusama",
      ],
    },
    people: {
      env: "PEOPLE_ENDPOINT",
      default: [
        "wss://people-kusama-rpc.dwellir.com",
        "wss://sys.ibp.network/people-kusama",
      ],
    },
    encointer: {
      env: "ENCOINTER_ENDPOINT",
      default: [
        "wss://encointer-kusama-rpc.dwellir.com",
        "wss://sys.ibp.network/encointer-kusama",
      ],
    },
  },
  paseo: {
    kreivo: {
      env: "KREIVO_PASEO_ENDPOINT",
      default: ["wss://testnet.kreivo.io", "wss://testnet.kreivo.kippu.rocks"],
    },
    relay: {
      env: "PASEO_ENDPOINT",
      default: ["wss://rpc.ibp.network/paseo", "wss://paseo-rpc.dwellir.com"],
    },
    assetHub: {
      env: "ASSET_HUB_PASEO_ENDPOINT",
      default: [
        "wss://sys.ibp.network/asset-hub-paseo",
        "wss://asset-hub-paseo-rpc.dwellir.com",
      ],
    },
    bridgeHub: {
      env: "BRIDGE_HUB_PASEO_ENDPOINT",
      default: ["wss://bridge-hub-paseo.dotters.network"],
    },
    coretime: {
      env: "CORETIME_PASEO_ENDPOINT",
      default: [
        "wss://coretime-paseo.dotters.network",
        "wss://paseo-coretime.paranodes.io",
      ],
    },
    people: {
      env: "PEOPLE_PASEO_ENDPOINT",
      default: [
        "wss://people-paseo.dotters.network",
        "wss://people-paseo.rpc.amforc.com",
      ],
    },
  },
};

export const resolvePresetEndpoints = (
  preset: EndpointPresetName,
  {
    env = process.env,
    overrides = {},
  }: {
    env?: NodeJS.ProcessEnv;
    overrides?: EndpointMap;
  } = {},
): EndpointMap => {
  const definitions = endpointPresets[preset];
  return Object.fromEntries(
    Object.entries(definitions).map(([chainId, definition]) => {
      const override = overrides[chainId as ChainId];
      const envValue = definition?.env ? env[definition.env] : undefined;

      return [chainId, override ?? envValue ?? definition?.default];
    }),
  ) as EndpointMap;
};

export const resolvePresetEndpoint = (
  preset: EndpointPresetName,
  chainId: ChainId,
  options?: {
    env?: NodeJS.ProcessEnv;
    overrides?: EndpointMap;
  },
): EndpointValue => {
  const endpoint = resolvePresetEndpoints(preset, options)[chainId];
  if (!endpoint) {
    throw new Error(`No endpoint preset is defined for ${preset}:${chainId}`);
  }

  return endpoint;
};

export const getPresetChainIds = (preset: EndpointPresetName) =>
  Object.keys(endpointPresets[preset]) as ChainId[];

export const getPresetSiblingChainIds = (preset: EndpointPresetName) =>
  getPresetChainIds(preset).filter(
    (chainId): chainId is SiblingChainId =>
      chainId !== "relay" && chainId !== "kreivo",
  );

export const endpoints = {
  presets: endpointPresets,
  resolve: resolvePresetEndpoints,
  resolveChain: resolvePresetEndpoint,
  chains: getPresetChainIds,
  siblings: getPresetSiblingChainIds,
};
