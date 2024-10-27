import { ChainId, Network } from "../network.js";

export class KusamaNetwork implements Network {
  static endpoints: Record<ChainId, string | string[]> = {
    kreivo: process.env.KREIVO_ENDPOINT || [
      "wss://kreivo.kippu.rocks",
      "wss://kreivo.io",
    ],
    relay: process.env.KUSAMA_ENDPOINT || [
      "wss://kusama-rpc.dwellir.com",
      "wss://rpc.ibp.network/kusama",
    ],
    assetHub: process.env.ASSET_HUB_ENDPOINT || [
      "wss://asset-hub-kusama-rpc.dwellir.com",
      "wss://sys.ibp.network/statemine",
    ],
    bridgeHub: process.env.BRIDGE_HUB || [
      "wss://bridge-hub-kusama-rpc.dwellir.com",
      "wss://sys.ibp.network/bridgehub-kusama",
    ],
    coretime: process.env.CORETIME_ENDPOINT || [
      "wss://coretime-kusama-rpc.dwellir.com",
      "wss://sys.ibp.network/coretime-kusama",
    ],
    people: process.env.PEOPLE_ENDPOINT || [
      "wss://people-kusama-rpc.dwellir.com",
      "wss://sys.ibp.network/people-kusama",
    ],
    encointer: process.env.ENCOINTER_ENDPOINT || [
      "wss://encointer-kusama-rpc.dwellir.com",
      "wss://sys.ibp.network/encointer-kusama",
    ],
  };

  getEndpoint(chainId: ChainId) {
    return KusamaNetwork.endpoints[chainId];
  }
}
