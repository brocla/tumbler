import { useEffect, useRef, forwardRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPage, renderTextLayer } from "../utils/pdfEngine";

interface PageSlotProps {
  pageNumber: number;
  pdfDoc: PDFDocumentProxy;
  zoom: number;
  searchQuery: string;
  isInRenderWindow: boolean;
  naturalWidth: number;
  naturalHeight: number;
}

const PageSlot = forwardRef<HTMLDivElement, PageSlotProps>(function PageSlot(
  { pageNumber, pdfDoc, zoom, searchQuery, isInRenderWindow, naturalWidth, naturalHeight },
  ref
) {
  const displayW = Math.round(naturalWidth  * zoom);
  const displayH = Math.round(naturalHeight * zoom);

  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const textLayerRef      = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isInRenderWindow || !canvasRef.current || !textLayerRef.current || !highlightLayerRef.current) return;
    let cancelled = false;

    renderPage(pdfDoc, pageNumber, canvasRef.current, zoom)
      .then(() => {
        if (cancelled) return;
        return renderTextLayer(
          pdfDoc, pageNumber,
          textLayerRef.current!,
          highlightLayerRef.current!,
          zoom, searchQuery
        );
      })
      .catch((err) => {
        if (!cancelled) console.error(`Render error page ${pageNumber}:`, err);
      });

    return () => { cancelled = true; };
  }, [pdfDoc, pageNumber, zoom, searchQuery, isInRenderWindow]);

  return (
    <div
      ref={ref}
      className="page-slot"
      data-page={pageNumber}
      style={{ width: displayW, height: displayH }}
    >
      {isInRenderWindow ? (
        <>
          <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
          <div ref={textLayerRef}      className="textLayer" />
          <div ref={highlightLayerRef} className="highlightLayer" />
        </>
      ) : (
        <div className="page-placeholder" style={{ width: displayW, height: displayH }} />
      )}
    </div>
  );
});

export default PageSlot;
