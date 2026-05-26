import { describe, expect, test } from "bun:test";

import { SandboxRegistry } from "../lib/services/sandbox-registry.js";

describe("SandboxRegistry", () => {
  test("registers, lists, and retrieves sandbox entries", () => {
    const registry = new SandboxRegistry();
    const sandbox = {
      chains: new Map([["kreivo", {}]]),
      destroy: async () => {},
    };

    const entry = registry.register({
      id: "rehearsal-01",
      sandbox: sandbox as never,
    });

    expect(entry.id).toBe("rehearsal-01");
    expect(registry.has("rehearsal-01")).toBe(true);
    expect(registry.get("rehearsal-01")).toBe(sandbox);
    expect(registry.list().map(({ id }) => id)).toEqual(["rehearsal-01"]);
  });

  test("rejects duplicate registrations", () => {
    const registry = new SandboxRegistry();
    const sandbox = {
      chains: new Map(),
      destroy: async () => {},
    };

    registry.register({ id: "sandbox", sandbox: sandbox as never });

    expect(() =>
      registry.register({ id: "sandbox", sandbox: sandbox as never }),
    ).toThrow("Sandbox 'sandbox' is already registered");
  });

  test("destroyAll tears down all registered sandboxes and clears the registry", async () => {
    const registry = new SandboxRegistry();
    let destroyCount = 0;

    const createSandbox = () =>
      ({
        chains: new Map(),
        destroy: async () => {
          destroyCount += 1;
        },
      }) as never;

    registry.register({ id: "a", sandbox: createSandbox() });
    registry.register({ id: "b", sandbox: createSandbox() });

    await registry.destroyAll();

    expect(destroyCount).toBe(2);
    expect(registry.list()).toEqual([]);
  });
});
