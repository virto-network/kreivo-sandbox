import { RuntimeLogLevel } from "./chopsticks-client.js";
import { ChainId } from "./endpoints.js";

export type ClientCreateOptions = {
  withRelay: boolean;
  withUpgrade: boolean;
  upgradeWasmPath?: string;
  wasmOverrides: Record<ChainId, string>;
  withSiblings: ChainId[];
  runtimeLogLevel: RuntimeLogLevel;
};
