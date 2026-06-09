/**
 * pdfEngine.ts
 *
 * Central place for all PDF.js and pdf-lib operations.
 * PDF.js handles rendering; pdf-lib handles modification.
 * Both receive the raw file bytes so they stay in sync.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { TextItem, TextContent } from "pdfjs-dist/types/src/display/api";
import { PDFDocument, degrees } from "pdf-lib";

// ---------------------------------------------------------------------------
// PDF.js worker setup
// Vite copies the worker to /assets automatically when imported this way.
// ---------------------------------------------------------------------------
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function loadPdfBytes(bytes: Uint8Array) {
  // Pass a copy so PDF.js can transfer the buffer to its worker without
  // detaching the original bytes that the rest of the app (pdf-lib, etc.) needs.
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const doc = await loadingTask.promise;
  return doc;
}

// ---------------------------------------------------------------------------
// Page render cache
//
// Keys are "docId:page:zoom". docId is the fingerprint from PDF.js so the
// cache is automatically scoped to the current document — opening a new file
// produces a different fingerprint and old entries become unreachable until
// evicted. Max 20 entries (LRU-ish via insertion order).
// ---------------------------------------------------------------------------

const PAGE_CACHE = new Map<string, ImageBitmap>();
const MAX_CACHE_SIZE = 20;

function cacheKey(docFingerprint: string, page: number, zoom: number) {
  return `${docFingerprint}:${page}:${zoom}`;
}

function cacheSet(key: string, bitmap: ImageBitmap) {
  if (PAGE_CACHE.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry (first inserted)
    const oldest = PAGE_CACHE.keys().next().value;
    if (oldest !== undefined) {
      PAGE_CACHE.get(oldest)?.close();
      PAGE_CACHE.delete(oldest);
    }
  }
  PAGE_CACHE.set(key, bitmap);
}

export function clearPageCache() {
  for (const bmp of PAGE_CACHE.values()) bmp.close();
  PAGE_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function renderToImageBitmap(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number
): Promise<ImageBitmap> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const offscreen = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = offscreen.getContext("2d")!;
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  page.cleanup();

  return offscreen.transferToImageBitmap();
}

export async function renderPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
) {
  const fp = doc.fingerprints[0] ?? "";
  const key = cacheKey(fp, pageNumber, scale);
  let bitmap = PAGE_CACHE.get(key);

  if (!bitmap) {
    bitmap = await renderToImageBitmap(doc, pageNumber, scale);
    cacheSet(key, bitmap);
  }

  const ctx = canvas.getContext("2d")!;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
}

/** Fire-and-forget: pre-render nearby pages into the cache. */
export function prefetchPages(
  doc: pdfjsLib.PDFDocumentProxy,
  centerPage: number,
  scale: number,
  radius = 2
) {
  const fp = doc.fingerprints[0] ?? "";
  const lo = Math.max(1, centerPage - radius);
  const hi = Math.min(doc.numPages, centerPage + radius);
  for (let p = lo; p <= hi; p++) {
    if (p === centerPage) continue;
    const key = cacheKey(fp, p, scale);
    if (!PAGE_CACHE.has(key)) {
      renderToImageBitmap(doc, p, scale)
        .then((bmp) => cacheSet(key, bmp))
        .catch(() => { /* prefetch errors are non-fatal */ });
    }
  }
}

// ---------------------------------------------------------------------------
// Text layer + search highlighting
// ---------------------------------------------------------------------------

export async function renderTextLayer(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  textContainer: HTMLDivElement,
  highlightContainer: HTMLDivElement,
  scale: number,
  searchQuery: string
): Promise<void> {
  textContainer.innerHTML = "";
  highlightContainer.innerHTML = "";

  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textContainer,
    viewport,
  });
  await textLayer.render();
  page.cleanup();

  if (searchQuery.trim()) {
    applyHighlights(textContent.items, textContainer, highlightContainer, viewport, searchQuery);
  }
}

// Reusable OffscreenCanvas for font measurement — avoids allocating per call.
const _measureCanvas = new OffscreenCanvas(1, 1);
const _measureCtx = _measureCanvas.getContext("2d")!;

/**
 * Given a TextItem and a character offset within it, return the x position
 * in PDF user space at that offset, using the actual rendered font for
 * proportional accuracy.
 */
function xAtChar(
  item: TextItem,
  charIdx: number,
  span: HTMLSpanElement | null
): number {
  const tx = item.transform[4];
  if (charIdx === 0 || item.width === 0 || item.str.length === 0) return tx;

  let ratio = charIdx / item.str.length; // character-count fallback

  if (span) {
    const font = getComputedStyle(span).font ?? "";
    if (font) {
      _measureCtx.font = font;
      const totalW = _measureCtx.measureText(item.str).width;
      if (totalW > 0) {
        const prefixW = _measureCtx.measureText(item.str.slice(0, charIdx)).width;
        ratio = prefixW / totalW;
      }
    }
  }

  return tx + item.width * ratio;
}

