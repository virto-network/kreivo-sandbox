export const ChainIds = {
  relay: 0,
  assetHub: 1_000,
  encointer: 1_001,
  bridgeHub: 1_002,
  coretime: 1_003,
  people: 1_004,
  kreivo: 2_281,
} as const;

export type ChainId = keyof typeof ChainIds;
export type SiblingChainId = Exclude<ChainId, "relay" | "kreivo">;
export type ChainRole = "relay" | "parachain";

export type ChainProfile = {
  chainId: ChainId;
  id: (typeof ChainIds)[ChainId];
  paraId?: number;
  role: ChainRole;
  relayChainId?: "relay";
  defaultPort: number;
};

export const defaultPortForChain = (
  chainId: ChainId,
  basePort = 10_000,
) => basePort + ChainIds[chainId];

export const CHAIN_PROFILES: Record<ChainId, ChainProfile> = {
  relay: {
    chainId: "relay",
    id: ChainIds.relay,
    role: "relay",
    defaultPort: defaultPortForChain("relay"),
  },
  assetHub: {
    chainId: "assetHub",
    id: ChainIds.assetHub,
    paraId: ChainIds.assetHub,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("assetHub"),
  },
  encointer: {
    chainId: "encointer",
    id: ChainIds.encointer,
    paraId: ChainIds.encointer,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("encointer"),
  },
  bridgeHub: {
    chainId: "bridgeHub",
    id: ChainIds.bridgeHub,
    paraId: ChainIds.bridgeHub,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("bridgeHub"),
  },
  coretime: {
    chainId: "coretime",
    id: ChainIds.coretime,
    paraId: ChainIds.coretime,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("coretime"),
  },
  people: {
    chainId: "people",
    id: ChainIds.people,
    paraId: ChainIds.people,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("people"),
  },
  kreivo: {
    chainId: "kreivo",
    id: ChainIds.kreivo,
    paraId: ChainIds.kreivo,
    role: "parachain",
    relayChainId: "relay",
    defaultPort: defaultPortForChain("kreivo"),
  },
};

export const ALL_CHAIN_IDS = Object.keys(ChainIds) as ChainId[];
export const ALL_SIBLING_CHAIN_IDS = ALL_CHAIN_IDS.filter(
  (chainId): chainId is SiblingChainId =>
    chainId !== "relay" && chainId !== "kreivo",
);

export const getChainProfile = (chainId: ChainId) => CHAIN_PROFILES[chainId];
