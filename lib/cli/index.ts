import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { input, confirm, select } from "@inquirer/prompts";
import type { LookupEntry } from "@polkadot-api/metadata-builders";
import { Command, InvalidArgumentError } from "commander";
import { printTable } from "console-table-printer";
import { Binary, Enum } from "polkadot-api";
import { createWsClient } from "polkadot-api/ws";
import YAML from "yaml";

import {
  createSandbox,
  createSandboxRegistry,
  createSandboxControlClient,
  endpoints,
  getGovernanceOriginModel,
  readSandboxManifest,
  replayBlock,
  scheduleGovernanceOutcome,
  serveMcpHttp,
  writeSandboxManifest,
  type ChainId,
  type CreateSandboxOptions,
  type DelayModeInput,
  type GovernanceTarget,
} from "../index.js";

const DEFAULT_MANIFEST_PATH = ".kreivo-sandbox.yml";
const DEFAULT_UPGRADE_WASM_PATH = "./kreivo_runtime.compact.compressed.wasm";

const parseNetwork = (value: string) => {
  if (value !== "kusama" && value !== "paseo") {
    throw new InvalidArgumentError(`Unsupported network '${value}'`);
  }

  return value;
};

const parseBlockSelector = (value: string) => {
  return /^\d+$/.test(value) ? Number(value) : value;
};

const parseRuntimeLogLevel = (value: string): CreateSandboxOptions["logLevel"] => {
  const normalized = value.trim().toLowerCase();
  if (["0", "silent"].includes(normalized)) return "silent";
  if (["1", "error"].includes(normalized)) return "error";
  if (["2", "warn"].includes(normalized)) return "warn";
  if (["3", "info"].includes(normalized)) return "info";
  if (["4", "debug"].includes(normalized)) return "debug";
  if (["5", "trace"].includes(normalized)) return "trace";
  throw new InvalidArgumentError(`Unsupported log level '${value}'`);
};

const parseRuntimeTraceLevel = (value: string): 0 | 1 | 2 | 3 | 4 | 5 => {
  const normalized = value.trim().toLowerCase();
  if (["0", "silent"].includes(normalized)) return 0;
  if (["1", "error"].includes(normalized)) return 1;
  if (["2", "warn"].includes(normalized)) return 2;
  if (["3", "info"].includes(normalized)) return 3;
  if (["4", "debug"].includes(normalized)) return 4;
  if (["5", "trace"].includes(normalized)) return 5;
  throw new InvalidArgumentError(`Unsupported replay runtime log level '${value}'`);
};

const parseDelayMode = (value: string): DelayModeInput => {
  if (value === "manual") {
    return "manual";
  }

  const [, timer] = value.match(/^timer:(\d+)$/) ?? [];
  if (!timer) {
    throw new InvalidArgumentError(
      `Delay mode must be 'manual' or 'timer:<ms>', got '${value}'`,
    );
  }

  return { timer: Number(timer) };
};

const parseChainPathMap = (value: string) =>
  Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [chainId, filePath] = entry.split(/[:=]/, 2) as [ChainId, string];
        if (!chainId || !filePath) {
          throw new InvalidArgumentError(
            `Expected runtime override entry in the form chainId:path, got '${entry}'`,
          );
        }

        return [chainId, resolve(process.cwd(), filePath)];
      }),
  ) as Partial<Record<ChainId, string>>;

const parseCommaList = (value?: string) =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const resolveSiblingSelection = (network: "kusama" | "paseo", value?: string) => {
  if (!value) {
    return [] as ChainId[];
  }

  if (value === "all") {
    return endpoints.siblings(network);
  }

  return parseCommaList(value) as ChainId[];
};

const parsePositiveInteger = (value: string) => {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`Expected a positive integer, got '${value}'`);
  }

  return Number(value);
};

const parseRegisterId = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new InvalidArgumentError("Sandbox registration id cannot be empty");
  }

  return normalized;
};

const validateHex = (value: string) => {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new InvalidArgumentError(`Expected a 0x-prefixed hex string, got '${value}'`);
  }

  return value;
};

