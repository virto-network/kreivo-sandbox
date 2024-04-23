import { readFile } from "node:fs/promises";
import assert from "node:assert";

import { ApiPromise, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { waitReady } from "@polkadot/wasm-crypto";
import {
  connectParachains,
  connectVertical,
  ChopsticksProvider,
  setStorage,
  StorageValues,
} from "@acala-network/chopsticks";
import { blake2b } from "hash-wasm";

import { ChopsticksClient } from "./chopsticks-client.js";
import { ClientCreateOptions } from "./create-options.js";
import { Endpoint } from "./endpoints.js";

export class SandboxClient {
  private kreivoClient: ChopsticksClient;
  private relayClient?: ChopsticksClient;
  private siblingClients: ChopsticksClient[] = [];

  constructor(private createOptions: ClientCreateOptions) {
    this.kreivoClient = new ChopsticksClient(Endpoint.get("kreivo"));

    if (createOptions.withRelay) {
      this.relayClient = new ChopsticksClient(Endpoint.get("relay"));
    }

    for (const siblingId of createOptions.withSiblings) {
      this.siblingClients.push(new ChopsticksClient(Endpoint.get(siblingId)));
    }
  }

  async initialize() {
    await this.kreivoClient.initialize({
      withServer: true,
      runtimeLogLevel: this.createOptions.runtimeLogLevel,
    });

    if (this.relayClient) {
      await this.relayClient.initialize({
        withServer: true,
        runtimeLogLevel: this.createOptions.runtimeLogLevel,
      });
      await connectVertical(
        this.relayClient.blockchain,
        this.kreivoClient.blockchain
      );
    }

    if (this.siblingClients.length) {
      for (const sibling of this.siblingClients) {
        await sibling.initialize({
          withServer: true,
          runtimeLogLevel: this.createOptions.runtimeLogLevel,
        });
      }

      await connectParachains([
        this.kreivoClient.blockchain,
        ...this.siblingClients.map((s) => s.blockchain),
      ]);
    }

    if (this.createOptions.withUpgrade) {
      await this.runUpgrade();
    }
  }

  async runUpgrade() {
    const newWasmRuntime = await readFile(this.createOptions.upgradeWasmPath!);
    const hash = await blake2b(newWasmRuntime, 256);

    const api = await ApiPromise.create({
      provider: new ChopsticksProvider(this.kreivoClient.blockchain),
    });

    const lastRuntimeVersion = (
      await api.rpc.state.getRuntimeVersion()
    ).specVersion.toNumber();
    const blockNumber = this.kreivoClient.blockchain.head.number;

    console.log(`===== UPGRADE: Authorizing Upgrade =====`);

    await waitReady();
    const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });
    const BOB = keyring.addFromUri("//Bob");

    setStorage(this.kreivoClient.blockchain, {
      Scheduler: {
        Agenda: [
          [
            [blockNumber + 1],
            [
              {
                priority: 128,
                call: {
                  Inline: api.tx.parachainSystem
                    .authorizeUpgrade(`0x${hash}`, true)
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

    console.log(`

===== UPGRADE: Enacting Authorized =====

`);

    await api.tx.parachainSystem
      .enactAuthorizedUpgrade(u8aToHex(newWasmRuntime))
      .signAndSend(BOB);

    for (let i = 0; i < 2; i++) {
      await this.kreivoClient.blockchain.newBlock();
      await this.relayClient!.blockchain.newBlock();
    }

    const runtimeVersion = (
      await api.rpc.state.getRuntimeVersion()
    ).specVersion.toNumber();

    assert(runtimeVersion > lastRuntimeVersion);
  }
}
