import { useEffect, useRef, useCallback } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { renderPage, prefetchPages, renderTextLayer } from "../utils/pdfEngine";

const ZOOM_STEP = 0.12;

export default function ViewerArea() {
  const { pdfDoc, currentPage, zoom, searchQuery, setCurrentPage, setZoom, focusSearch } = usePdfStore();
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const textLayerRef      = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const viewerRef         = useRef<HTMLDivElement>(null);

  // Render canvas + text layer on page/zoom/query change
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current || !highlightLayerRef.current) return;
    let cancelled = false;

    renderPage(pdfDoc, currentPage, canvasRef.current, zoom)
      .then(() => {
        if (cancelled) return;
        prefetchPages(pdfDoc, currentPage, zoom);
        return renderTextLayer(
          pdfDoc, currentPage,
          textLayerRef.current!,
          highlightLayerRef.current!,
          zoom, searchQuery
        );
      })
      .catch((err) => {
        if (!cancelled) console.error("Render error:", err);
      });

    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, zoom, searchQuery]);

  // Ctrl+F → open our search panel; prevent WebView2 native find-in-page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  // Wheel: Ctrl = zoom, plain = page turn at scroll boundaries
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP);
      setZoom(zoom * factor);
      return;
    }

    const el = viewerRef.current;
    if (!el) return;

    const atTop    = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

    if (e.deltaY < 0 && atTop) {
      e.preventDefault();
      setCurrentPage(currentPage - 1);
      requestAnimationFrame(() => {
        if (viewerRef.current) viewerRef.current.scrollTop = viewerRef.current.scrollHeight;
      });
    } else if (e.deltaY > 0 && atBottom) {
      e.preventDefault();
      setCurrentPage(currentPage + 1);
    }
  }, [zoom, setZoom, currentPage, setCurrentPage]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  if (!pdfDoc) {
    return (
      <div className="viewer-area" ref={viewerRef}>
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h2>No document open</h2>
          <p>Click <strong>Open PDF</strong> in the toolbar to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-area" ref={viewerRef}>
      <div className="pdf-canvas-wrapper">
        <canvas ref={canvasRef} aria-label={`Page ${currentPage}`} />
        <div ref={textLayerRef} className="textLayer" />
        <div ref={highlightLayerRef} className="highlightLayer" />
      </div>
    </div>
  );
}