const parseStructuredInput = (value: string) => {
  if (!value.trim()) {
    throw new Error("Structured input cannot be empty");
  }

  return YAML.parse(value);
};

const promptScalarValue = async (entry: LookupEntry, message: string) => {
  const value = await input({ message });
  switch (entry.type) {
    case "primitive":
      switch (entry.value) {
        case "bool":
          return ["true", "1", "yes", "y"].includes(value.toLowerCase());
        case "u64":
        case "u128":
        case "u256":
        case "i64":
        case "i128":
        case "i256":
          return BigInt(value);
        case "u8":
        case "u16":
        case "u32":
        case "i8":
        case "i16":
        case "i32":
          return Number(value);
        default:
          return value;
      }
    case "compact":
      return ["u64", "u128", "u256"].includes(entry.size) ? BigInt(value) : Number(value);
    case "AccountId32":
    case "AccountId20":
      return value;
    default:
      return parseStructuredInput(value);
  }
};

const promptLookupValue = async (
  entry: LookupEntry,
  label: string,
): Promise<unknown> => {
  switch (entry.type) {
    case "primitive":
    case "compact":
    case "AccountId20":
    case "AccountId32":
      return promptScalarValue(entry, `${label}:`);
    case "void":
      return undefined;
    case "option": {
      const hasValue = await confirm({
        message: `${label}: include a value?`,
        default: false,
      });
      return hasValue ? promptLookupValue(entry.value, label) : undefined;
    }
    case "struct": {
      const result: Record<string, unknown> = {};
      for (const [fieldName, fieldValue] of Object.entries(entry.value)) {
        result[fieldName] = await promptLookupValue(fieldValue, `${label}.${fieldName}`);
      }
      return result;
    }
    case "tuple": {
      const result: unknown[] = [];
      for (const [index, value] of entry.value.entries()) {
        result.push(await promptLookupValue(value, `${label}[${index}]`));
      }
      return result;
    }
    case "sequence":
    case "array":
    case "enum":
    case "result":
    case "bitSequence": {
      if (entry.type === "enum") {
        const choice = await select({
          message: `${label}: select an origin variant`,
          choices: [
            ...Object.entries(entry.value)
              .sort(([, left], [, right]) => left.idx - right.idx)
              .map(([name, value]) => ({
                name,
                value: name,
                description: entry.innerDocs[name]?.join(" ") || value.type,
              })),
            {
              name: "Custom SON/YAML",
              value: "__custom__",
              description: "Paste a JSON or YAML origin object",
            },
          ],
        });

        if (choice === "__custom__") {
          return parseStructuredInput(
            await input({ message: `${label}: paste SON/YAML for the full origin value` }),
          );
        }

        const variant = entry.value[choice];
        if (variant.type === "void") {
          return Enum(choice);
        }

        if (variant.type === "lookupEntry") {
          return Enum(choice, await promptLookupValue(variant.value, `${label}.${choice}`));
        }

        return Enum(
          choice,
          await promptLookupValue(
            variant as unknown as LookupEntry,
            `${label}.${choice}`,
          ),
        );
      }

      return parseStructuredInput(
        await input({
          message: `${label}: paste a JSON/YAML value for this ${entry.type}`,
        }),
      );
    }
    default:
      return parseStructuredInput(
        await input({ message: `${label}: paste a JSON/YAML value` }),
      );
  }
};

const createRemoteGovernanceTarget = (
  chainId: ChainId,
  wsUrl: string,
): GovernanceTarget => {
  const client = createWsClient(wsUrl);
  const control = createSandboxControlClient(wsUrl);

  return {
    getAgenda: (blockNumber: number, at: string) =>
      client.getUnsafeApi().query.Scheduler.Agenda.getValue(blockNumber, {
        at,
      }) as Promise<unknown[] | undefined>,
    getInfo: async () => {
      const info = await control.info();
      return {
        ...info,
        chainId,
      };
    },
    getMetadata: (hash: string) => client.getMetadata(hash),
    setStorageRaw: async (hash: string, changes: Record<string, string | Uint8Array | null>) => {
      await client._request("dev_setStorage", [
        Object.entries(changes).map(([key, value]) => [
          key,
          value instanceof Uint8Array ? Binary.toHex(value) : value,
        ]),
        hash,
      ]);
    },
  };
};

