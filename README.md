# Kreivo Sandbox

Forklift-based sandbox orchestration for Kreivo, relay chains, and sibling parachains.

## Usage

Start a sandbox with Kreivo only:

```bash
npx @virto-network/kreivo-sandbox
```

`start` remains available as an explicit alias:

```bash
npx @virto-network/kreivo-sandbox start
```

Start a relay-connected topology:

```bash
npx @virto-network/kreivo-sandbox start --with-relay
```

Start with sibling parachains:

```bash
npx @virto-network/kreivo-sandbox start --with-siblings assetHub,people
```

Apply YAML storage overrides during startup:

```bash
npx @virto-network/kreivo-sandbox start \
  --storage-override-file ./overrides.yml \
  --storage-override-file ./relay-overrides.yml
```

The `start` command writes a manifest file at `.kreivo-sandbox.yml` by default. That manifest is used by the interactive governance flow.

## Governance Emulation

Schedule a governance outcome through `Scheduler.Agenda` using metadata-driven origin discovery and an interactive TUI:

```bash
npx @virto-network/kreivo-sandbox governance schedule
```

The flow lets you:

1. Select a sandbox chain from the generated manifest.
2. Inspect and choose available origins, or paste a structured origin value as JSON/YAML.
3. Provide call data and the block number to execute.

## Chain Control

Create a block against a running sandbox chain:

```bash
npx @virto-network/kreivo-sandbox block ws://127.0.0.1:12281
```

Change best/finalized heads:

```bash
npx @virto-network/kreivo-sandbox best ws://127.0.0.1:12281 0x...
npx @virto-network/kreivo-sandbox finalize ws://127.0.0.1:12281 0x...
```

Destroy a running chain:

```bash
npx @virto-network/kreivo-sandbox destroy ws://127.0.0.1:12281
```

Replay a local block without mutating the sandbox head, returning per-phase logs, storage diff, and extrinsic results:

```bash
npx @virto-network/kreivo-sandbox replay-block ws://127.0.0.1:12281 0x...
```

## MCP

Expose the running sandbox as an HTTP-based MCP debug console:

```bash
npx @virto-network/kreivo-sandbox --mcp --mcp-port 4224
```

You can give the live instance a stable MCP sandbox id:

```bash
npx @virto-network/kreivo-sandbox --mcp --register rehearsal-01
```

This starts the sandbox and exposes a Streamable HTTP MCP endpoint at `http://127.0.0.1:4224/mcp` for that exact running instance.

## Runtime Upgrades

Run the upgrade emulation flow after startup:

```bash
npx @virto-network/kreivo-sandbox start --with-upgrade --upgrade-wasm-path ./kreivo_runtime.compact.compressed.wasm
```

## Accounts Scope

Community account-id utilities are no longer part of this package. That flow is being extracted toward a separate library such as `@virto-network/community-utilities`.

## Help

Show all CLI options:

```bash
npx @virto-network/kreivo-sandbox --help
```
