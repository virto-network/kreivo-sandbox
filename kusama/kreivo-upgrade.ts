import assert from "node:assert";
import { readFile } from "node:fs/promises";

import {
  BuildBlockMode,
  ChopsticksProvider,
  setStorage,
  setupWithServer,
  StorageValues,
} from "@acala-network/chopsticks";
import { connectVertical } from "@acala-network/chopsticks-core";

import { ApiPromise, Keyring } from "@polkadot/api";
import { waitReady } from "@polkadot/wasm-crypto";
import { u8aToHex } from "@polkadot/util";
import { blake2b } from "hash-wasm";

await waitReady();
const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });

const BOB = keyring.addFromUri("//Bob");
console.log("BOB", BOB.address);

console.log("Connect Kusama");
const kusama = await setupWithServer({
  endpoint: "wss://sys.ibp.network/kusama",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8000,
});

console.log("Connect Kreivo");
const kreivo = await setupWithServer({
  endpoint: "wss://kreivo.io/",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8002,
});

console.log("Connect Kusama > Kreivo");
await connectVertical(kusama.chain, kreivo.chain);

console.log(`

===== Loading Balance to BOB =====

`);

setStorage(kreivo.chain, {
  System: {
    Account: [
      [
        [BOB.address],
        {
          providers: 1,
          data: {
            free: 1e15,
          },
        },
      ],
    ],
  },
} as StorageValues);

const newWasmRuntimePath = `${process.cwd()}/kreivo_runtime.compact.compressed.wasm`;
const newWasmRuntime = await readFile(newWasmRuntimePath);
const hash = await blake2b(newWasmRuntime, 256);

const api = await ApiPromise.create({
  provider: new ChopsticksProvider(kreivo.chain),
});

const lastRuntimeVersion = (
  await api.rpc.state.getRuntimeVersion()
).specVersion.toNumber();
const blockNumber = kreivo.chain.head.number;

console.log(`===== UPGRADE: Authorizing Upgrade =====`);

setStorage(kreivo.chain, {
  Scheduler: {
    Agenda: [
      [
        [blockNumber + 1],
        [
          {
            priority: 128,
            call: {
              Inline: api.tx.parachainSystem
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

console.log(`

===== UPGRADE: Enacting Authorized =====

`);

await api.tx.parachainSystem
  .enactAuthorizedUpgrade(u8aToHex(newWasmRuntime))
  .signAndSend(BOB);

for (let i = 0; i < 2; i++) {
  await kusama.chain.newBlock();
  await kreivo.chain.newBlock();
}

const runtimeVersion = (
  await api.rpc.state.getRuntimeVersion()
).specVersion.toNumber();

assert(runtimeVersion > lastRuntimeVersion);

await kusama.close();
await kreivo.close();

process.exit(0);
