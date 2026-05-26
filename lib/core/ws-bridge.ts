import { createServer, type Server as HttpServer } from "node:http";
import { type AddressInfo } from "node:net";

import type { JsonRpcProvider } from "polkadot-api";
import WebSocket, { WebSocketServer } from "ws";

export type ListenOptions = {
  host?: string;
  port?: number;
};

type JsonRpcConnection = ReturnType<JsonRpcProvider>;

const normalizeUrlHost = (host: string) => {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }

  return host;
};

const parseMessage = (data: WebSocket.RawData) => {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : data.toString();
  return JSON.parse(text);
};

const waitForClose = async (
  close: (done: () => void) => void,
  timeoutMs = 250,
) => {
  await Promise.race([
    new Promise<void>((resolve) => close(resolve)),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

export class NodeWsBridge {
  #connections = new Map<WebSocket, JsonRpcConnection>();
  #closing = false;
  #destroyPromise?: Promise<void>;
  #httpServer?: HttpServer;
  #wsServer?: WebSocketServer;
  #wsUrl?: string;
  #port?: number;

  constructor(private provider: JsonRpcProvider) {}

  async listen({ host = "127.0.0.1", port = 0 }: ListenOptions = {}) {
    if (this.#wsUrl) {
      return {
        port: this.#port!,
        wsUrl: this.#wsUrl,
      };
    }

    const httpServer = createServer();
    const wsServer = new WebSocketServer({ server: httpServer });

    wsServer.on("connection", (socket) => {
      if (this.#closing) {
        socket.close(1012, "sandbox closing");
        return;
      }

      const connection = this.provider((message) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      });

      this.#connections.set(socket, connection);

      socket.on("message", (data) => {
        try {
          const payload = parseMessage(data);
          if (Array.isArray(payload)) {
            for (const entry of payload) {
              connection.send(entry);
            }
            return;
          }

          connection.send(payload);
        } catch {
          socket.close(1003, "invalid JSON-RPC payload");
        }
      });

      socket.on("close", () => {
        connection.disconnect();
        this.#connections.delete(socket);
      });

      socket.on("error", () => {
        connection.disconnect();
        this.#connections.delete(socket);
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        httpServer.off("error", reject);
        resolve();
      });
    });

    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve websocket address");
    }

    this.#httpServer = httpServer;
    this.#wsServer = wsServer;
    this.#port = address.port;
    this.#wsUrl = `ws://${normalizeUrlHost(address.address)}:${address.port}`;

    return {
      port: address.port,
      wsUrl: this.#wsUrl,
    };
  }

  get wsUrl() {
    return this.#wsUrl;
  }

  get port() {
    return this.#port;
  }

  async destroy() {
    if (this.#destroyPromise) {
      return this.#destroyPromise;
    }

    this.#closing = true;
    this.#destroyPromise = (async () => {
      for (const [socket, connection] of this.#connections) {
        connection.disconnect();
        socket.terminate();
      }
      this.#connections.clear();
      this.#httpServer?.closeAllConnections?.();

      if (this.#wsServer) {
        await waitForClose((resolve) => this.#wsServer!.close(() => resolve()));
      }

      if (this.#httpServer) {
        await waitForClose((resolve) => this.#httpServer!.close(() => resolve()));
      }

      this.#wsServer = undefined;
      this.#httpServer = undefined;
      this.#wsUrl = undefined;
      this.#port = undefined;
    })();

    return this.#destroyPromise;
  }
}
