import { invoke } from "@tauri-apps/api/core";

/**
 * Reads the Windows accent color via the Tauri backend and applies it
 * to --color-accent and --color-accent-dim on :root.
 * Safe to call on non-Windows or outside Tauri (silently does nothing).
 */
export async function applySystemAccentColor(): Promise<void> {
  let hex: string;
  try {
    hex = await invoke<string>("get_accent_color");
  } catch {
    return;
  }

  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8)  & 0xff;
  const b =  n        & 0xff;

  const root = document.documentElement;
  root.style.setProperty("--color-accent",     hex);
  root.style.setProperty("--color-accent-dim", `rgba(${r},${g},${b},0.15)`);
}
