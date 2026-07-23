import { getDynamicBuilder, getLookupFn, type LookupEntry, type MetadataLookup } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata } from "@polkadot-api/substrate-bindings";
import { Binary, Enum } from "polkadot-api";

import type { HexString } from "polkadot-api";

import type { SandboxInfo } from "../rpc/types.js";
import type { SandboxChain } from "../core/sandbox-chain.js";

type LookupVariant =
  | ({ idx: number } & { type: "void" })
  | ({ idx: number } & { type: "lookupEntry"; value: LookupEntry })
  | ({ idx: number } & LookupEntry);

type SchedulerAgendaModel = {
  agendaStorage: ReturnType<ReturnType<typeof getDynamicBuilder>["buildStorage"]>;
  callEntry: LookupEntry;
  callFieldName: string;
  originEntry: LookupEntry;
  originFieldName: string;
  scheduledTaskEntry: LookupEntry;
};

export type GovernanceTarget = {
  getAgenda(blockNumber: number, at: HexString): Promise<unknown[] | undefined>;
  getInfo(): Promise<SandboxInfo>;
  getMetadata(hash: HexString): Promise<Uint8Array>;
  setStorageRaw(
    hash: HexString,
    changes: Record<string, string | Uint8Array | null>,
  ): Promise<void>;
};

export type GovernanceOriginVariant = {
  docs: string[];
  name: string;
  payloadType: LookupVariant["type"];
};

export type GovernanceOriginModel = {
  entry: LookupEntry;
  variants: GovernanceOriginVariant[];
};

export type GovernanceScheduleOptions = {
  blockNumber: number;
  callData: string;
  origin: unknown;
  priority?: number;
};

const normalizeFieldName = (fieldName: string) =>
  fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");

const unwrapLookupEntry = (entry: LookupEntry): LookupEntry => {
  if (
    entry.type === "option" ||
    entry.type === "sequence" ||
    entry.type === "array"
  ) {
    return unwrapLookupEntry(entry.value);
  }

  if (entry.type === "tuple" && entry.value.length === 1) {
    return unwrapLookupEntry(entry.value[0]);
  }

  return entry;
};

const iterChildren = (entry: LookupEntry): LookupEntry[] => {
  switch (entry.type) {
    case "option":
    case "sequence":
    case "array":
      return [entry.value];
    case "tuple":
      return entry.value;
    case "struct":
      return Object.values(entry.value);
    case "result":
      return [entry.value.ok, entry.value.ko];
    case "enum":
      return Object.values(entry.value).flatMap((variant) => {
        if (variant.type === "lookupEntry") {
          return [variant.value];
        }
        if (
          variant.type === "struct" ||
          variant.type === "tuple" ||
          variant.type === "array"
        ) {
          return [variant as unknown as LookupEntry];
        }
        return [];
      });
    default:
      return [];
  }
};

const findStructWithFields = (
  entry: LookupEntry,
  fields: string[],
): LookupEntry | undefined => {
  const queue: LookupEntry[] = [entry];

  while (queue.length > 0) {
    const current = unwrapLookupEntry(queue.shift()!);
    if (current.type === "struct") {
      const names = Object.keys(current.value).map(normalizeFieldName);
      if (fields.every((field) => names.includes(field))) {
        return current;
      }
    }

    queue.push(...iterChildren(current));
  }

  return undefined;
};

const getNamedField = (entry: LookupEntry, normalizedName: string) => {
  if (entry.type !== "struct") {
    throw new Error("Expected a struct lookup entry");
  }

  const fieldName = Object.keys(entry.value).find(
    (name) => normalizeFieldName(name) === normalizedName,
  );
  if (!fieldName) {
    throw new Error(`Could not find struct field ${normalizedName}`);
  }

  return {
    fieldName,
    value: entry.value[fieldName],
  };
};

const getAgendaValueTypeId = (lookup: MetadataLookup) => {
  const scheduler = lookup.metadata.pallets.find((pallet) => pallet.name === "Scheduler");
  const agenda = scheduler?.storage?.items.find((item) => item.name === "Agenda");
  if (!agenda) {
    throw new Error("Scheduler.Agenda storage entry is unavailable");
  }

  return agenda.type.tag === "map" ? agenda.type.value.value : agenda.type.value;
};

