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
const ALICE = keyring.addFromUri("//Alice");
const BOB = keyring.addFromUri("//Bob");

console.log("ALICE", ALICE.address);
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
