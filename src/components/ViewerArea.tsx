import { useEffect, useRef } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { renderPage } from "../utils/pdfEngine";

export default function ViewerArea() {
  const { pdfDoc, currentPage, zoom } = usePdfStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    renderPage(pdfDoc, currentPage, canvasRef.current, zoom).catch((err) => {
      if (!cancelled) console.error("Render error:", err);
    });

    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, zoom]);

  if (!pdfDoc) {
    return (
      <div className="viewer-area">
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h2>No document open</h2>
          <p>Click <strong>Open PDF</strong> in the toolbar to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-area">
      <div className="pdf-canvas-wrapper">
        <canvas ref={canvasRef} aria-label={`Page ${currentPage}`} />
      </div>
    </div>
  );
}