export const createGovernanceTarget = (chain: SandboxChain): GovernanceTarget => ({
  getAgenda: (blockNumber, at) =>
    chain.client().getUnsafeApi().query.Scheduler.Agenda.getValue(blockNumber, {
      at,
    }) as Promise<unknown[] | undefined>,
  getInfo: () => chain.getInfo(),
  getMetadata: (hash) => chain.client().getMetadata(hash),
  setStorageRaw: (hash, changes) => chain.setStorageRaw(hash, changes),
});

const getAgendaModel = async (target: GovernanceTarget) => {
  const info = await target.getInfo();
  const metadata = unifyMetadata(decAnyMetadata(await target.getMetadata(info.bestHash)));
  const lookup = getLookupFn(metadata);
  const builder = getDynamicBuilder(lookup);
  const agendaEntry = lookup(getAgendaValueTypeId(lookup));
  const scheduledTaskEntry = findStructWithFields(agendaEntry, ["call", "origin"]);
  if (!scheduledTaskEntry) {
    throw new Error("Could not discover scheduler task structure from metadata");
  }

  const { fieldName: originFieldName, value: originEntry } = getNamedField(
    scheduledTaskEntry,
    "origin",
  );
  const { fieldName: callFieldName, value: callEntry } = getNamedField(
    scheduledTaskEntry,
    "call",
  );

  return {
    agendaStorage: builder.buildStorage("Scheduler", "Agenda"),
    callEntry,
    callFieldName,
    originEntry,
    originFieldName,
    scheduledTaskEntry,
  } satisfies SchedulerAgendaModel;
};

const isByteArrayEntry = (entry: LookupEntry): boolean => {
  if (entry.type === "option") {
    return isByteArrayEntry(entry.value);
  }

  if (entry.type === "tuple" && entry.value.length === 1) {
    return isByteArrayEntry(entry.value[0]);
  }

  return (
    (entry.type === "sequence" || entry.type === "array") &&
    entry.value.type === "primitive" &&
    entry.value.value === "u8"
  );
};

const createCallValue = (entry: LookupEntry, callData: string): unknown => {
  const bytes = Binary.fromHex(callData);
  if (isByteArrayEntry(entry)) {
    return bytes;
  }

  const unwrapped = unwrapLookupEntry(entry);

  if (unwrapped.type === "enum") {
    const inlineEntry = unwrapped.value.Inline;
    if (inlineEntry) {
      if (inlineEntry.type === "void") {
        return Enum("Inline");
      }

      if (inlineEntry.type === "lookupEntry") {
        return Enum("Inline", createCallValue(inlineEntry.value, callData));
      }

      if (
        inlineEntry.type === "struct" ||
        inlineEntry.type === "tuple" ||
        inlineEntry.type === "array"
      ) {
        return Enum(
          "Inline",
          createCallValue(inlineEntry as unknown as LookupEntry, callData),
        );
      }
    }
  }

  if (unwrapped.type === "struct") {
    const encodedField = Object.keys(unwrapped.value).find(
      (fieldName) => normalizeFieldName(fieldName) === "encoded",
    );
    if (encodedField) {
      return {
        [encodedField]: bytes,
      };
    }
  }

  throw new Error("Unsupported scheduler call field shape for governance emulation");
};

