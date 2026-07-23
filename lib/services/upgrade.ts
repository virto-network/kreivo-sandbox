import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getPolkadotSigner } from "@polkadot-api/signer";
import {
  DEV_PHRASE,
  blake2b256,
  createDerive,
  mnemonicToMiniSecret,
  sr25519,
  sr25519Derive,
  ss58Encode,
} from "@polkadot-labs/hdkd-helpers";
import { Binary, Enum } from "polkadot-api";

import type { SandboxChain } from "../core/sandbox-chain.js";

const DEFAULT_FUNDS = 1_000_000_000_000_000n;

const resolveWasm = async (wasm: string | Uint8Array) =>
  typeof wasm === "string" ? new Uint8Array(await readFile(wasm)) : wasm;

const getDevSigner = (suri = "//Bob") => {
  const derive = createDerive({
    seed: mnemonicToMiniSecret(DEV_PHRASE),
    curve: sr25519,
    derive: sr25519Derive,
  });
  const keyPair = derive(suri);

  return {
    address: ss58Encode(keyPair.publicKey, 2),
    signer: getPolkadotSigner(keyPair.publicKey, "Sr25519", keyPair.sign),
  };
};

export type RuntimeUpgradeOptions = {
  wasm: string | Uint8Array;
  signerSuri?: string;
  funds?: bigint;
  relay?: SandboxChain;
};

export const runRuntimeUpgrade = async (
  chain: SandboxChain,
  {
    wasm,
    signerSuri = "//Bob",
    funds = DEFAULT_FUNDS,
    relay,
  }: RuntimeUpgradeOptions,
) => {
  const runtimeWasm = await resolveWasm(wasm);
  const api = chain.client().getUnsafeApi();
  const { address, signer } = getDevSigner(signerSuri);
  const before = await chain.getInfo();
  const bestHeader = await chain.client().getBlockHeader(before.bestHash);
  const authorizeCall = api.tx.System.authorizeUpgradeWithoutChecks(
    Binary.toHex(blake2b256(runtimeWasm)),
  );
  const authorizeCallData = await authorizeCall.getEncodedData();
  const account = (await api.query.System.Account.getValue(address, {
    at: before.bestHash,
  })) as {
    providers?: number;
    data: {
      free: bigint;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  await chain.setStorageDecoded(before.bestHash, [
    {
      pallet: "System",
      entry: "Account",
      keyArgs: [address],
      value: {
        ...account,
        providers: Math.max(Number(account.providers ?? 0), 1),
        data: {
          ...account.data,
          free: account.data.free > funds ? account.data.free : funds,
        },
      },
    },
    {
      pallet: "Scheduler",
      entry: "Agenda",
      keyArgs: [bestHeader.number + 1],
      value: [
        {
          priority: 128,
          call: Enum("Inline", authorizeCallData),
          origin: Enum("System", Enum("Root")),
        },
      ],
    },
  ]);

  await chain.newBlock();
  if (relay) {
    await relay.newBlock();
  }

  await api.tx.System.applyAuthorizedUpgrade(Binary.toHex(runtimeWasm)).signAndSubmit(
    signer,
  );

  for (let index = 0; index < 2; index += 1) {
    await chain.newBlock();
    if (relay) {
      await relay.newBlock();
    }
  }

  const after = await chain.getInfo();
  assert(after.runtimeVersion > before.runtimeVersion, "runtime version did not increase");
};
