import "@polkadot/api-augment/kusama";
import { WsProvider, ApiPromise } from "@polkadot/api";
import {
  communityAccountInKreivo,
  sovereignAccountForCommunityInRelay,
  sovereignAccountForCommunityInSibling,
} from "../utils/community-account-ids.js";

async function topupThenCreateCommunity(
  signer: KeyringPair,
  communityId: number,
  decisionMethod:
    | {
        type: "Membership";
      }
    | {
        type: "Rank";
      }
    | {
        type: "NativeToken";
      }
    | {
        type: "CommunityAsset";
        id: any;
        minVote: number;
      },
  identity: {
    name: string;
    description?: string;
    image?: string;
  }
) {
  const kusamaApi = await ApiPromise.create({
    provider: new WsProvider("ws://localhost:10000"),
  });
  const kreivoApi = await ApiPromise.create({
    provider: new WsProvider("ws://localhost:12281"),
  });
  const peopleApi = await ApiPromise.create({
    provider: new WsProvider("ws://localhost:11004"),
  });
  // Part 1: Transfer assets

  // 1a. Transfers 0.51KSM (because fees) to Kreivo
  const transferToKreivo = kusamaApi.createType("StagingXcmV4Instruction", {
    TransferReserveAsset: {
      assets: [
        {
          id: {
            parents: 0,
            Interior: "Here",
          },
          fun: {
            Fungible: 0.51e12,
          },
        },
      ],
      dest: {
        parents: 0,
        interior: {
          X1: [{ Parachain: 2281 }],
        },
      },
      xcm: [
        {
          BuyExecution: {
            fees: {
              id: {
                parents: 1,
                Interior: "Here",
              },
              fun: {
                Fungible: 0.51e12,
              },
            },
            weightLimit: "Unlimited",
          },
        },
        {
          DepositAsset: {
            assets: {
              Wild: "All",
            },
            beneficiary: {
              parents: 0,
              interior: kusamaApi.createType("StagingXcmV4Junctions", {
                X1: [
                  kusamaApi.createType("StagingXcmV4Junction", {
                    AccountId32: {
                      network: null,
                      id: signer.addressRaw,
                    },
                  }),
                ],
              }),
            },
          },
        },
      ],
    },
  });

  // 1b. Transfer 0.41KSM (because fees) to People Chain.
  // This is to support the setting of identities
  const teleportToPeople = kusamaApi.createType("StagingXcmV4Instruction", {
    InitiateTeleport: {
      assets: {
        Definite: [
          {
            id: {
              parents: 0,
              interior: "Here",
            },
            fun: {
              Fungible: 0.41e12,
            },
          },
        ],
      },
      dest: {
        parents: 0,
        interior: {
          X1: [{ Parachain: 1004 }],
        },
      },
      xcm: [
        {
          BuyExecution: {
            fees: {
              id: {
                parents: 1,
                Interior: "Here",
              },
              fun: {
                Fungible: 0.41e12,
              },
            },
            weightLimit: "Unlimited",
          },
        },
        {
          DepositAsset: {
            assets: {
              Wild: "All",
            },
            beneficiary: {
              parents: 0,
              interior: kusamaApi.createType("StagingXcmV4Junctions", {
                X1: [
                  kusamaApi.createType("StagingXcmV4Junction", {
                    AccountId32: {
                      network: null,
                      id: await sovereignAccountForCommunityInSibling(
                        kusamaApi,
                        communityId,
                        "u8a"
                      ),
                    },
                  }),
                ],
              }),
            },
          },
        },
      ],
    },
  });

  const transferAssetsExecution = kusamaApi.tx.xcmPallet.execute(
    {
      V4: [
        {
          WithdrawAsset: [
            {
              id: {
                parents: 0,
                Interior: "Here",
              },
              fun: {
                Fungible: 1e12,
              },
            },
          ],
        },
        {
          BuyExecution: {
            fees: {
              id: {
                parents: 0,
                Interior: "Here",
              },
              fun: {
                Fungible: 5e8,
              },
            },
          },
        },
        transferToKreivo,
        teleportToPeople,
        {
          RefundSurplus: null,
        },
        {
          DepositAsset: {
            assets: {
              Wild: "All",
            },
            beneficiary: {
              parents: 0,
              interior: kusamaApi.createType("StagingXcmV4Junctions", {
                X1: [
                  kusamaApi.createType("StagingXcmV4Junction", {
                    AccountId32: {
                      network: null,
                      id: signer.addressRaw,
                    },
                  }),
                ],
              }),
            },
          },
        },
      ],
    },
    {
      refTime: kusamaApi.createType("Compact<u64>", 1e10),
      proofSize: kusamaApi.createType("Compact<u64>", 1e8),
    }
  );

  let encodedDecisionMethod: unknown = {
    Membership: null,
  };
  switch (decisionMethod.type) {
    case "Rank":
      encodedDecisionMethod = {
        Rank: null,
      };
      break;
    case "NativeToken":
      encodedDecisionMethod = {
        NativeToken: null,
      };
      break;
    case "CommunityAsset":
      encodedDecisionMethod = {
        CommunityAsset: [decisionMethod.id, decisionMethod.minVote],
      };
      break;
  }

  // Part 2: Create Community, then set identities
  const createCommunity = kreivoApi.tx.communitiesManager.register(
    communityId,
    identity.name,
    {
      Id: signer.address,
    },
    encodedDecisionMethod,
    null
  );

  const createCommunityDispatchInfo =
    await kreivoApi.call.transactionPaymentCallApi.queryCallInfo(
      createCommunity.method,
      createCommunity.method.toU8a().length
    );

  const createCommunityTransact = kusamaApi.createType(
    "StagingXcmV4Instruction",
    {
      Transact: {
        originKind: "SovereignAccount",
        requireWeightAtMost: createCommunityDispatchInfo.weight,
        call: {
          encoded: createCommunity.method.toHex(),
        },
      },
    }
  );

  const setIdentities = peopleApi.tx.utility.batchAll([
    peopleApi.tx.identity.setIdentity({
      display: {
        Raw: identity.name,
      },
      image: identity.image ? { Raw: identity.image } : null,
    }),
    peopleApi.tx.identity.addSub(
      {
        Id: await sovereignAccountForCommunityInRelay(kusamaApi, communityId),
      },
      { Raw: "Sovereign Account in Kusama" }
    ),
    peopleApi.tx.identity.addSub(
      {
        Id: await communityAccountInKreivo(kusamaApi, communityId),
      },
      { Raw: "Local Account in Kreivo" }
    ),
  ]);

  const createCommunitySend = kusamaApi.tx.xcmPallet.send(
    {
      V4: {
        parents: 0,
        interior: {
          X1: [{ Parachain: 2281 }],
        },
      },
    },
    {
      V4: [
        {
          WithdrawAsset: [
            {
              id: {
                parents: 1,
                interior: "Here",
              },
              fun: {
                Fungible: 9e9,
              },
            },
          ],
        },
        {
          BuyExecution: {
            fees: {
              id: {
                parents: 1,
                interior: "Here",
              },
              fun: {
                Fungible: 9e9,
              },
            },
            weightLimit: "Unlimited",
          },
        },
        createCommunityTransact,
        {
          ExpectTransactStatus: {
            Success: null,
          },
        },
        {
          RefundSurplus: null,
        },
        {
          DepositAsset: {
            assets: {
              Wild: "All",
            },
            beneficiary: {
              parents: 0,
              interior: kusamaApi.createType("StagingXcmV4Junctions", {
                X1: [
                  kusamaApi.createType("StagingXcmV4Junction", {
                    AccountId32: {
                      network: null,
                      id: signer.addressRaw,
                    },
                  }),
                ],
              }),
            },
          },
        },
      ],
    }
  );

  return kusamaApi.tx.utility.batch([
    transferAssetsExecution,
    createCommunitySend,
  ]);
}

import { Keyring } from "@polkadot/api";
import { waitReady } from "@polkadot/wasm-crypto";
import type { KeyringPair } from "@polkadot/keyring/types";

await waitReady();

const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });
const ALICE = keyring.addFromUri("//Alice");

const tx = await topupThenCreateCommunity(
  ALICE,
  20,
  { type: "Membership" },
  {
    name: "Cubo",
  }
);

await tx.signAndSend(ALICE);

process.exit(0);
