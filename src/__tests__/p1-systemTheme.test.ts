/**
 * P1.6 — applySystemAccentColor silently applies wrong color for invalid hex
 *
 * When the Rust backend returns a malformed hex string, parseInt returns NaN.
 * JavaScript's bitwise ops coerce NaN to 0, so the accent-dim becomes
 * rgba(0,0,0,0.15) — pure black — and --color-accent is set to the invalid
 * string. No error is thrown or logged.
 *
 * These tests document the desired behaviour AFTER the fix.
 * They FAIL against the current code, proving the bug exists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Tauri invoke ─────────────────────────────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { applySystemAccentColor } from "../utils/systemTheme";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.cssText = "";
});

// ── Baseline: valid hex works correctly ───────────────────────────────────────

describe("applySystemAccentColor: valid hex (baseline — should pass)", () => {
  it("sets --color-accent to the hex string returned by backend", async () => {
    mockedInvoke.mockResolvedValue("#3b82f6");
    await applySystemAccentColor();
    expect(
      document.documentElement.style.getPropertyValue("--color-accent")
    ).toBe("#3b82f6");
  });

  it("sets --color-accent-dim with correct RGB components", async () => {
    mockedInvoke.mockResolvedValue("#3b82f6");
    await applySystemAccentColor();
    // #3b82f6 → r=59, g=130, b=246
    expect(
      document.documentElement.style.getPropertyValue("--color-accent-dim")
    ).toBe("rgba(59,130,246,0.15)");
  });
});

// ── P1.6: invalid hex ─────────────────────────────────────────────────────────

describe("P1.6: applySystemAccentColor rejects invalid hex from backend", () => {
  it("does not set --color-accent when hex contains non-hex characters", async () => {
    mockedInvoke.mockResolvedValue("#gggggg");
    await applySystemAccentColor();

    // BUG: the function currently DOES set --color-accent to the invalid string.
    // DESIRED: invalid input should be rejected — CSS variable left unchanged.
    const accent = document.documentElement.style.getPropertyValue("--color-accent");
    expect(accent).toBe(""); // FAILS: accent is "#gggggg"
  });

  it("does not set --color-accent-dim to black when hex is invalid", async () => {
    mockedInvoke.mockResolvedValue("#gggggg");
    await applySystemAccentColor();

    // BUG: parseInt('#gggggg') = NaN; NaN & 0xff = 0 (bitwise coercion),
    // so all channels become 0 → rgba(0,0,0,0.15) = pure black.
    const accentDim = document.documentElement.style.getPropertyValue("--color-accent-dim");
    expect(accentDim).toBe(""); // FAILS: accentDim is "rgba(0,0,0,0.15)"
  });

  it("does not set any CSS variables when hex is too short", async () => {
    mockedInvoke.mockResolvedValue("#abc");
    await applySystemAccentColor();

    expect(
      document.documentElement.style.getPropertyValue("--color-accent")
    ).toBe(""); // FAILS: set to "#abc"
  });

  it("does not set any CSS variables when hex has no # prefix", async () => {
    mockedInvoke.mockResolvedValue("5b8af0");
    await applySystemAccentColor();

    expect(
      document.documentElement.style.getPropertyValue("--color-accent")
    ).toBe(""); // FAILS: set to "5b8af0"
  });

  it("does not set any CSS variables when backend returns empty string", async () => {
    mockedInvoke.mockResolvedValue("");
    await applySystemAccentColor();

    expect(
      document.documentElement.style.getPropertyValue("--color-accent")
    ).toBe(""); // FAILS: set to ""  AND accentDim set to rgba(0,0,0,0.15)
  });
});
