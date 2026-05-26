import { describe, expect, test } from "bun:test";
import WebSocket from "ws";

import { NodeWsBridge } from "../lib/core/ws-bridge.js";

describe("NodeWsBridge", () => {
  test("closes active websocket clients during destroy", async () => {
    let disconnectCount = 0;
    const bridge = new NodeWsBridge(
      ((onMessage) => ({
        disconnect() {
          disconnectCount += 1;
        },
        send(message) {
          onMessage({
            jsonrpc: "2.0",
            id: (message as { id?: number }).id ?? null,
            result: "ok",
          });
        },
      })) as never,
    );

    const { wsUrl } = await bridge.listen({ port: 0 });
    const socket = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    await bridge.destroy();
    await Bun.sleep(50);

    expect(disconnectCount).toBeGreaterThan(0);
    expect([WebSocket.CLOSING, WebSocket.CLOSED]).toContain(socket.readyState);

    socket.terminate();
  });
});
