#! /usr/bin/env node

import { description, option, program, version } from "commander-ts";
import { ClientCreateOptions } from "../lib/create-options.js";
import { SandboxClient } from "../lib/sandbox-client.js";
import { RuntimeLogLevel } from "../lib/chopsticks-client.js";
import { resolve } from "node:path";
import { ChainId } from "../lib/network.js";

import { printTable } from "console-table-printer";
import { KusamaNetwork } from "../lib/networks/kusama.js";
import { PaseoNetwork } from "../lib/networks/paseo.js";

@program()
@version("1.0.0")
@description(
  "Allows launching and deploying sandbox environments to safely test features for Kreivo"
)
export class Program {
  private _optionValues: ClientCreateOptions = {
    network: new KusamaNetwork(),
    withRelay: true,
    withUpgrade: false,
    withSiblings: [],
    runtimeLogLevel: RuntimeLogLevel.Info,
    wasmOverrides: {} as unknown as Record<ChainId, string>,
  };

  @option(
    "-n, --network <networkId>",
    "Specify which network to use (default: kusama)",
    (networkId: string) => {
      switch (networkId) {
        case "paseo":
          return new PaseoNetwork();
        case "kusama":
        default:
          return new KusamaNetwork();
      }
    },
    new KusamaNetwork()
  )
  network = new KusamaNetwork();

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
    "Include a connection to sibling parachains (assetHub, encointer, bridgeHub, coretime, people). Input the chains as a comma-separated list.",
    (chains: string) =>
      chains === "all"
        ? ([
            "assetHub",
            "encointer",
            "bridgeHub",
            "coretime",
            "people",
          ] as ChainId[])
        : chains.split(","),
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
    const sandbox = new SandboxClient(this._optionValues);

    await sandbox.initialize();

    printTable(
      await Promise.all(
        sandbox.chains.map(async ({ id, client }) => ({
          name: await client.blockchain.api.getSystemChain(),
          version: (
            await client.blockchain.head.runtimeVersion
          ).specVersion.toLocaleString(undefined, { style: "decimal" }),
          port: 10_000 + id,
          block: client.blockchain.head.number.toLocaleString(undefined, {
            style: "decimal",
          }),
        }))
      )
    );
  }
}

const p = new Program();
