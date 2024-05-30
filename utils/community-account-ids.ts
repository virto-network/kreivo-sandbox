import { ApiPromise } from "@polkadot/api";
import { encodeAddress } from "@polkadot/util-crypto";
import { createBLAKE2b } from "hash-wasm";

function registerTypes(api: ApiPromise) {
  api.registerTypes({
    HashedDescriptor: "Vec<u8>",
    "FamilyDescriptor<Child>": "([u8; 10], Compact<u32>, Vec<u8>)",
    "FamilyDescriptor<Sibling>": "([u8; 12], Compact<u32>, Vec<u8>)",
    BodyDescriptor: "([u8; 4], XcmV3JunctionBodyId, XcmV3JunctionBodyPart)",
    CommunityAccount: "([u8; 12], u16, [u8; 18])",
  });
}

export async function communityAccountInKreivo(
  api: ApiPromise,
  communityId: number
) {
  registerTypes(api);

  const address = api.createType("CommunityAccount", [
    "modlkv/cmtys",
    communityId,
    Array(18).fill(0),
  ]);

  return encodeAddress(address.toU8a(), 2);
}

export async function sovereignAccountForCommunityInRelay(
  api: ApiPromise,
  communityId: number
) {
  registerTypes(api);

  // (0, X1(Plurality { id, part }))
  const interior = api.createType("BodyDescriptor", [
    "Body", // Body
    {
      Index: communityId,
    },
    {
      Voice: null,
    },
  ]);

  // (0, X1(Parachain(2281)))
  const family = api.createType("FamilyDescriptor<Child>", [
    "ChildChain",
    2281,
    api.createType("Vec<u8>", [...interior.toU8a()]),
  ]);

  let hasher = await createBLAKE2b(256);
  hasher.update(family.toU8a());

  return encodeAddress(hasher.digest("binary"), 2);
}

export async function sovereignAccountForCommunityInSibling(
  api: ApiPromise,
  communityId: number
) {
  registerTypes(api);

  // (0, X1(Plurality { id, part }))
  const interior = api.createType("BodyDescriptor", [
    "Body", // Body
    {
      Index: communityId,
    },
    {
      Voice: null,
    },
  ]);

  // (1, X1(Parachain(2281)))
  const family = api.createType("FamilyDescriptor<Sibling>", [
    "SiblingChain",
    2281,
    api.createType("Vec<u8>", [...interior.toU8a()]),
  ]);

  let hasher = await createBLAKE2b(256);
  hasher.update(family.toU8a());

  return encodeAddress(hasher.digest("binary"), 2);
}
