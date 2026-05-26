import type { HexString } from "polkadot-api";

import type { ChainId } from "../config/network.js";

export type SerializedStorageValue = string | null;

export type SerializedStorageDiff = Record<
  string,
  {
    value: SerializedStorageValue;
    prev?: SerializedStorageValue;
  }
>;

export type SandboxNewBlockOptions = {
  type?: "best" | "finalized" | "fork";
  parent?: HexString;
  unsafeBlockHeight?: number;
  disableOnIdle?: boolean;
  mockSignatureHost?: boolean;
  transactions?: string[];
  storage?: Record<string, SerializedStorageValue>;
};

export type SandboxInfo = {
  name: string;
  chainId?: ChainId;
  paraId?: number;
  port?: number;
  wsUrl?: string;
  bestHash: HexString;
  finalizedHash: HexString;
  runtimeVersion: number;
};
