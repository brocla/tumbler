import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

export async function openPdfFile(): Promise<{ bytes: Uint8Array; name: string } | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!selected || typeof selected !== "string") return null;

  const bytes = await readFile(selected);
  const name = selected.split(/[\\/]/).pop() ?? "document.pdf";
  return { bytes, name };
}

export async function savePdfFile(
  bytes: Uint8Array,
  suggestedName = "document.pdf"
): Promise<boolean> {
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!path) return false;
  await writeFile(path, bytes);
  return true;
}

export async function saveTextFile(
  text: string,
  suggestedName = "extracted-text.txt"
): Promise<boolean> {
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: "Text", extensions: ["txt"] }],
  });

  if (!path) return false;
  const encoder = new TextEncoder();
  await writeFile(path, encoder.encode(text));
  return true;
}
