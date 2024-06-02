import "@polkadot/api-augment/kusama";
import { WsProvider, ApiPromise, Keyring } from "@polkadot/api";
import type { KeyringPair } from "@polkadot/keyring/types";
import { sovereignAccountForCommunityInSibling } from "../utils/community-account-ids.js";

const kusamaApi = await ApiPromise.create({
  provider: new WsProvider("ws://localhost:10000"),
});
const kreivoApi = await ApiPromise.create({
  provider: new WsProvider("ws://localhost:11004"),
});
const peopleApi = await ApiPromise.create({
  provider: new WsProvider("ws://localhost:12281"),
});

const keyring = new Keyring({ ss58Format: 2, type: "sr25519" });
const ALICE = keyring.addFromUri("//Alice");

async function topupThenCreateCommunity(
  signer: KeyringPair,
  communityId: number,
  decisionMethod:
    | {
        type: "Membership";
      }
    | {
        type: "Ranked";
      }
    | {
        type: "Native";
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
      ],
    },
    {
      refTime: kusamaApi.createType("Compact<u64>", 1e10),
      proofSize: kusamaApi.createType("Compact<u64>", 1e8),
    }
  );

  return transferAssetsExecution;
}

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
