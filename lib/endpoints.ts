export enum ChainIds {
  assetHub,
  relay,
  kreivo,
}

export type ChainId = keyof typeof ChainIds;

export class Endpoint {
  static endpoints: Record<ChainId, string> = {
    assetHub: process.env.ASSET_HUB_ENDPOINT  || "wss://sys.ibp.network/statemine",
    relay: process.env.KUSAMA_ENDPOINT || "wss://sys.ibp.network/kusama",
    kreivo: process.env.KREIVO_ENDPOINT || "wss://kreivo.io",
  };

  static get(chainId: ChainId) {
    return this.endpoints[chainId];
  }
}
