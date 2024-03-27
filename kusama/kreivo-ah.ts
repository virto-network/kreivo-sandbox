import {
  BuildBlockMode,
  getParaId,
  setupWithServer,
} from "@acala-network/chopsticks";
import {
  connectParachains,
  connectVertical,
} from "@acala-network/chopsticks-core";

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
  endpoint: "wss://kreivo.io/",
  "build-block-mode": BuildBlockMode.Instant,
  "runtime-log-level": 5,
  port: 8002,
});

console.log("Connect Kreivo <> AH");
await connectParachains([assetHub.chain, kreivo.chain]);
console.log("Connect Kusama > AH");
await connectVertical(kusama.chain, assetHub.chain);
console.log("Connect Kusama > Kreivo");
await connectVertical(kusama.chain, kreivo.chain);
