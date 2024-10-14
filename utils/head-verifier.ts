import "@polkadot/api-augment/kusama";

import { ApiPromise, WsProvider } from "@polkadot/api";

const api = await ApiPromise.create({
  provider: new WsProvider(["wss://rpc.ibp.network/kusama"]),
});

api.rpc.chain.subscribeNewHeads(async ({ hash }) => {
  const apiAt = await api.at(hash);
  const maybeParaHeaderVec = await apiAt.query.paras.heads(2281);
  const paraHeader = api.createType(
    "Header",
    maybeParaHeaderVec.unwrap().toHex()
  );

  console.log(paraHeader.toHuman());
});
