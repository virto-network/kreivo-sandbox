import express from "express";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

import { ALL_CHAIN_IDS, type ChainId } from "../config/network.js";
import { scheduleGovernanceOutcome } from "./governance.js";
import { SandboxRegistry, createSandboxRegistry } from "./sandbox-registry.js";

const CHAIN_ID_VALUES = [...ALL_CHAIN_IDS] as [ChainId, ...ChainId[]];

const asToolContent = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const serializeSandboxListEntry = (entry: ReturnType<SandboxRegistry["list"]>[number]) => ({
  chainIds: [...entry.sandbox.chains.keys()],
  createdAt: entry.createdAt,
  sandboxId: entry.id,
});

const getChainInfoMap = async (sandbox: ReturnType<SandboxRegistry["get"]>) =>
  Object.fromEntries(
    await Promise.all(
      [...sandbox.chains.entries()].map(async ([chainId, chain]) => [
        chainId,
        await chain.getInfo(),
      ]),
    ),
  );

const buildMcpServer = (registry: SandboxRegistry) => {
  const server = new McpServer(
    {
      name: "kreivo-sandbox-mcp",
      version: "2.0.0",
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    "sandbox_list",
    {
      description: "List registered sandbox instances exposed by this debug console",
      inputSchema: {},
    },
    async () =>
      asToolContent({
        sandboxes: registry.list().map(serializeSandboxListEntry),
      }),
  );

  server.registerTool(
    "sandbox_info",
    {
      description: "Inspect one registered sandbox or one chain inside it",
      inputSchema: {
        chainId: z.enum(CHAIN_ID_VALUES).optional(),
        sandboxId: z.string(),
      },
    },
    async ({ chainId, sandboxId }) => {
      const entry = registry.getEntry(sandboxId);
      if (chainId) {
        return asToolContent({
          chain: await entry.sandbox.get(chainId).getInfo(),
          createdAt: entry.createdAt,
          sandboxId,
        });
      }

      return asToolContent({
        chains: await getChainInfoMap(entry.sandbox),
        createdAt: entry.createdAt,
        sandboxId,
      });
    },
  );

  server.registerTool(
    "sandbox_list_chains",
    {
      description: "List chain ids and connection details for a registered sandbox",
      inputSchema: {
        sandboxId: z.string(),
      },
    },
    async ({ sandboxId }) => {
      const sandbox = registry.get(sandboxId);
      return asToolContent({
        chains: await getChainInfoMap(sandbox),
        sandboxId,
      });
    },
  );

  server.registerTool(
    "sandbox_new_block",
    {
      description: "Create a block on one chain of a registered sandbox",
      inputSchema: {
        chainId: z.enum(CHAIN_ID_VALUES),
        parent: z.string().optional(),
        sandboxId: z.string(),
        type: z.enum(["best", "finalized", "fork"]).optional(),
        unsafeBlockHeight: z.number().optional(),
      },
    },
    async ({ chainId, parent, sandboxId, type, unsafeBlockHeight }) => {
      const sandbox = registry.get(sandboxId);
      return asToolContent({
        hash: await sandbox.get(chainId).newBlock({ parent, type, unsafeBlockHeight }),
      });
    },
  );

  server.registerTool(
    "sandbox_change_best",
    {
      description: "Change the best head of a registered sandbox chain",
      inputSchema: {
        chainId: z.enum(CHAIN_ID_VALUES),
        hash: z.string(),
        sandboxId: z.string(),
      },
    },
    async ({ chainId, hash, sandboxId }) => {
      const sandbox = registry.get(sandboxId);
      await sandbox.get(chainId).changeBest(hash);
      return asToolContent({ ok: true });
    },
  );

  server.registerTool(
    "sandbox_change_finalized",
    {
      description: "Change the finalized head of a registered sandbox chain",
      inputSchema: {
        chainId: z.enum(CHAIN_ID_VALUES),
        hash: z.string(),
        sandboxId: z.string(),
      },
    },
    async ({ chainId, hash, sandboxId }) => {
      const sandbox = registry.get(sandboxId);
      await sandbox.get(chainId).changeFinalized(hash);
      return asToolContent({ ok: true });
    },
  );

  server.registerTool(
    "sandbox_get_storage_diff",
    {
      description: "Get the storage diff for a block relative to a base hash",
      inputSchema: {
        baseHash: z.string().optional(),
        chainId: z.enum(CHAIN_ID_VALUES),
        hash: z.string(),
        sandboxId: z.string(),
      },
    },
    async ({ baseHash, chainId, hash, sandboxId }) => {
      const sandbox = registry.get(sandboxId);
      return asToolContent({
        diff: await sandbox.get(chainId).getStorageDiff(hash, baseHash),
      });
    },
  );

  server.registerTool(
    "sandbox_replay_block",
    {
      description: "Replay a local block without mutating the sandbox head",
      inputSchema: {
        blockHash: z.string(),
        chainId: z.enum(CHAIN_ID_VALUES),
        includeEvents: z.boolean().default(true),
        includeFinalStorageDiff: z.boolean().default(true),
        runtimeLogLevel: z.number().int().min(0).max(5).default(5),
        sandboxId: z.string(),
      },
    },
    async ({
      blockHash,
      chainId,
      includeEvents,
      includeFinalStorageDiff,
      runtimeLogLevel,
      sandboxId,
    }) => {
      const sandbox = registry.get(sandboxId);
      return asToolContent(
        await sandbox.get(chainId).replayBlock(
          { blockHash },
          {
            includeEvents,
            includeFinalStorageDiff,
            runtimeLogLevel: runtimeLogLevel as 0 | 1 | 2 | 3 | 4 | 5,
          },
        ),
      );
    },
  );

  server.registerTool(
    "sandbox_schedule_governance",
    {
      description: "Schedule a governance outcome via Scheduler.Agenda",
      inputSchema: {
        blockNumber: z.number(),
        callData: z.string(),
        chainId: z.enum(CHAIN_ID_VALUES),
        origin: z.unknown(),
        priority: z.number().optional(),
        sandboxId: z.string(),
      },
    },
    async ({ blockNumber, callData, chainId, origin, priority, sandboxId }) => {
      const sandbox = registry.get(sandboxId);
      return asToolContent(
        await scheduleGovernanceOutcome(sandbox.get(chainId), {
          blockNumber,
          callData,
          origin,
          priority,
        }),
      );
    },
  );

  server.registerTool(
    "sandbox_destroy",
    {
      description: "Destroy a registered sandbox and remove it from the debug console",
      inputSchema: {
        sandboxId: z.string(),
      },
    },
    async ({ sandboxId }) => {
      await registry.destroy(sandboxId);
      return asToolContent({ ok: true });
    },
  );

  return server;
};

export type ServeMcpHttpOptions = {
  host?: string;
  port?: number;
  registry?: SandboxRegistry;
};

export const serveMcpHttp = async ({
  host = "127.0.0.1",
  port = 4_224,
  registry = createSandboxRegistry(),
}: ServeMcpHttpOptions = {}) => {
  const app = createMcpExpressApp({ host });
  app.use(express.json({ limit: "2mb" }));

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = buildMcpServer(registry);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32_603,
            message: error instanceof Error ? error.message : String(error),
          },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  const listener = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.once("error", reject);
  });

  return {
    app,
    close: async () => {
      await registry.destroyAll();
      await new Promise<void>((resolve, reject) => {
        listener.close((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    port,
    registry,
    url: `http://${host}:${port}/mcp`,
  };
};
