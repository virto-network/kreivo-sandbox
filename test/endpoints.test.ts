import { describe, expect, test } from "bun:test";

import { endpoints, resolvePresetEndpoints } from "../lib/config/endpoints.js";

describe("endpoint presets", () => {
  test("applies environment overrides", () => {
    const resolved = resolvePresetEndpoints("kusama", {
      env: {
        KREIVO_ENDPOINT: "wss://override.kreivo.example",
      },
    });

    expect(resolved.kreivo).toBe("wss://override.kreivo.example");
    expect(Array.isArray(resolved.relay)).toBe(true);
  });

  test("exposes preset-specific sibling availability", () => {
    expect(endpoints.siblings("paseo")).not.toContain("encointer");
    expect(endpoints.siblings("kusama")).toContain("encointer");
  });
});
