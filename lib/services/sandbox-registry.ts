import type { Sandbox } from "../core/sandbox.js";

export type SandboxRegistryEntry = {
  createdAt: string;
  id: string;
  sandbox: Sandbox;
};

export class SandboxRegistry {
  #entries = new Map<string, SandboxRegistryEntry>();

  register({
    id,
    sandbox,
  }: {
    id: string;
    sandbox: Sandbox;
  }) {
    if (this.#entries.has(id)) {
      throw new Error(`Sandbox '${id}' is already registered`);
    }

    const entry: SandboxRegistryEntry = {
      createdAt: new Date().toISOString(),
      id,
      sandbox,
    };
    this.#entries.set(id, entry);
    return entry;
  }

  has(id: string) {
    return this.#entries.has(id);
  }

  getEntry(id: string) {
    const entry = this.#entries.get(id);
    if (!entry) {
      throw new Error(`Unknown sandbox '${id}'`);
    }

    return entry;
  }

  get(id: string) {
    return this.getEntry(id).sandbox;
  }

  list() {
    return [...this.#entries.values()];
  }

  unregister(id: string) {
    const entry = this.#entries.get(id);
    if (!entry) {
      throw new Error(`Unknown sandbox '${id}'`);
    }

    this.#entries.delete(id);
    return entry;
  }

  async destroy(id: string) {
    const entry = this.unregister(id);
    await entry.sandbox.destroy();
    return entry;
  }

  async destroyAll() {
    const entries = this.list();
    this.#entries.clear();
    await Promise.all(entries.map((entry) => entry.sandbox.destroy()));
  }
}

export const createSandboxRegistry = () => new SandboxRegistry();