function applyHighlights(
  items: TextContent["items"],
  textContainer: HTMLDivElement,
  highlightContainer: HTMLDivElement,
  viewport: ReturnType<pdfjsLib.PDFPageProxy["getViewport"]>,
  query: string
) {
  const lower = query.toLowerCase();

  // Filter to real text items only (skip TextMarkedContent markers).
  const textItems = items.filter(
    (item): item is TextItem => "str" in item && item.str.length > 0
  );

  // Collect rendered spans in DOM order — PDF.js creates one span per text item.
  const spans = Array.from(
    textContainer.querySelectorAll<HTMLSpanElement>("span")
  ).filter((s) => s.textContent && s.textContent.length > 0);

  // Build a flat string across all items, recording which item+char each
  // position maps to. This lets us find matches that cross item boundaries.
  interface CharPos { itemIdx: number; charIdx: number; }
  const charMap: CharPos[] = [];
  let fullText = "";
  for (let i = 0; i < textItems.length; i++) {
    const str = textItems[i].str;
    for (let j = 0; j < str.length; j++) {
      charMap.push({ itemIdx: i, charIdx: j });
    }
    fullText += str;
  }

  const fullLower = fullText.toLowerCase();
  let pos = 0;
  let matchStart = fullLower.indexOf(lower, pos);

  while (matchStart !== -1) {
    const matchEnd = matchStart + lower.length;
    const startInfo = charMap[matchStart];
    const endInfo   = charMap[matchEnd - 1];

    // A match may span multiple items; emit one highlight rect per item segment.
    for (let ii = startInfo.itemIdx; ii <= endInfo.itemIdx; ii++) {
      const item = textItems[ii];
      const span = spans[ii] ?? null;

      const charStart = ii === startInfo.itemIdx ? startInfo.charIdx : 0;
      const charEnd   = ii === endInfo.itemIdx   ? endInfo.charIdx + 1 : item.str.length;

      const ty = item.transform[5];

      const xStart = xAtChar(item, charStart, span);
      const xEnd   = xAtChar(item, charEnd,   span);

      const [x1, y1] = viewport.convertToViewportPoint(xStart, ty + item.height);
      const [x2, y2] = viewport.convertToViewportPoint(xEnd,   ty);

      const mark = document.createElement("div");
      mark.className = "search-highlight";
      mark.style.left   = `${Math.min(x1, x2)}px`;
      mark.style.top    = `${Math.min(y1, y2)}px`;
      mark.style.width  = `${Math.abs(x2 - x1)}px`;
      mark.style.height = `${Math.abs(y2 - y1)}px`;
      highlightContainer.appendChild(mark);
    }

    pos = matchEnd;
    matchStart = fullLower.indexOf(lower, pos);
  }
}

// ---------------------------------------------------------------------------
// Text search
// Search all pages for the query string. Returns page numbers (1-indexed)
// that contain at least one match.
// ---------------------------------------------------------------------------

export async function searchAllPages(
  doc: pdfjsLib.PDFDocumentProxy,
  query: string
): Promise<number[]> {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();
  const matchingPages: number[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .toLowerCase();
    if (pageText.includes(lowerQuery)) {
      matchingPages.push(i);
    }
    page.cleanup();
  }

  return matchingPages;
}

// ---------------------------------------------------------------------------
// Text extraction  (Phase 4 feature — wired up here for reuse)
// ---------------------------------------------------------------------------

export async function extractAllText(
  doc: pdfjsLib.PDFDocumentProxy
): Promise<string> {
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(`--- Page ${i} ---\n${pageText}`);
    page.cleanup();
  }

  return pages.join("\n\n");
}

// ---------------------------------------------------------------------------
// Metadata  (pdf-lib)
// ---------------------------------------------------------------------------

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
}

export async function readMetadata(bytes: Uint8Array): Promise<PdfMetadata> {
  const pdfDoc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
  return {
    title: pdfDoc.getTitle() ?? "",
    author: pdfDoc.getAuthor() ?? "",
    subject: pdfDoc.getSubject() ?? "",
    keywords: pdfDoc.getKeywords() ?? "",
    creator: pdfDoc.getCreator() ?? "",
    producer: pdfDoc.getProducer() ?? "",
    creationDate: pdfDoc.getCreationDate()?.toISOString() ?? "",
    modificationDate: pdfDoc.getModificationDate()?.toISOString() ?? "",
  };
}

export async function writeMetadata(
  bytes: Uint8Array,
  meta: Partial<PdfMetadata>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes.slice());
  if (meta.title !== undefined) pdfDoc.setTitle(meta.title);
  if (meta.author !== undefined) pdfDoc.setAuthor(meta.author);
  if (meta.subject !== undefined) pdfDoc.setSubject(meta.subject);
  if (meta.keywords !== undefined) pdfDoc.setKeywords([meta.keywords]);
  if (meta.creator !== undefined) pdfDoc.setCreator(meta.creator);
  pdfDoc.setModificationDate(new Date());
  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Document operations (Phase 2 — stubs ready to implement)
// ---------------------------------------------------------------------------

export async function mergepdfs(fileList: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of fileList) {
    const src = await PDFDocument.load(bytes.slice());
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}

export async function splitPdf(
  bytes: Uint8Array,
  ranges: { start: number; end: number }[]
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes.slice());
  const results: Uint8Array[] = [];
  for (const range of ranges) {
    const part = await PDFDocument.create();
    // convert 1-indexed page numbers to 0-indexed
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_, i) => range.start - 1 + i
    );
    const pages = await part.copyPages(src, indices);
    pages.forEach((p) => part.addPage(p));
    results.push(await part.save());
  }
  return results;
}

export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number, // 0-indexed
  deg: 90 | 180 | 270
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes.slice());
  const page = pdfDoc.getPage(pageIndex);
  page.setRotation(degrees((page.getRotation().angle + deg) % 360));
  return pdfDoc.save();
}

export async function deletePage(
  bytes: Uint8Array,
  pageIndex: number // 0-indexed
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes.slice());
  pdfDoc.removePage(pageIndex);
  return pdfDoc.save();
}

export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[] // 0-indexed page indices in desired order
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes.slice());
  const reordered = await PDFDocument.create();
  const pages = await reordered.copyPages(src, newOrder);
  pages.forEach((p) => reordered.addPage(p));
  return reordered.save();
}