const printSandboxTable = async (sandbox: Awaited<ReturnType<typeof createSandbox>>) => {
  printTable(
    await Promise.all(
      [...sandbox.chains.values()].map(async (chain) => {
        const info = await chain.getInfo();
        return {
          chain: info.chainId ?? info.name,
          paraId: info.paraId ?? "relay",
          port: info.port ?? "-",
          wsUrl: info.wsUrl ?? "-",
          runtimeVersion: info.runtimeVersion,
          best: info.bestHash,
          finalized: info.finalizedHash,
        };
      }),
    ),
  );
};

type StartCommandOptions = {
  atBlock?: number | string;
  blockMode: DelayModeInput;
  finalizeMode: DelayModeInput;
  host: string;
  manifest: string;
  mcp: boolean;
  mcpHost: string;
  mcpPort: number;
  network: "kusama" | "paseo";
  register?: string;
  runtimeLogLevel: CreateSandboxOptions["logLevel"];
  runtimeWasmOverride: Partial<Record<ChainId, string>>;
  storageOverrideFile: string[];
  upgradeWasmPath?: string;
  withRelay: boolean;
  withSiblings?: string;
  withUpgrade: boolean;
};

const runStartAction = async (options: StartCommandOptions) => {
  if (options.register && !options.mcp) {
    throw new Error("--register requires --mcp");
  }

  const siblings = resolveSiblingSelection(options.network, options.withSiblings);
  const upgradeWasmPath =
    options.upgradeWasmPath ?? resolve(process.cwd(), DEFAULT_UPGRADE_WASM_PATH);
  const shouldUpgrade = options.withUpgrade
    ? await access(upgradeWasmPath)
        .then(() => true)
        .catch(() => {
          throw new Error(
            `Upgrade requested but the WASM file does not exist: ${upgradeWasmPath}`,
          );
        })
    : false;

  const sandbox = await createSandbox({
    network: options.network,
    withRelay: Boolean(options.withRelay),
    siblings,
    runtimeWasmOverrides: options.runtimeWasmOverride,
    storageOverrideFiles: options.storageOverrideFile,
    atBlock: options.atBlock,
    buildBlockMode: options.blockMode,
    finalizeMode: options.finalizeMode,
    logLevel: options.runtimeLogLevel,
    serve: true,
    host: options.host,
    upgrade: shouldUpgrade ? { wasm: upgradeWasmPath } : false,
  });

  await writeSandboxManifest(options.manifest, sandbox);
  let mcpServer: Awaited<ReturnType<typeof serveMcpHttp>> | undefined;
  let sandboxId: string | undefined;

  if (options.mcp) {
    const registry = createSandboxRegistry();
    sandboxId = options.register ?? randomUUID();
    registry.register({ id: sandboxId, sandbox });
    mcpServer = await serveMcpHttp({
      host: options.mcpHost,
      port: options.mcpPort,
      registry,
    });
  }

  await printSandboxTable(sandbox);
  process.stdout.write(`\nManifest: ${options.manifest}\n`);
  if (mcpServer && sandboxId) {
    process.stdout.write(`Sandbox ID: ${sandboxId}\n`);
    process.stdout.write(`MCP endpoint: ${mcpServer.url}\n`);
  }

  let closing = false;
  const close = async () => {
    if (closing) {
      return;
    }
    closing = true;

    if (mcpServer) {
      await mcpServer.close();
    } else {
      await sandbox.destroy();
    }
    process.exit(0);
  };

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  await new Promise<void>(() => {});
};

