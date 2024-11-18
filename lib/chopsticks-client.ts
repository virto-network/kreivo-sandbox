import {
  Blockchain,
  BuildBlockMode,
  ChopsticksProvider,
  setup,
  setupWithServer,
} from "@acala-network/chopsticks";

import { ApiPromise } from "@polkadot/api";
import { overrideWasm } from "@acala-network/chopsticks/utils/override";

export enum RuntimeLogLevel {
  Off = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Trace = 5,
}

export type ClientInitializationOptions = {
  port?: number;
  runtimeLogLevel?: RuntimeLogLevel;
  runtimeWasmOverride?: string;
};

export class ChopsticksClient {
  constructor(private endpoint: string | string[]) {}

  private chain?: Blockchain;
  private provider?: ChopsticksProvider;
  #api?: ApiPromise;

  async initialize({
    port,
    runtimeLogLevel = RuntimeLogLevel.Info,
    runtimeWasmOverride,
  }: ClientInitializationOptions = {}) {
    if (!port) {
      this.chain = await setup({
        buildBlockMode: BuildBlockMode.Instant,
        endpoint: this.endpoint,
        runtimeLogLevel,
      });
      await overrideWasm(this.chain, runtimeWasmOverride);
    } else {
      const { chain } = await setupWithServer({
        "build-block-mode": BuildBlockMode.Instant,
        endpoint: this.endpoint,
        port,
        "runtime-log-level": runtimeLogLevel,
        "wasm-override": runtimeWasmOverride,
      });

      this.chain = chain;
    }

    const provider = new ChopsticksProvider(this.chain);
    this.provider = provider;

    this.#api = new ApiPromise({ provider });
    await this.#api.isReady;

    return this;
  }

  async close() {
    await this.api?.disconnect();
    await this.provider?.disconnect();

    await this.chain?.db?.close();
    await this.chain?.api?.disconnect();
    await this.chain?.close();
  }

  get api() {
    return this.#api!;
  }

  get blockchain() {
    return this.chain!;
  }
}
