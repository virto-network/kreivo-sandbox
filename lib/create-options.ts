import { ChainId, Network } from "./network.js";

import { RuntimeLogLevel } from "./chopsticks-client.js";

export type ClientCreateOptions = {
  bindServer?: boolean;
  network: Network;
  withRelay: boolean;
  withUpgrade: boolean;
  upgradeWasmPath?: string;
  wasmOverrides: Record<ChainId, string>;
  withSiblings: ChainId[];
  runtimeLogLevel: RuntimeLogLevel;
};
