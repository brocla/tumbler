/**
 * P1.1 — highlight crash on scanned PDFs (no text items)
 * P1.4 — getPageDimensions throws instead of using fallback for failed pages
 *
 * These tests document the desired behaviour AFTER the fixes.
 * They FAIL against the current code, proving the bugs exist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";

// ── Mock pdfjs-dist so importing pdfEngine doesn't spin up a worker ──────────
vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  // Must be a class/function (not an arrow fn) so `new TextLayer(...)` works.
  TextLayer: vi.fn(function MockTextLayer(this: { render: () => Promise<void> }) {
    this.render = vi.fn().mockResolvedValue(undefined);
  }),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { getPageDimensions, renderTextLayer } from "../utils/pdfEngine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePage(width = 612, height = 792) {
  return {
    getViewport: vi.fn().mockReturnValue({ width, height, convertToViewportPoint: vi.fn() }),
    getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

function makeDocWithFailingPage(failPage: number, totalPages = 3) {
  return {
    numPages: totalPages,
    getPage: vi.fn().mockImplementation(async (pageNum: number) => {
      if (pageNum === failPage) throw new Error(`Page ${pageNum} is corrupt`);
      return makePage();
    }),
  } as unknown as PDFDocumentProxy;
}

// ── P1.4 ─────────────────────────────────────────────────────────────────────

describe("P1.4: getPageDimensions handles single page failure gracefully", () => {
  it("returns an array with fallback for the failed page instead of throwing", async () => {
    const doc = makeDocWithFailingPage(2, 3);

    // BUG: the entire function throws because the for-loop awaits getPage(2)
    // and the rejection propagates uncaught.
    // DESIRED: return 3 entries; page 2 gets a US Letter fallback (612×792).
    const dims = await getPageDimensions(doc); // currently THROWS — test FAILS

    expect(dims).toHaveLength(3);
    expect(dims[0]).toEqual({ width: 612, height: 792 }); // page 1 — real
    expect(dims[1]).toEqual({ width: 612, height: 792 }); // page 2 — fallback
    expect(dims[2]).toEqual({ width: 612, height: 792 }); // page 3 — real
  });

  it("returns correct dimensions for the pages that succeed", async () => {
    const doc = {
      numPages: 3,
      getPage: vi.fn().mockImplementation(async (pageNum: number) => {
        if (pageNum === 2) throw new Error("corrupt");
        return makePage(pageNum === 1 ? 595 : 842, 841); // A4-ish
      }),
    } as unknown as PDFDocumentProxy;

    const dims = await getPageDimensions(doc); // currently THROWS — test FAILS

    expect(dims[0]).toEqual({ width: 595, height: 841 }); // page 1 correct
    expect(dims[2]).toEqual({ width: 842, height: 841 }); // page 3 correct
  });

  it("does not throw when the last page fails", async () => {
    const doc = makeDocWithFailingPage(3, 3);
    await expect(getPageDimensions(doc)).resolves.toHaveLength(3); // FAILS: rejects
  });

  it("does not throw when the first page fails", async () => {
    const doc = makeDocWithFailingPage(1, 3);
    await expect(getPageDimensions(doc)).resolves.toHaveLength(3); // FAILS: rejects
  });
});

// ── P1.1 ─────────────────────────────────────────────────────────────────────

describe("P1.1: renderTextLayer does not crash on scanned PDFs (no text items)", () => {
  let textContainer: HTMLDivElement;
  let highlightContainer: HTMLDivElement;

  beforeEach(() => {
    textContainer = document.createElement("div");
    highlightContainer = document.createElement("div");
    document.body.appendChild(textContainer);
    document.body.appendChild(highlightContainer);
  });

  it("does not throw when text content is empty and a search query is active", async () => {
    const mockPage = {
      ...makePage(),
      getViewport: vi.fn().mockReturnValue({
        width: 612,
        height: 792,
        convertToViewportPoint: vi.fn().mockReturnValue([0, 0]),
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };

    const mockDoc = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    } as unknown as PDFDocumentProxy;

    // Scanned PDF: no text items, but user searched for something.
    // Should silently produce no highlights, not crash.
    await expect(
      renderTextLayer(mockDoc, 1, textContainer, highlightContainer, 1.0, "hello")
    ).resolves.toBeUndefined();
  });

  it("produces no highlight elements when text content is empty", async () => {
    const mockPage = {
      ...makePage(),
      getViewport: vi.fn().mockReturnValue({
        width: 612,
        height: 792,
        convertToViewportPoint: vi.fn().mockReturnValue([0, 0]),
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };

    const mockDoc = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    } as unknown as PDFDocumentProxy;

    await renderTextLayer(mockDoc, 1, textContainer, highlightContainer, 1.0, "hello");

    expect(highlightContainer.querySelectorAll(".search-highlight")).toHaveLength(0);
  });
});