const applyStartOptions = <T extends Command>(command: T) =>
  command
    .option("-n, --network <network>", "Network preset to use", parseNetwork, "kusama")
    .option("-R, --with-relay", "Include the relay chain", false)
    .option(
      "-s, --with-siblings <chainIds>",
      "Comma-separated sibling parachains or 'all'",
    )
    .option(
      "-W, --runtime-wasm-override <chainId:path,...>",
      "Bootstrap runtime WASM overrides by chain id",
      parseChainPathMap,
      {},
    )
    .option(
      "--storage-override-file <path>",
      "YAML file with decoded/raw storage overrides",
      (value, current: string[]) => [...current, resolve(process.cwd(), value)],
      [],
    )
    .option("--at-block <block>", "Fork a specific block number or hash", parseBlockSelector)
    .option(
      "--block-mode <mode>",
      "Block production mode: manual or timer:<ms>",
      parseDelayMode,
      { timer: 0 },
    )
    .option(
      "--finalize-mode <mode>",
      "Finalization mode: manual or timer:<ms>",
      parseDelayMode,
      { timer: 0 },
    )
    .option(
      "-l, --runtime-log-level <level>",
      "0-5 or silent/error/warn/info/debug/trace",
      parseRuntimeLogLevel,
      "info",
    )
    .option("-U, --with-upgrade", "Run an on-chain runtime upgrade after startup", false)
    .option(
      "-w, --upgrade-wasm-path <path>",
      "Runtime WASM path for the upgrade flow",
      (value) => resolve(process.cwd(), value),
    )
    .option("--host <host>", "Host to bind sandbox WS listeners", "127.0.0.1")
    .option("--mcp", "Expose this running sandbox as an MCP debug console", false)
    .option("--mcp-host <host>", "Host to bind the MCP server", "127.0.0.1")
    .option("--mcp-port <port>", "Port to bind the MCP server", parsePositiveInteger, 4224)
    .option(
      "--register <id>",
      "Register this sandbox in MCP with a stable sandbox id",
      parseRegisterId,
    )
    .option(
      "--manifest <path>",
      "YAML manifest to write for later CLI/TUI flows",
      resolve(process.cwd(), DEFAULT_MANIFEST_PATH),
    );

const buildStartCommand = () =>
  applyStartOptions(new Command("start"))
    .description("Start a sandbox topology and keep it running")
    .action(runStartAction);

const buildControlCommand = () =>
  new Command("block")
    .description("Create a block against a running sandbox chain")
    .argument("<wsUrl>", "Sandbox chain websocket URL")
    .option("--parent <hash>", "Parent hash to branch from")
    .option("--type <type>", "best, finalized, or fork", "best")
    .option("--unsafe-block-height <height>", "Override the block height", parsePositiveInteger)
    .action(async (wsUrl, options) => {
      const client = createSandboxControlClient(wsUrl);
      const hash = await client.newBlock({
        parent: options.parent,
        type: options.type,
        unsafeBlockHeight: options.unsafeBlockHeight,
      });
      process.stdout.write(`${hash}\n`);
      client.close();
    });

const buildReplayBlockCommand = () =>
  new Command("replay-block")
    .description("Replay a historical local block without mutating the sandbox head")
    .argument("<wsUrl>", "Sandbox chain websocket URL")
    .argument("<blockHash>", "Hash of the block to replay", validateHex)
    .option(
      "--runtime-log-level <level>",
      "0-5 or silent/error/warn/info/debug/trace for runtime replay logs",
      parseRuntimeTraceLevel,
      5,
    )
    .option("--no-events", "Skip decoded final System.Events output")
    .option("--no-final-storage-diff", "Skip the cumulative final storage diff")
    .action(async (wsUrl, blockHash, options) => {
      const client = createWsClient(wsUrl);

      try {
        const result = await replayBlock(
          client,
          { blockHash },
          {
            includeEvents: options.events,
            includeFinalStorageDiff: options.finalStorageDiff,
            runtimeLogLevel: options.runtimeLogLevel,
          },
        );
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } finally {
        client.destroy();
      }
    });

