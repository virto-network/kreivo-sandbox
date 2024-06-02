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

export class Endpoint {
  static endpoints: Record<ChainId, string> = {
    relay: process.env.KUSAMA_ENDPOINT || "wss://rpc.ibp.network/kusama",
    assetHub:
      process.env.ASSET_HUB_ENDPOINT || "wss://sys.ibp.network/statemine",
    encointer:
      process.env.ENCOINTER_ENDPOINT ||
      "wss://sys.ibp.network/encointer-kusama",
    bridgeHub:
      process.env.BRIDGE_HUB || "wss://sys.ibp.network/bridgehub-kusama",
    coretime:
      process.env.CORETIME_ENDPOINT || "wss://sys.ibp.network/coretime-kusama",
    people:
      process.env.PEOPLE_ENDPOINT || "wss://sys.ibp.network/people-kusama",
    kreivo: process.env.KREIVO_ENDPOINT || "wss://kreivo.kippu.rocks",
  };

  static get(chainId: ChainId) {
    return this.endpoints[chainId];
  }
}
