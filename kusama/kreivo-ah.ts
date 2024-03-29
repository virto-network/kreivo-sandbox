import {
  BuildBlockMode,
  setStorage,
  setupWithServer,
  StorageValues,
} from "@acala-network/chopsticks";
import {
  connectParachains,
  connectVertical,
} from "@acala-network/chopsticks-core";
import { WsProvider } from "@polkadot/rpc-provider";

console.log("Connect Kusama");
const kusama = await setupWithServer({
  endpoint: "wss://sys.ibp.network/kusama",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8000,
});

console.log("Connect AH");
const assetHub = await setupWithServer({
  endpoint: "wss://sys.ibp.network/statemine",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8001,
});

console.log("Connect Kreivo");
const kreivo = await setupWithServer({
  endpoint: "ws://localhost:20000/",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8002,
});

setStorage(kusama.chain, {
  System: {
    Account: [
      [
        ["HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F"],
        {
          data: {
            free: 1000000000000000,
          },
          providers: 1,
        },
      ],
    ],
  },
} as StorageValues);

setStorage(assetHub.chain, {
  Assets: {
    Account: [
      [
        [1984, "HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F"],
        {
          balance: 1000000000000000,
          status: "Liquid",
          reason: "Sufficient",
        },
      ],
    ],
  },
  System: {
    Account: [
      [
        ["HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F"],
        {
          data: {
            free: 1000000000000000,
          },
          providers: 1,
        },
      ],
    ],
  },
} as StorageValues);

setStorage(kreivo.chain, {
  Assets: {
    Asset: [
      [
        [
          {
            sibling: {
              id: 1000,
              pallet: 50,
              index: 1984,
            },
          },
        ],
        {
          owner: "HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F",
          issuer: "HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F",
          admin: "HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F",
          freezer: "HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F",
          supply: 0,
          deposit: 0,
          minBalance: 70000,
          isSufficient: true,
          accounts: 0,
          sufficients: 0,
          approvals: 0,
          status: "Live",
        },
      ],
    ],
  },
} as StorageValues);

console.log("Connect Kreivo <> AH");
await connectParachains([assetHub.chain, kreivo.chain]);
console.log("Connect Kusama > AH");
await connectVertical(kusama.chain, assetHub.chain);
console.log("Connect Kusama > Kreivo");
await connectVertical(kusama.chain, kreivo.chain);
