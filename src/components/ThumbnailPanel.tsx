import { useEffect, useRef } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { renderPage } from "../utils/pdfEngine";

const THUMB_SCALE = 0.18;

function Thumbnail({ pageNumber }: { pageNumber: number }) {
  const { pdfDoc, currentPage, setCurrentPage } = usePdfStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    renderPage(pdfDoc, pageNumber, canvasRef.current, THUMB_SCALE).catch(console.error);
  }, [pdfDoc, pageNumber]);
  // Note: zoom intentionally excluded — thumbnails always render at THUMB_SCALE

  return (
    <div
      className={`thumbnail-item ${currentPage === pageNumber ? "active" : ""}`}
      onClick={() => setCurrentPage(pageNumber)}
      role="button"
      aria-label={`Go to page ${pageNumber}`}
    >
      <canvas ref={canvasRef} />
      <span>{pageNumber}</span>
    </div>
  );
}

export default function ThumbnailPanel() {
  const pageCount = usePdfStore((s) => s.pageCount);

  return (
    <div className="thumbnail-grid">
      {Array.from({ length: pageCount }, (_, i) => (
        <Thumbnail key={i + 1} pageNumber={i + 1} />
      ))}
    </div>
  );
}
