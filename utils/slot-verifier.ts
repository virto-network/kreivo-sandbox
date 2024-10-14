import "@polkadot/api-augment/substrate";

import { ApiPromise, WsProvider } from "@polkadot/api";

import { SingleBar } from "cli-progress";
import { createObjectCsvWriter } from "csv-writer";
import { u64 } from "@polkadot/types";

type BlockScan = {
  blockNumber: number;
  slot: number;
  time: string;
  elapsed: number;
};

const api = await ApiPromise.create({
  provider: new WsProvider("wss://kreivo.io"),
});

const bar = new SingleBar({
  format: "CLI Progress |{bar}| {percentage}% || {value}/{total} Blocks",
  barCompleteChar: "\u2588",
  barIncompleteChar: "\u2591",
  hideCursor: true,
});

const csvWriter = createObjectCsvWriter({
  path: "last-blocks.csv",
  header: [
    { id: "blockNumber", title: "Block Number" },
    { id: "slot", title: "Slot" },
    { id: "time", title: "Time" },
    { id: "elapsed", title: "Elapsed (in ms)" },
  ],
});

const lastUpgradeBlockNumber = 1_810_986;
const blocksToScan = new Array(1_612)
  .fill(0)
  .map((_, i) => lastUpgradeBlockNumber + i + 1);

bar.start(blocksToScan.length, 0);

const scannedBlocks: BlockScan[] = [];

for (const blockNumber of blocksToScan) {
  const blockHash = await api.query.system.blockHash(blockNumber);
  const apiAt = await api.at(blockHash);

  const slot = (await apiAt.query.aura.currentSlot()) as u64;
  const newSlot = slot.toNumber();
  const prevSlot = scannedBlocks.at(-1)?.slot ?? slot.toNumber() - 1;

  const time = await apiAt.query.timestamp.now();
  const newTime = time.toNumber();
  const prevTime = new Date(scannedBlocks.at(-1)?.time ?? newTime).getTime();

  if (prevSlot >= newSlot) {
    console.log(`[For ${blockNumber}] Slot must increase`);
  }

  scannedBlocks.push({
    blockNumber,
    slot: newSlot,
    time: new Date(newTime).toISOString(),
    elapsed: newTime - prevTime,
  });
  bar.increment();
}

bar.stop();
await csvWriter.writeRecords(scannedBlocks);

process.exit(0);
