import { useEffect, useRef, useLayoutEffect, useCallback, createRef } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { prefetchPages } from "../utils/pdfEngine";
import { PAGE_GAP, VIEWER_PADDING_TOP } from "../utils/viewerConstants";
import PageSlot from "./PageSlot";

const ZOOM_STEP   = 0.12;
const RENDER_RADIUS = 2;

/** Sum of slot heights + gaps above a given 1-indexed page at the current zoom. */
function scrollTopForPage(
  page: number,
  zoom: number,
  dims: Array<{ width: number; height: number }>
): number {
  let top = VIEWER_PADDING_TOP;
  for (let i = 0; i < page - 1; i++) {
    top += Math.round(dims[i].height * zoom) + PAGE_GAP;
  }
  return top;
}

export default function ContinuousViewer() {
  const {
    pdfDoc, pageCount, pageDimensions, currentPage, zoom, searchQuery,
    setCurrentPage, setZoom, focusSearch,
    jumpToPage, clearJumpRequest, requestJumpToPage,
  } = usePdfStore();

  const scrollRef   = useRef<HTMLDivElement>(null);
  const anchorPage  = useRef<number>(1);   // page captured before zoom change
  const prevZoom    = useRef<number>(zoom);

  // One ref per page slot — stable across renders
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  if (pageRefs.current.length !== pageCount) {
    pageRefs.current = Array.from({ length: pageCount }, () => createRef<HTMLDivElement>());
  }

  // ── IntersectionObserver: track which page is most visible ───────────────
  // Depends on pageDimensions.length so it re-runs after slots are rendered
  // (pageDimensions arrives after pdfDoc, so slots don't exist on first run)
  useEffect(() => {
    if (!scrollRef.current || pageCount === 0 || pageDimensions.length === 0) return;

    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          ratios.set(page, entry.intersectionRatio);
        }
        let bestPage = 1;
        let bestRatio = -1;
        for (const [page, ratio] of ratios) {
          if (ratio > bestRatio) { bestRatio = ratio; bestPage = page; }
        }
        setCurrentPage(bestPage);
      },
      { root: scrollRef.current, threshold: [0, 0.25, 0.5, 0.75, 1.0] }
    );

    for (const ref of pageRefs.current) {
      if (ref.current) observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [pdfDoc, pageCount, pageDimensions.length, setCurrentPage]);

  // ── Jump to page signal ───────────────────────────────────────────────────
  useEffect(() => {
    if (jumpToPage === null || !scrollRef.current || pageDimensions.length === 0) return;
    const targetScrollTop = scrollTopForPage(jumpToPage, zoom, pageDimensions);
    scrollRef.current.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    clearJumpRequest();
  }, [jumpToPage, clearJumpRequest, zoom, pageDimensions]);

  // ── Prefetch neighbors when currentPage changes ──────────────────────────
  useEffect(() => {
    if (pdfDoc) prefetchPages(pdfDoc, currentPage, zoom);
  }, [pdfDoc, currentPage, zoom]);

  // ── Zoom: capture anchor page before change, restore scroll after ─────────
  const handleZoom = useCallback((factor: number) => {
    anchorPage.current = currentPage;
    prevZoom.current   = zoom;
    setZoom(zoom * factor);
  }, [currentPage, zoom, setZoom]);

  useLayoutEffect(() => {
    if (!scrollRef.current || pageDimensions.length === 0) return;
    if (zoom === prevZoom.current) return; // no zoom change yet
    const newScrollTop = scrollTopForPage(anchorPage.current, zoom, pageDimensions);
    scrollRef.current.scrollTop = newScrollTop;
    prevZoom.current = zoom;
  }, [zoom, pageDimensions]);

  // ── Wheel: Ctrl = zoom, plain = free scroll ──────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return; // let normal scroll pass through
    e.preventDefault();
    const factor = e.deltaY < 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP);
    handleZoom(factor);
  }, [handleZoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Ctrl+F ────────────────────────────────────────────────────────────────
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

  // ── Page Up / Down keyboard navigation ───────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PageDown") { e.preventDefault(); requestJumpToPage(currentPage + 1); }
      if (e.key === "PageUp")   { e.preventDefault(); requestJumpToPage(currentPage - 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, requestJumpToPage]);

  if (!pdfDoc || pageDimensions.length === 0) {
    return <div className="viewer-area" ref={scrollRef} />;
  }

  return (
    <div className="viewer-area" ref={scrollRef}>
      {Array.from({ length: pageCount }, (_, i) => {
        const pageNumber = i + 1;
        const isInRenderWindow = Math.abs(pageNumber - currentPage) <= RENDER_RADIUS;
        const dim = pageDimensions[i];
        return (
          <PageSlot
            key={pageNumber}
            ref={pageRefs.current[i]}
            pageNumber={pageNumber}
            pdfDoc={pdfDoc}
            zoom={zoom}
            searchQuery={searchQuery}
            isInRenderWindow={isInRenderWindow}
            naturalWidth={dim.width}
            naturalHeight={dim.height}
          />
        );
      })}
    </div>
  );
}
