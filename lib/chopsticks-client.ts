import {
  Blockchain,
  BuildBlockMode,
  ChopsticksProvider,
  setup,
  setupWithServer,
} from "@acala-network/chopsticks";
import { ApiPromise } from "@polkadot/api";

export enum RuntimeLogLevel {
  Off = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Trace = 5,
}

export type ClientInitializationOptions = {
  withServer?: boolean;
  runtimeLogLevel?: RuntimeLogLevel;
};

export class ChopsticksClient {
  constructor(private endpoint: string) {}

  private chain?: Blockchain;
  private provider?: ChopsticksProvider;
  #api?: ApiPromise;

  async initialize({
    withServer = false,
    runtimeLogLevel = RuntimeLogLevel.Info,
  }: ClientInitializationOptions = {}) {
    if (!withServer) {
      this.chain = await setup({
        buildBlockMode: BuildBlockMode.Instant,
        endpoint: this.endpoint,
        runtimeLogLevel,
      });
    } else {
      const { chain } = await setupWithServer({
        "build-block-mode": BuildBlockMode.Instant,
        endpoint: this.endpoint,
        port: 8000,
        "runtime-log-level": runtimeLogLevel,
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
