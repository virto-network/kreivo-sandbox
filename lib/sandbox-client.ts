import { ApiPromise, Keyring } from "@polkadot/api";
import { ChainId, ChainIds, Network } from "./network.js";
import {
  ChopsticksProvider,
  StorageValues,
  connectParachains,
  connectVertical,
  setStorage,
} from "@acala-network/chopsticks";

import { ChopsticksClient } from "./chopsticks-client.js";
import { ClientCreateOptions } from "./create-options.js";
import assert from "node:assert";
import { blake2b } from "hash-wasm";
import { readFile } from "node:fs/promises";
import { u8aToHex } from "@polkadot/util";
import { waitReady } from "@polkadot/wasm-crypto";

export class SandboxClient {
  private network: Network;
  private kreivoClient: ChopsticksClient;
  private relayClient?: ChopsticksClient;
  private siblingChains: [ChainId, ChopsticksClient, string | undefined][] = [];

  constructor(private createOptions: ClientCreateOptions) {
    this.network = createOptions.network;
    this.kreivoClient = new ChopsticksClient(
      this.network.getEndpoint("kreivo")
    );

    if (createOptions.withRelay) {
      this.relayClient = new ChopsticksClient(
        this.network.getEndpoint("relay")
      );
    }

    for (const siblingId of createOptions.withSiblings) {
      this.siblingChains.push([
        siblingId,
        new ChopsticksClient(this.network.getEndpoint(siblingId)),
        this.createOptions.wasmOverrides?.[siblingId],
      ]);
    }
  }

  private getPort(chainId: ChainId) {
    return 10_000 + ChainIds[chainId];
  }

  async initialize() {
    await this.kreivoClient.initialize({
      port: this.getPort("kreivo"),
      runtimeLogLevel: this.createOptions.runtimeLogLevel,
      runtimeWasmOverride: this.createOptions.wasmOverrides?.kreivo,
    });

    if (this.relayClient) {
      await this.relayClient.initialize({
        port: this.getPort("relay"),
        runtimeLogLevel: this.createOptions.runtimeLogLevel,
        runtimeWasmOverride: this.createOptions.wasmOverrides?.relay,
      });
      await connectVertical(
        this.relayClient.blockchain,
        this.kreivoClient.blockchain
      );
    }

    if (this.siblingChains.length) {
      for (const [siblingId, sibling, wasmOverride] of this.siblingChains) {
        await sibling.initialize({
          port: this.getPort(siblingId),
          runtimeLogLevel: this.createOptions.runtimeLogLevel,
          runtimeWasmOverride: wasmOverride,
        });

        if (this.relayClient) {
          await connectVertical(
            this.relayClient.blockchain,
            sibling.blockchain
          );
        }
      }

      await connectParachains([
        this.kreivoClient.blockchain,
        ...this.siblingChains.map(([, s]) => s.blockchain),
      ]);
    }

    if (this.createOptions.withUpgrade) {
      await this.runUpgrade();
    }
  }

  get chains(): { name: ChainId; id: number; client: ChopsticksClient }[] {
    return [
      ...(this.relayClient
        ? [
            {
              id: ChainIds.relay,
              name: "relay" as ChainId,
              client: this.relayClient,
            },
          ]
        : []),
      {
        id: ChainIds.kreivo,
        name: "kreivo" as ChainId,
        client: this.kreivoClient,
      },
      ...this.siblingChains.map(([name, client]) => ({
        id: ChainIds[name],
        name,
        client,
      })),
    ];
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
