import { ChainId, Network } from "../network.js";

export class PaseoNetwork implements Network {
  static endpoints: Partial<Record<ChainId, string | string[]>> = {
    // TODO: We don't have public endpoints for Kreivo de Paseo… yet.
    kreivo: process.env.KREIVO_PASEO_ENDPOINT!,
    relay: process.env.PASEO_ENDPOINT || [
      "wss://rpc.ibp.network/paseo",
      "wss://paseo-rpc.dwellir.com",
    ],
    assetHub: process.env.ASSET_HUB_PASEO_ENDPOINT || [
      "wss://sys.ibp.network/asset-hub-paseo",
      "wss://asset-hub-paseo-rpc.dwellir.com",
    ],
    bridgeHub: process.env.BRIDGE_HUB_PASEO_ENDPOINT || [
      "wss://bridge-hub-paseo.dotters.network",
    ],
    coretime: process.env.CORETIME_PASEO_ENDPOINT || [
      "wss://coretime-paseo.dotters.network",
      "wss://paseo-coretime.paranodes.io",
    ],
    people: process.env.PEOPLE_PASEO_ENDPOINT || [
      "wss://people-paseo.dotters.network",
      "wss://people-paseo.rpc.amforc.com",
    ],
  };

  getEndpoint(chainId: ChainId) {
    return PaseoNetwork.endpoints[chainId] as string | string[];
  }
}
