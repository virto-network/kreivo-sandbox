#! /usr/bin/env node

import {
  requiredArg,
  command,
  description,
  option,
  program,
  version,
} from "commander-ts";
import { ClientCreateOptions } from "../lib/create-options.js";
import { SandboxClient } from "../lib/sandbox-client.js";
import { RuntimeLogLevel } from "../lib/chopsticks-client.js";
import { resolve } from "node:path";
import { ChainId, ChainIds } from "../lib/endpoints.js";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { sovereignAccountForCommunityInRelay } from "../utils/community-account-ids.js";

@program()
@version("1.0.0")
@description(
  "Allows launching and deploying sandbox environments to safely test features for Kreivo"
)
export class Program {
  private _optionValues: ClientCreateOptions = {
    withRelay: true,
    withUpgrade: false,
    withSiblings: [],
    runtimeLogLevel: RuntimeLogLevel.Info,
    wasmOverrides: {} as unknown as Record<ChainId, string>,
  };

  @option(
    "-R, --with-relay",
    "Include a connection with the Relay Chain. Useful to test XCM commands."
  )
  withRelay = true;

  @option("-U, --with-upgrade", "Whether to perform an upgrade action")
  withUpgrade = false;

  @option(
    "-w, --upgrade-wasm-path <path>",
    "The path for which to upgrade from",
    (path: string) => resolve(process.cwd(), path),
    resolve(process.cwd(), "./kreivo_runtime.compact.compressed.wasm")
  )
  upgradeWasmPath?: string;

  @option(
    "-W, --wasm-overrides <chainId:path..., >",
    "A list of chainId:path items that resolves how to override the WASM binary for a chain's runtime",
    (resolves: string) =>
      resolves
        .split(",")
        .map((x) => x.split(":") as [ChainId, string])
        .reduce(
          (resolves, [chainId, path]) => ({
            [chainId]: resolve(process.cwd(), path),
            ...resolves,
          }),
          {} as Record<ChainId, string>
        ),
    {}
  )
  wasmOverrides?: Record<ChainId, string>;

  @option(
    "-s, --with-siblings <siblingIds>",
    "Include a connection to sibling parachains (e.g. asset-hub)",
    (chains: string) => chains.split(","),
    []
  )
  withSiblings: ChainId[] = [];

  @option(
    "-l, --runtime-log-level <logLevel>",
    "0. Off, 1. Error, 2. Warn, 3. Info, 4. Debug, 5. Trace",
    (logLevel: string) => Number(logLevel)
  )
  runtimeLogLevel: RuntimeLogLevel = RuntimeLogLevel.Info;

  async run() {
    console.log(this);

    await new SandboxClient(this._optionValues).initialize();
  }

  // @command()
  // async accountIds(@requiredArg("community-id") communityId: number) {
  //   const kusamaApi = await ApiPromise.create({
  //     provider: new WsProvider("wss://sys.ibp.network/kusama"),
  //     types: {
  //       HashedDescriptor: "Vec<u8>",
  //       "FamilyDescriptor<Child>": "([u8; 10], Compact<u32>, Vec<u8>)",
  //       BodyDescriptor: "([u8; 4], XcmV3JunctionBodyId, XcmV3JunctionBodyPart)",
  //     },
  //   });

  //   const address = await sovereignAccountForCommunityInRelay(
  //     kusamaApi,
  //     communityId
  //   );
  //   console.log(
  //     "AccountId for ./Parachain(2281)/Plurality { id: Index(%d), part: Voice }: %s",
  //     communityId,
  //     address
  //   );

  //   await kusamaApi.disconnect();
  //   process.exit(0);
  // }
}

const p = new Program();
