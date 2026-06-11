import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

/** Check the first 4 bytes for the %PDF magic number. */
function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  // 0x25 = '%', 0x50 = 'P', 0x44 = 'D', 0x46 = 'F'
}

export async function openPdfFile(): Promise<{ bytes: Uint8Array; name: string } | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!selected || typeof selected !== "string") return null;

  const bytes = await readFile(selected);
  const name = selected.split(/[\\/]/).pop() ?? "document.pdf";

  if (!isPdfBytes(bytes)) {
    throw new Error(`"${name}" does not appear to be a PDF file (missing %PDF header).`);
  }

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
