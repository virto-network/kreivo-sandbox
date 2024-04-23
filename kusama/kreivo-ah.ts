import { readFile } from "fs/promises";

import {
  BuildBlockMode,
  ChopsticksProvider,
  setStorage,
  setupWithServer,
  StorageValues,
} from "@acala-network/chopsticks";
import {
  connectParachains,
  connectVertical,
} from "@acala-network/chopsticks-core";

import { ApiPromise } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { blake2b } from "hash-wasm";

console.log("Connect Kusama");
const kusama = await setupWithServer({
  endpoint: "wss://sys.ibp.network/kusama",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8000,
});

console.log("Connect AH");
const assetHub = await setupWithServer({
  endpoint: "wss://kusama-asset-hub-rpc.polkadot.io",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8001,
  "wasm-override":
    "/Users/pandres95/Documents/Virto/Development/OSS/runtimes/target/release/wbuild/asset-hub-kusama-runtime/asset_hub_kusama_runtime.compact.compressed.wasm",
});

console.log("Connect Kreivo");
const kreivo = await setupWithServer({
  endpoint: "wss://kreivo.io/",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8002,
  "wasm-override": "kreivo_runtime.compact.compressed.wasm",
});

setStorage(assetHub.chain, {
  ForeignAssets: {
    Account: [
      [
        [
          {
            parents: 2,
            interior: {
              X1: {
                GlobalConsensus: "Polkadot",
              },
            },
          },
          "HUf7Nvfhp85yFZm31zV2ux8h1946Bzzmos2jqGGhp3bWXD4",
        ],
        {
          balance: "443685799872",
          status: "Liquid",
          reason: "Sufficient",
          extra: null,
        },
      ],
    ],
  },
  Assets: {
    Account: [
      [
        [[1984], "HUf7Nvfhp85yFZm31zV2ux8h1946Bzzmos2jqGGhp3bWXD4"],
        {
          balance: "443685799872",
          status: "Liquid",
          reason: "Sufficient",
          extra: null,
        },
      ],
    ],
  },
} as StorageValues);

console.log("Connect Kreivo <> AH");
await connectParachains([assetHub.chain, kreivo.chain]);
console.log("Connect Kusama > AH");
await connectVertical(kusama.chain, assetHub.chain);
console.log("Connect Kusama > Kreivo");
await connectVertical(kusama.chain, kreivo.chain);

let blockNumber = kreivo.chain.head.number;

const kreivoApi = await ApiPromise.create({
  provider: new ChopsticksProvider(kreivo.chain),
});

const newWasmRuntimePath = `${process.cwd()}/kreivo_runtime.compact.compressed.wasm`;
const newWasmRuntime = await readFile(newWasmRuntimePath);
const hash = await blake2b(newWasmRuntime, 256);

setStorage(kreivo.chain, {
  Scheduler: {
    Agenda: [
      [
        [blockNumber + 1],
        [
          {
            priority: 128,
            call: {
              Inline: kreivoApi.tx.parachainSystem
                .authorizeUpgrade(`0x${hash}`, false)
                .method.toHex(),
            },
            origin: {
              System: "Root",
            },
          },
        ],
      ],
    ],
  },
} as StorageValues);

await kreivo.chain.newBlock();

blockNumber = kreivo.chain.head.number;

setStorage(kreivo.chain, {
  Scheduler: {
    Agenda: [
      [
        [blockNumber + 1],
        [
          {
            priority: 128,
            call: {
              Inline: kreivoApi.tx.parachainSystem
                .enactAuthorizedUpgrade(u8aToHex(newWasmRuntime))
                .method.toHex(),
            },
            origin: {
              System: "Root",
            },
          },
        ],
      ],
    ],
  },
} as StorageValues);

await kreivo.chain.newBlock();
await kreivo.chain.newBlock();
