/**
 * pdfEngine.ts
 *
 * Central place for all PDF.js and pdf-lib operations.
 * PDF.js handles rendering; pdf-lib handles modification.
 * Both receive the raw file bytes so they stay in sync.
 */

import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

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
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  return doc;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export async function renderPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const ctx = canvas.getContext("2d")!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
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
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
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
  const pdfDoc = await PDFDocument.load(bytes);
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
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}

export async function splitPdf(
  bytes: Uint8Array,
  ranges: { start: number; end: number }[]
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes);
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
  degrees: 90 | 180 | 270
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(pageIndex);
  page.setRotation({ type: "degrees", angle: (page.getRotation().angle + degrees) % 360 });
  return pdfDoc.save();
}

export async function deletePage(
  bytes: Uint8Array,
  pageIndex: number // 0-indexed
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  pdfDoc.removePage(pageIndex);
  return pdfDoc.save();
}

export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[] // 0-indexed page indices in desired order
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const reordered = await PDFDocument.create();
  const pages = await reordered.copyPages(src, newOrder);
  pages.forEach((p) => reordered.addPage(p));
  return reordered.save();
}
