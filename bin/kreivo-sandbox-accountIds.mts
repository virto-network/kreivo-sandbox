#! /usr/bin/env node

import {
  requiredArg,
  description,
  option,
  program,
  version,
} from "commander-ts";
import { RuntimeLogLevel } from "../lib/chopsticks-client.js";

import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  sovereignAccountForCommunityInRelay,
  sovereignAccountForCommunityInSibling,
} from "../utils/community-account-ids.js";

@program()
@version("1.0.0")
@description("Displays AccountIds for a specified Community")
export class Program {
  @option(
    "-l, --runtime-log-level <logLevel>",
    "0. Off, 1. Error, 2. Warn, 3. Info, 4. Debug, 5. Trace",
    (logLevel: string) => Number(logLevel)
  )
  runtimeLogLevel: RuntimeLogLevel = RuntimeLogLevel.Info;

  async run(@requiredArg("community-id") communityId: number) {
    const kusamaApi = await ApiPromise.create({
      provider: new WsProvider("wss://sys.ibp.network/kusama"),
    });

    const childAddress = await sovereignAccountForCommunityInRelay(
      kusamaApi,
      communityId
    );
    const siblingAddress = await sovereignAccountForCommunityInSibling(
      kusamaApi,
      communityId
    );
    console.log(
      "AccountId for ./Parachain(2281)/Plurality { id: Index(%d), part: Voice }: %s",
      communityId,
      childAddress
    );
    console.log(
      "AccountId for ../Parachain(2281)/Plurality { id: Index(%d), part: Voice }: %s",
      communityId,
      siblingAddress
    );

    await kusamaApi.disconnect();
    process.exit(0);
  }
}

const p = new Program();