const buildBestCommand = () =>
  new Command("best")
    .description("Change the best head of a running sandbox chain")
    .argument("<wsUrl>", "Sandbox chain websocket URL")
    .argument("<hash>", "Hash to mark as best", validateHex)
    .action(async (wsUrl, hash) => {
      const client = createSandboxControlClient(wsUrl);
      await client.changeBest(hash);
      client.close();
    });

const buildFinalizeCommand = () =>
  new Command("finalize")
    .description("Change the finalized head of a running sandbox chain")
    .argument("<wsUrl>", "Sandbox chain websocket URL")
    .argument("<hash>", "Hash to mark as finalized", validateHex)
    .action(async (wsUrl, hash) => {
      const client = createSandboxControlClient(wsUrl);
      await client.changeFinalized(hash);
      client.close();
    });

const buildDestroyCommand = () =>
  new Command("destroy")
    .description("Destroy a running sandbox chain and close its sockets")
    .argument("<wsUrl>", "Sandbox chain websocket URL")
    .action(async (wsUrl) => {
      const client = createSandboxControlClient(wsUrl);
      await client.destroy();
      client.close();
    });

const buildGovernanceCommand = () => {
  const governance = new Command("governance").description(
    "Governance outcome emulation flows",
  );

  governance
    .command("schedule")
    .description("Interactively schedule a governance outcome into Scheduler.Agenda")
    .option(
      "--manifest <path>",
      "Sandbox manifest written by the start command",
      resolve(process.cwd(), DEFAULT_MANIFEST_PATH),
    )
    .action(async (options) => {
      const manifest = await readSandboxManifest(options.manifest);
      const chainChoices = Object.entries(manifest.chains)
        .filter(([, info]) => info?.wsUrl)
        .map(([chainId, info]) => ({
          name: chainId,
          value: chainId as ChainId,
          description: info?.wsUrl,
        }));

      if (chainChoices.length === 0) {
        throw new Error(`No running websocket chains were found in ${options.manifest}`);
      }

      const chainId = await select({
        message: "Select the sandbox chain to schedule against",
        choices: chainChoices,
      });
      const wsUrl = manifest.chains[chainId]?.wsUrl;
      if (!wsUrl) {
        throw new Error(`Sandbox manifest entry for ${chainId} does not include a wsUrl`);
      }

      const target = createRemoteGovernanceTarget(chainId, wsUrl);
      const originModel = await getGovernanceOriginModel(target);
      process.stdout.write(
        `Available top-level origins on ${chainId}: ${originModel.variants
          .map((variant) => variant.name)
          .join(", ")}\n`,
      );

      const origin = await promptLookupValue(originModel.entry, `${chainId}.origin`);
      const callData = validateHex(
        await input({ message: "Call data to schedule (0x-prefixed hex):" }),
      );
      const blockNumber = parsePositiveInteger(
        await input({ message: "Target block number for execution:" }),
      );

      const result = await scheduleGovernanceOutcome(target, {
        blockNumber,
        callData,
        origin,
      });

      process.stdout.write(
        `Scheduled governance outcome on ${chainId} at block ${result.blockNumber} using best hash ${result.bestHash}\n`,
      );
    });

  return governance;
};

export const runCli = async (argv = process.argv) => {
  const program = applyStartOptions(new Command())
    .name("kreivo-sandbox")
    .description(
      "Forklift-based sandbox orchestration for Kreivo and related relay/sibling topologies. The default command is 'start'.",
    )
    .action(runStartAction)
    .addCommand(buildStartCommand())
    .addCommand(buildControlCommand())
    .addCommand(buildReplayBlockCommand())
    .addCommand(buildBestCommand())
    .addCommand(buildFinalizeCommand())
    .addCommand(buildDestroyCommand())
    .addCommand(buildGovernanceCommand());

  await program.parseAsync(argv);
};

export const runUtilsCli = async () => {
  process.stderr.write(
    "kreivo-sandbox-utils is no longer part of this package. Community account utilities are being extracted to @virto-network/community-utilities.\n",
  );
  process.exitCode = 1;
};
