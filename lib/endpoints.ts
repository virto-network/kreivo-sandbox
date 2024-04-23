export enum ChainIds {
  assetHub,
  relay,
  kreivo,
}

export type ChainId = keyof typeof ChainIds;

export class Endpoint {
  static endpoints: Record<ChainId, string> = {
    assetHub: "wss://sys.ibp.network/statemine",
    relay: "wss://sys.ibp.network/kusama",
    kreivo: "wss://kreivo.io",
  };

  static get(chainId: ChainId) {
    return this.endpoints[chainId];
  }
}