const createDefaultValue = (entry: LookupEntry): unknown => {
  if (entry.type === "option") {
    return undefined;
  }

  if (entry.type === "sequence") {
    return [];
  }

  if (entry.type === "array") {
    return Array.from({ length: entry.len }, () => createDefaultValue(entry.value));
  }

  if (entry.type === "tuple" && entry.value.length === 1) {
    return createDefaultValue(entry.value[0]);
  }

  const unwrapped = entry.type === "tuple" ? entry : unwrapLookupEntry(entry);
  switch (unwrapped.type) {
    case "primitive":
      switch (unwrapped.value) {
        case "bool":
          return false;
        case "str":
        case "char":
          return "";
        case "u64":
        case "u128":
        case "u256":
        case "i64":
        case "i128":
        case "i256":
          return 0n;
        default:
          return 0;
      }
    case "compact":
      return unwrapped.size === "u64" || unwrapped.size === "u128" || unwrapped.size === "u256"
        ? 0n
        : 0;
    case "void":
      return undefined;
    case "tuple":
      return unwrapped.value.map((value) => createDefaultValue(value));
    case "struct":
      return Object.fromEntries(
        Object.entries(unwrapped.value).map(([fieldName, value]) => [
          fieldName,
          createDefaultValue(value),
        ]),
      );
    case "result":
      return Enum("Ok", createDefaultValue(unwrapped.value.ok));
    case "enum": {
      const variants = Object.entries(unwrapped.value)
        .map(([name, value]) => [name, value as LookupVariant] as const)
        .sort(([, left], [, right]) => left.idx - right.idx);
      const emptyVariant = variants.find(([, value]) => value.type === "void");
      if (emptyVariant) {
        return Enum(emptyVariant[0]);
      }

      const [firstName, firstVariant] = variants[0] ?? [];
      if (!firstName || !firstVariant) {
        throw new Error("Cannot infer a default value for empty enum field");
      }

      if (firstVariant.type === "lookupEntry") {
        return Enum(firstName, createDefaultValue(firstVariant.value));
      }

      if (
        firstVariant.type === "struct" ||
        firstVariant.type === "tuple" ||
        firstVariant.type === "array"
      ) {
        return Enum(
          firstName,
          createDefaultValue(firstVariant as unknown as LookupEntry),
        );
      }

      throw new Error("Cannot infer a default value for enum field");
    }
    default:
      return undefined;
  }
};

export const getGovernanceOriginModel = async (
  target: SandboxChain | GovernanceTarget,
): Promise<GovernanceOriginModel> => {
  const agendaModel = await getAgendaModel(
    target instanceof Object && "client" in target ? createGovernanceTarget(target as SandboxChain) : (target as GovernanceTarget),
  );
  const originEntry = unwrapLookupEntry(agendaModel.originEntry);
  if (originEntry.type !== "enum") {
    throw new Error("Scheduler origin is not an enum-like type");
  }

  return {
    entry: originEntry,
    variants: Object.entries(originEntry.value)
      .map(([name, value]) => ({
        name,
        docs: originEntry.innerDocs[name] ?? [],
        payloadType: value.type,
        idx: value.idx,
      }))
      .sort((left, right) => left.idx - right.idx)
      .map(({ idx: _idx, ...variant }) => variant),
  };
};

export const scheduleGovernanceOutcome = async (
  target: SandboxChain | GovernanceTarget,
  { blockNumber, callData, origin, priority = 128 }: GovernanceScheduleOptions,
) => {
  const adapter =
    target instanceof Object && "client" in target
      ? createGovernanceTarget(target as SandboxChain)
      : (target as GovernanceTarget);
  const agendaModel = await getAgendaModel(adapter);
  const info = await adapter.getInfo();
  const currentAgenda = await adapter.getAgenda(blockNumber, info.bestHash);

  const taskValue = createDefaultValue(agendaModel.scheduledTaskEntry) as Record<
    string,
    unknown
  >;
  taskValue[agendaModel.originFieldName] = origin;
  taskValue[agendaModel.callFieldName] = createCallValue(
    agendaModel.callEntry,
    callData,
  );

  const priorityFieldName = Object.keys(taskValue).find(
    (fieldName) => normalizeFieldName(fieldName) === "priority",
  );
  if (priorityFieldName) {
    taskValue[priorityFieldName] = priority;
  }

  const nextAgenda = [...(currentAgenda ?? []), taskValue];
  await adapter.setStorageRaw(info.bestHash, {
    [agendaModel.agendaStorage.keys.enc(blockNumber)]: agendaModel.agendaStorage.value.enc(
      nextAgenda,
    ),
  });

  return {
    bestHash: info.bestHash,
    blockNumber,
    scheduledCount: nextAgenda.length,
  };
};
