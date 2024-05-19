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
    relay: "wss://sys.ibp.network/kusama",
    assetHub: "wss://sys.ibp.network/statemine",
    encointer: "wss://sys.ibp.network/encointer-kusama",
    bridgeHub: "wss://sys.ibp.network/bridgehub-kusama",
    coretime: "wss://sys.ibp.network/coretime-kusama",
    people: "wss://kusama-people-rpc.polkadot.io",
    kreivo: "wss://kreivo.kippu.rocks",
  };

  static get(chainId: ChainId) {
    return this.endpoints[chainId];
  }
}
