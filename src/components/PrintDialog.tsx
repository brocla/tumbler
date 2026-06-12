import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import { message } from "@tauri-apps/plugin-dialog";
import { PDFDocument } from "pdf-lib";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";

export default function PrintDialog() {
  const { fileBytes, pageCount } = useActiveTab();
  const setPrintDialogOpen = usePdfStore((s) => s.setPrintDialogOpen);

  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState<string>("");
  const [copies, setCopies] = useState<number>(1);
  const [allPages, setAllPages] = useState<boolean>(true);
  const [fromPage, setFromPage] = useState<number>(1);
  const [toPage, setToPage] = useState<number>(pageCount || 1);
  const [duplex, setDuplex] = useState<number>(0);   // 0=off, 1=long-edge, 2=short-edge
  const [landscape, setLandscape] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);

  useEffect(() => { setToPage(pageCount || 1); }, [pageCount]);

  useEffect(() => {
    invoke<string[]>("enumerate_printers")
      .then((list) => {
        setPrinters(list);
        if (list.length > 0) setPrinter(list[0]);
      })
      .catch((err) => console.error("[print] enumerate_printers failed:", err));
  }, []);

  const handleCancel = () => setPrintDialogOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = async () => {
    if (!fileBytes || !printer) return;
    setPrinting(true);
    try {
      let bytesToPrint: Uint8Array;

      if (allPages) {
        bytesToPrint = fileBytes;
      } else {
        const first = Math.max(1, fromPage);
        const last  = Math.min(pageCount, toPage);
        if (first > last) {
          await message("Page range is invalid: From must be ≤ To.", {
            title: "Invalid Range", kind: "error",
          });
          setPrinting(false);
          return;
        }
        // pdf-lib is 0-indexed; UI is 1-indexed.
        const srcDoc  = await PDFDocument.load(fileBytes);
        const destDoc = await PDFDocument.create();
        const indices = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i);
        const pages   = await srcDoc.copyPages(destDoc, indices);
        for (const page of pages) destDoc.addPage(page);
        bytesToPrint = new Uint8Array(await destDoc.save());
      }

      const tmpDir = await invoke<string>("get_temp_dir");
      const sep    = tmpDir.endsWith("\\") || tmpDir.endsWith("/") ? "" : "\\";
      const path   = `${tmpDir}${sep}tumbler_print.pdf`;

      // Send one job per copy — simplest approach, each is an independent spooled job.
      for (let i = 0; i < copies; i++) {
        await writeFile(path, bytesToPrint);
        await invoke("print_pdf_with_settings", { path, printer, duplex, landscape });
      }

      setPrintDialogOpen(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[print] failed:", detail);
      try {
        await message(`Print failed.\n\nDetail: ${detail}`, { title: "Print Error", kind: "error" });
      } catch {
        alert(`Print failed: ${detail}`);
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="print-dialog-backdrop" onClick={handleCancel}>
      <div
        className="print-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Print"
      >
        <h2 className="print-dialog-title">Print</h2>

        {/* Printer */}
        <div className="print-field">
          <label htmlFor="pd-printer">Printer</label>
          <select
            id="pd-printer"
            value={printer}
            onChange={(e) => setPrinter(e.target.value)}
            disabled={printers.length === 0}
          >
            {printers.length === 0 && <option value="">Loading…</option>}
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Copies */}
        <div className="print-field">
          <label htmlFor="pd-copies">Copies</label>
          <input
            id="pd-copies"
            type="number"
            min={1}
            max={999}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="print-copies-input"
          />
        </div>

        {/* Page range */}
        <div className="print-field">
          <label>Pages</label>
          <div className="print-radio-group">
            <label className="print-radio-label">
              <input type="radio" name="page-range" checked={allPages} onChange={() => setAllPages(true)} />
              All ({pageCount} {pageCount === 1 ? "page" : "pages"})
            </label>
            <label className="print-radio-label">
              <input type="radio" name="page-range" checked={!allPages} onChange={() => setAllPages(false)} />
              From
              <input
                type="number" min={1} max={pageCount} value={fromPage}
                disabled={allPages}
                onChange={(e) => setFromPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="print-page-num"
              />
              to
              <input
                type="number" min={1} max={pageCount} value={toPage}
                disabled={allPages}
                onChange={(e) => setToPage(Math.min(pageCount, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="print-page-num"
              />
            </label>
          </div>
        </div>

        {/* Duplex */}
        <div className="print-field">
          <label htmlFor="pd-duplex">Two-sided</label>
          <select id="pd-duplex" value={duplex} onChange={(e) => setDuplex(parseInt(e.target.value, 10))}>
            <option value={0}>Off (one-sided)</option>
            <option value={1}>Long-edge flip (portrait book)</option>
            <option value={2}>Short-edge flip (landscape book)</option>
          </select>
        </div>

        {/* Orientation */}
        <div className="print-field">
          <label>Orientation</label>
          <div className="print-radio-group print-radio-row">
            <label className="print-radio-label">
              <input type="radio" name="orientation" checked={!landscape} onChange={() => setLandscape(false)} />
              Portrait
            </label>
            <label className="print-radio-label">
              <input type="radio" name="orientation" checked={landscape} onChange={() => setLandscape(true)} />
              Landscape
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="print-dialog-actions">
          <button onClick={handleCancel} disabled={printing}>Cancel</button>
          <button
            className="accent"
            onClick={handlePrint}
            disabled={printing || !printer || printers.length === 0}
          >
            {printing ? "Sending…" : "Print"}
          </button>
        </div>
      </div>
    </div>
  );
}
