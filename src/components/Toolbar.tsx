import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Sun, Moon, ScrollText, Printer } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";
import { openPdfFile } from "../utils/fileHelpers";
import { loadPdfBytes, getPageDimensions } from "../utils/pdfEngine";
import type { DarkMode } from "../store/usePdfStore";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_PRESETS } from "../utils/zoomConstants";

function userFriendlyOpenError(err: unknown, fileName: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Header check throws with the full message already — pass it through directly
  if (/missing %PDF header/i.test(msg)) return msg;
  if (/invalid pdf/i.test(msg) || /not a pdf/i.test(msg))
    return `"${fileName}" could not be opened because it is not a valid PDF file.`;
  if (/password/i.test(msg) || /encrypted/i.test(msg))
    return `"${fileName}" is password-protected. Tumbler cannot open encrypted PDFs.`;
  if (/missing|corrupt/i.test(msg))
    return `"${fileName}" appears to be corrupted and could not be opened.`;
  return `"${fileName}" could not be opened.\n\nDetail: ${msg}`;
}

export default function Toolbar() {
  const tab = useActiveTab();
  const { pdfDoc, pageCount, currentPage, zoom, darkMode, isLoading, zoomMode } = tab;

  const { openNewTab, setFile, setPageDimensions, setZoom, setZoomMode, setDarkMode,
          requestJumpToPage, setLoading } = usePdfStore.getState();

  const handleOpen = useCallback(async () => {
    let result;
    try {
      result = await openPdfFile();
    } catch (err) {
      await message(`Could not read the selected file.\n\nDetail: ${err instanceof Error ? err.message : String(err)}`, {
        title: "File Error",
        kind: "error",
      });
      return;
    }
    if (!result) return;

    const { closeTab } = usePdfStore.getState();
    openNewTab();
    const newTabId = usePdfStore.getState().activeTabId;
    setLoading(true);
    try {
      const doc = await loadPdfBytes(result.bytes);
      setFile(result.bytes, doc, result.name);
      const dims = await getPageDimensions(doc);
      setPageDimensions(dims);
    } catch (err) {
      // Remove the empty tab we just created before showing the error
      closeTab(newTabId);
      const text = userFriendlyOpenError(err, result.name);
      try {
        await message(text, { title: "Cannot Open File", kind: "error" });
      } catch {
        // Fallback if the native dialog itself fails (e.g. in dev/test)
        alert(text);
      }
    } finally {
      setLoading(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ctrl+O global shortcut ───────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "o" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpen]);

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) requestJumpToPage(val);
    }
  };

  const handlePrint = useCallback(async () => {
    const { tabs, activeTabId } = usePdfStore.getState();
    const bytes = tabs.find((t) => t.id === activeTabId)?.fileBytes;
    if (!bytes) return;
    try {
      await invoke("print_pdf", { bytes: Array.from(bytes) });
    } catch (err) {
      await message(
        `Print failed.\n\nDetail: ${err instanceof Error ? err.message : String(err)}`,
        { title: "Print Error", kind: "error" }
      );
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ctrl+P global shortcut ───────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePrint]);

  const cycleMode = () => {
    const modes: DarkMode[] = ["off", "invert", "sepia"];
    const next = modes[(modes.indexOf(darkMode) + 1) % modes.length];
    setDarkMode(next);
  };

  const DarkModeIcon = darkMode === "off" ? Sun : darkMode === "invert" ? Moon : ScrollText;

  const handleZoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "fit-width" || val === "fit-page") {
      setZoomMode(val);
    } else {
      setZoom(parseFloat(val));
    }
  };

  // Zoom select value: show mode name when in a fit mode, otherwise numeric zoom
  const zoomSelectValue = zoomMode !== "numeric" ? zoomMode : zoom;

  return (
    <div className="toolbar">
      <button onClick={handleOpen} disabled={isLoading} title="Open PDF (Ctrl+O)">
        {isLoading ? "Opening…" : "Open PDF"}
      </button>

      <div className="toolbar-spacer" />

      {pdfDoc && (
        <>
          {/* Page navigation */}
          <button
            className="icon-btn"
            onClick={() => requestJumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="page-input-group">
            <input
              type="text"
              inputMode="numeric"
              defaultValue={currentPage}
              key={currentPage}
              onKeyDown={handlePageInput}
              aria-label="Current page"
            />
            <span>/ {pageCount}</span>
          </div>

          <button
            className="icon-btn"
            onClick={() => requestJumpToPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>

          <div className="toolbar-divider" />

          {/* Zoom */}
          <button
            className="icon-btn"
            onClick={() => {
              const idx = ZOOM_PRESETS.findIndex((z) => z >= zoom);
              const prev = ZOOM_PRESETS[Math.max(0, idx - 1)];
              setZoom(prev);
            }}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>

          <select
            className="zoom-select"
            value={zoomSelectValue}
            onChange={handleZoomChange}
            aria-label="Zoom level"
          >
            <option value="fit-width">Fit Width</option>
            <option value="fit-page">Fit Page</option>
            {zoomMode === "numeric" && !ZOOM_PRESETS.includes(zoom) && (
              <option key="custom" value={zoom}>
                {Math.round(zoom * 100)}%
              </option>
            )}
            {ZOOM_PRESETS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>

          <button
            className="icon-btn"
            onClick={() => {
              const idx = ZOOM_PRESETS.findLastIndex((z) => z <= zoom);
              const next = ZOOM_PRESETS[Math.min(ZOOM_PRESETS.length - 1, idx + 1)];
              setZoom(next);
            }}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>

          <div className="toolbar-divider" />

          {/* Dark mode cycle */}
          <button onClick={cycleMode} title={`Display: ${darkMode}`} aria-label="Toggle display mode">
            <DarkModeIcon size={16} />
          </button>

          <div className="toolbar-divider" />

          {/* Print */}
          <button className="icon-btn" onClick={handlePrint} title="Print (Ctrl+P)" aria-label="Print">
            <Printer size={16} />
          </button>
        </>
      )}
    </div>
  );
}
