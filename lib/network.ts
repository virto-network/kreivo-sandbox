export enum ChainIds {
  relay,
  assetHub = 1000,
  encointer = 1001,
  bridgeHub = 1002,
  coretime = 1003,
  people = 1004,
  kreivo = 2281,
}

export type ChainId = keyof typeof ChainIds;

export interface Network {
  getEndpoint(chainId: ChainId): string | string[];
}
