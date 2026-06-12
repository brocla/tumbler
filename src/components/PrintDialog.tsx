import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import { message } from "@tauri-apps/plugin-dialog";
import { PDFDocument } from "pdf-lib";
import { usePdfStore } from "../store/usePdfStore";

interface PrintSettings {
  cancelled: boolean;
  printer:   string;
  copies:    number;
  all_pages: boolean;
  from_page: number;
  to_page:   number;
}

// Not a rendered component — called imperatively from the toolbar.
export async function executePrint() {
  const state = usePdfStore.getState();
  const tab   = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab?.fileBytes || !tab.pageCount) return;

  const { fileBytes: bytes, pageCount: numPages } = tab;

  let settings: PrintSettings;
  try {
    settings = await invoke<PrintSettings>("show_print_dialog", { pageCount: numPages });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[print] show_print_dialog failed:", detail);
    try { await message(`Print failed.\n\nDetail: ${detail}`, { title: "Print Error", kind: "error" }); }
    catch { alert(`Print failed: ${detail}`); }
    return;
  }

  if (settings.cancelled) return;

  try {
    let bytesToPrint: Uint8Array;

    if (settings.all_pages) {
      bytesToPrint = bytes;
    } else {
      const first = Math.max(1, settings.from_page);
      const last  = Math.min(numPages, settings.to_page);
      // pdf-lib is 0-indexed; dialog returns 1-indexed.
      const srcDoc  = await PDFDocument.load(bytes);
      const destDoc = await PDFDocument.create();
      const indices = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i);
      const pages   = await destDoc.copyPages(srcDoc, indices);
      for (const page of pages) destDoc.addPage(page);
      bytesToPrint = new Uint8Array(await destDoc.save());
    }

    const tmpDir = await invoke<string>("get_temp_dir");
    const sep    = tmpDir.endsWith("\\") || tmpDir.endsWith("/") ? "" : "\\";
    const path   = `${tmpDir}${sep}tumbler_print.pdf`;

    for (let i = 0; i < settings.copies; i++) {
      await writeFile(path, bytesToPrint);
      await invoke("print_pdf_path", { path, printer: settings.printer });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[print] print job failed:", detail);
    try { await message(`Print failed.\n\nDetail: ${detail}`, { title: "Print Error", kind: "error" }); }
    catch { alert(`Print failed: ${detail}`); }
  }
}
