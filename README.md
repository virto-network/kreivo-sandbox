# Kreivo Sandbox

Allows launching and deploying sandbox environments to test features for Kreivo safely.

## Usage

To get started with a bare fork of Kreivo, run:

```bash
npx @virtonetwork/kreivo-sandbox
```

### Connecting with Relay

There's an option to include a connection with the Relay Chain. Useful to test XCM commands. Run:

```bash
npx @virtonetwork/kreivo-sandbox -R/--with-relay
```

### Connecting parachains

If you want to connect with a sibling parachain that's within the list of available chains (`assetHub`
for now), run the following command, separating the chain IDs with commas:

```bash
npx @virtonetwork/kreivo-sandbox --with-siblings <chainIds,...>
```

### Using a WASM to Upgrade

If you have a WASM of the following runtime version, you can use it to emulate an upgrade. Run:

```bash
npx @virtonetwork/kreivo-sandbox -U/--with-upgrade
```

You can optionally set the path of the WASM to use for the emulated upgrade:

```bash
npx @virtonetwork/kreivo-sandbox -U -w/--upgrade-wasm-path <path>
```

### Other options

If you'd like to get more options, please run:

```bash
npx @virtonetwork/kreivo-sandbox --help
```
