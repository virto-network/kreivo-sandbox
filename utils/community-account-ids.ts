import { ApiPromise } from "@polkadot/api";
import { encodeAddress } from "@polkadot/util-crypto";
import { createBLAKE2b } from "hash-wasm";

export async function sovereignAccountForCommunityInRelay(
  api: ApiPromise,
  communityId: number
) {
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
