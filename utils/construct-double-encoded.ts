import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex, compactFromU8a, compactAddLength } from "@polkadot/util";

const api = await ApiPromise.create({
  provider: new WsProvider("wss://sys.ibp.network/kusama"),
});

const call = api.tx.system.remarkWithEvent("Hello from Kreivo").method;
const encoded = api.createType("Vec<u8>", [...call.toU8a()]);

// output as hex
const doubleEncoded = api.createType("XcmDoubleEncoded", {
  encoded,
  decoded: null,
});

console.log(
  `
call = (${u8aToHex(call.toU8a())})`,
  call.toHuman()
);

console.log(`Compact(call) =`, compactFromU8a(call.toU8a()));

console.log(`Encoded Call: ${encoded.toHex()}
DoubleEncoded call: ${doubleEncoded.toHex()}
`);

await api.disconnect();
process.exit(0);
