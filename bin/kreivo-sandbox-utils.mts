#! /usr/bin/env node

import {
  requiredArg,
  description,
  option,
  program,
  version,
  command,
} from "commander-ts";
import { RuntimeLogLevel } from "../lib/chopsticks-client.js";

import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  communityAccountInKreivo,
  sovereignAccountForCommunityInRelay,
  sovereignAccountForCommunityInSibling,
} from "../utils/community-account-ids.js";
import { printTable } from "console-table-printer";

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

  run() {}

  @command()
  async accountIds(@requiredArg("community-id") communityId: number) {
    const kusamaApi = await ApiPromise.create({
      provider: new WsProvider("wss://rpc.ibp.network/kusama"),
    });

    try {
      const kreivoAddress = await communityAccountInKreivo(
        kusamaApi,
        communityId
      );
      const childAddress = await sovereignAccountForCommunityInRelay(
        kusamaApi,
        communityId
      );
      const siblingAddress = await sovereignAccountForCommunityInSibling(
        kusamaApi,
        communityId
      );

      console.log("Addresses for CommunityId %d", communityId);
      printTable([
        {
          Location: `./Plurality { id: Index(${communityId}), part: Voice }`,
          Address: kreivoAddress,
        },
        {
          Location: `./Parachain(2281)/Plurality { id: Index(${communityId}), part: Voice }`,
          Address: childAddress,
        },
        {
          Location: `../Parachain(2281)/Plurality { id: Index(${communityId}), part: Voice }`,
          Address: siblingAddress,
        },
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      await kusamaApi.disconnect();
      process.exit(0);
    }
  }
}

const p = new Program();
