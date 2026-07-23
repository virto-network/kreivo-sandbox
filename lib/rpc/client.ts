import { createWsClient } from "polkadot-api/ws";

import type { HexString } from "polkadot-api";

import type {
  SandboxInfo,
  SandboxNewBlockOptions,
  SerializedStorageDiff,
} from "./types.js";

export type SandboxControlClient = {
  newBlock(options?: SandboxNewBlockOptions): Promise<HexString>;
  changeBest(hash: HexString): Promise<void>;
  changeFinalized(hash: HexString): Promise<void>;
  getStorageDiff(
    hash: HexString,
    baseHash?: HexString,
  ): Promise<SerializedStorageDiff>;
  destroy(): Promise<void>;
  info(): Promise<SandboxInfo>;
  close(): void;
};

export const createSandboxControlClient = (
  wsUrl: string,
): SandboxControlClient => {
  const client = createWsClient(wsUrl);

  return {
    newBlock: (options) =>
      client._request<HexString, [SandboxNewBlockOptions?]>("sandbox_newBlock", [
        options,
      ]),
    changeBest: (hash) =>
      client._request<void, [HexString]>("sandbox_changeBest", [hash]),
    changeFinalized: (hash) =>
      client._request<void, [HexString]>("sandbox_changeFinalized", [hash]),
    getStorageDiff: (hash, baseHash) =>
      client._request<SerializedStorageDiff, [HexString, HexString?]>(
        "sandbox_getStorageDiff",
        [hash, baseHash],
      ),
    destroy: () => client._request<void, []>("sandbox_destroy", []),
    info: () => client._request<SandboxInfo, []>("sandbox_info", []),
    close: () => client.destroy(),
  };
};
