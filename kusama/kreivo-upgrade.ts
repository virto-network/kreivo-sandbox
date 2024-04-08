import {
  BuildBlockMode,
  ChopsticksProvider,
  setStorage,
  setupWithServer,
  StorageValues,
} from "@acala-network/chopsticks";
import { createHash } from "node:crypto";
import { readFile, open, type FileHandle } from "node:fs/promises";

import { connectVertical } from "@acala-network/chopsticks-core";

import { ApiPromise, Keyring } from "@polkadot/api";
import { waitReady } from "@polkadot/wasm-crypto";
import { u8aToHex } from "@polkadot/util";
import { blake2b } from "hash-wasm";

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

await waitReady();
const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });
const ALICE = keyring.addFromUri("//Alice");
const BOB = keyring.addFromUri("//Bob");

console.log(`

===== SUDO Updating to ALICE =====

`);

console.log("ALICE", ALICE.address);
console.log("BOB", BOB.address);

setStorage(kreivo.chain, {
  System: {
    Account: [
      [
        [ALICE.address],
        {
          providers: 1,
          data: {
            free: 1e15,
          },
        },
      ],
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
  Sudo: {
    Key: ALICE.address,
  },
} as StorageValues);

console.log(`

===== SUDO Updated: Now is ALICE =====

`);

console.log("Connect Kusama > Kreivo");
await connectVertical(kusama.chain, kreivo.chain);

const newWasmRuntimePath = `${process.cwd()}/kreivo_runtime.compact.compressed.wasm`;
const newWasmRuntime = await readFile(newWasmRuntimePath);
const hash = await blake2b(newWasmRuntime, 256);

const api = await ApiPromise.create({
  provider: new ChopsticksProvider(kreivo.chain),
});

// code hash 0x202130657ca14921309a4dd111a5f5fcde3ea7924b786cc50ff56ccb0399e019?
console.log("code hash", hash);

console.log("Authorizing upgrade");
await api.tx.sudo
  .sudo(api.tx.parachainSystem.authorizeUpgrade(`0x${hash}`, true))
  .signAndSend(ALICE);

console.log("Enacting authorized upgrade");
await api.tx.parachainSystem
  .enactAuthorizedUpgrade(u8aToHex(newWasmRuntime))
  .signAndSend(BOB);

for (let i = 0; i < 900; i++) {
  await kusama.chain.newBlock();
  await kreivo.chain.newBlock();
}

const runtimeVersion = await api.rpc.state.getRuntimeVersion();
console.log(runtimeVersion.toHuman(true));
