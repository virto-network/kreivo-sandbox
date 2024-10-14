import "@polkadot/api-augment/kusama";

import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";

import { waitReady } from "@polkadot/wasm-crypto";

await waitReady();
const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });
const ALICE = keyring.addFromUri("//Alice");

const api = await ApiPromise.create({
  provider: new WsProvider(["wss://kreivo.kippu.rocks/"]),
});

const uxt = await api.tx.system.remark("Hello World").signAsync(ALICE, {
  assetId: {
    parents: 1,
    interior: {
      X3: [{ Parachain: 1000 }, { PalletInstance: 50 }, { GeneralIndex: 1984 }],
    },
  },
});

console.log(uxt.toHuman());
console.log(uxt.toHex());
process.exit(0);
