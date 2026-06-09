import { useCallback } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { openPdfFile } from "../utils/fileHelpers";
import { loadPdfBytes, getPageDimensions } from "../utils/pdfEngine";
import type { DarkMode } from "../store/usePdfStore";

const ZOOM_PRESETS = [0.10, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export default function Toolbar() {
  const {
    pdfDoc, fileName, pageCount, currentPage, zoom, darkMode,
    setFile, setPageDimensions, setZoom, setDarkMode,
    requestJumpToPage,
  } = usePdfStore();

  const handleOpen = useCallback(async () => {
    const result = await openPdfFile();
    if (!result) return;
    const doc = await loadPdfBytes(result.bytes);
    setFile(result.bytes, doc, result.name);
    // Fetch natural page dimensions once after load
    const dims = await getPageDimensions(doc);
    setPageDimensions(dims);
  }, [setFile, setPageDimensions]);

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) requestJumpToPage(val);
    }
  };

  const cycleMode = () => {
    const modes: DarkMode[] = ["off", "invert", "sepia"];
    const next = modes[(modes.indexOf(darkMode) + 1) % modes.length];
    setDarkMode(next);
  };

  const darkModeLabel = darkMode === "off" ? "☀" : darkMode === "invert" ? "🌙" : "📜";

  return (
    <div className="toolbar">
      {/* File open */}
      <button onClick={handleOpen}>Open PDF</button>

      {fileName && (
        <>
          <div className="toolbar-divider" />
          <span className="toolbar-filename">{fileName}</span>
        </>
      )}

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
            ‹
          </button>

          <div className="page-input-group">
            <input
              type="number"
              defaultValue={currentPage}
              key={currentPage}
              min={1}
              max={pageCount}
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
            ›
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
            disabled={zoom <= 0.10}
            aria-label="Zoom out"
          >
            −
          </button>

          <select
            className="zoom-select"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            aria-label="Zoom level"
          >
            {!ZOOM_PRESETS.includes(zoom) && (
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
            disabled={zoom >= 4.0}
            aria-label="Zoom in"
          >
            +
          </button>

          <div className="toolbar-divider" />

          {/* Dark mode cycle */}
          <button onClick={cycleMode} title={`Display: ${darkMode}`} aria-label="Toggle display mode">
            {darkModeLabel}
          </button>
        </>
      )}
    </div>
  );
}
