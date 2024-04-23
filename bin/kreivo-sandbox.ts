#!/usr/bin/env node  --loader ts-node/esm

import { description, option, program, version } from "commander-ts";
import { ClientCreateOptions } from "../lib/create-options.js";
import { SandboxClient } from "../lib/sandbox-client.js";
import { RuntimeLogLevel } from "../lib/chopsticks-client.js";
import { resolve } from "node:path";
import { ChainId } from "../lib/endpoints.js";

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
    "-s, --with-siblings <siblingIds>",
    "Include a connection to sibling parachains (e.g. asset-hub)",
    (chains: string) => chains.split(",")
  )
  withSiblings: ChainId[] = [];

  @option(
    "-l, --runtime-log-level <logLevel>",
    "0. Off, 1. Error, 2. Warn, 3. Info, 4. Debug, 5. Trace",
    (logLevel: string) => Number(logLevel)
  )
  runtimeLogLevel: RuntimeLogLevel = RuntimeLogLevel.Info;

  async run() {
    await new SandboxClient(this._optionValues).initialize();
  }
}

const p = new Program();