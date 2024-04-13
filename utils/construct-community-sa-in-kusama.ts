import { ApiPromise, WsProvider } from "@polkadot/api";
import { encodeAddress } from "@polkadot/util-crypto";
import { createBLAKE2b } from "hash-wasm";

const api = await ApiPromise.create({
  provider: new WsProvider("wss://sys.ibp.network/kusama"),
  types: {
    HashedDescriptor: "Vec<u8>",
    "FamilyDescriptor<Child>": "([u8; 10], Compact<u32>, Vec<u8>)",
    BodyDescriptor: "([u8; 4], XcmV3JunctionBodyId, XcmV3JunctionBodyPart)",
  },
});

// (0, X1(Plurality { id, part }))
const interior = api.createType("BodyDescriptor", [
  "Body", // Body
  {
    Index: 1,
  },
  {
    Voice: null,
  },
]);

console.log(
  `
interior =`,
  interior.toHuman(),
  `(${interior.toHex()})`
);

// (0, X1(Parachain(2281)))
const family = api.createType("FamilyDescriptor<Child>", [
  "ChildChain",
  2281,
  api.createType("Vec<u8>", [...interior.toU8a()]),
]);

console.log(
  `
family =`,
  family.toHuman(),
  `(${family.toHex()})`
);

let hasher = await createBLAKE2b(256);
hasher.update(family.toU8a());

const address = encodeAddress(hasher.digest("binary"), 2);

console.log(
  `AccountId for ./Parachain(2281)/Plurality { id: Index(1), part: Voice }:
  ${address}`
);

await api.disconnect();
process.exit(0);
