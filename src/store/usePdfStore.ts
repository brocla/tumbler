import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { clearPageCache } from "../utils/pdfEngine";

export type DarkMode = "off" | "invert" | "sepia";

function loadSidebarWidth(): number {
  return Math.max(150, Math.min(500, Number(localStorage.getItem("sidebar-width")) || 220));
}

export interface PdfStore {
  // ── Loaded document ──────────────────────────────────────────────────────
  /** Raw bytes of the currently open file (used to reload into pdf-lib) */
  fileBytes: Uint8Array | null;
  /** PDF.js document proxy for rendering */
  pdfDoc: PDFDocumentProxy | null;
  /** Human-readable filename shown in the title bar */
  fileName: string;
  /** Total page count of the loaded document */
  pageCount: number;

  // ── Viewer state ─────────────────────────────────────────────────────────
  currentPage: number;
  zoom: number; // 1.0 = 100%
  darkMode: DarkMode;

  // ── Search ───────────────────────────────────────────────────────────────
  searchQuery: string;
  searchResults: number[]; // page numbers that contain a match
  searchResultIndex: number;

  // ── UI panels ────────────────────────────────────────────────────────────
  activeTool: "none" | "search" | "metadata" | "thumbnails";
  sidebarWidth: number;
  searchFocusToken: number; // increments each time search input should be focused

  // ── Actions ──────────────────────────────────────────────────────────────
  setFile: (bytes: Uint8Array, doc: PDFDocumentProxy, name: string) => void;
  clearFile: () => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setDarkMode: (mode: DarkMode) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (pages: number[], index: number) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  setActiveTool: (tool: PdfStore["activeTool"]) => void;
  setSidebarWidth: (w: number) => void;
  focusSearch: () => void;
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  fileBytes: null,
  pdfDoc: null,
  fileName: "",
  pageCount: 0,

  currentPage: 1,
  zoom: 1.0,
  darkMode: "off",

  searchQuery: "",
  searchResults: [],
  searchResultIndex: 0,

  activeTool: "thumbnails",
  sidebarWidth: loadSidebarWidth(),
  searchFocusToken: 0,

  setFile: (bytes, doc, name) => {
    clearPageCache();
    set({
      fileBytes: bytes,
      pdfDoc: doc,
      fileName: name,
      pageCount: doc.numPages,
      currentPage: 1,
      searchQuery: "",
      searchResults: [],
      searchResultIndex: 0,
    });
  },

  clearFile: () =>
    set({
      fileBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      currentPage: 1,
      searchQuery: "",
      searchResults: [],
      searchResultIndex: 0,
    }),

  setCurrentPage: (page) => {
    const { pageCount } = get();
    set({ currentPage: Math.max(1, Math.min(page, pageCount)) });
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.10, Math.min(zoom, 4.0)) }),

  setDarkMode: (mode) => set({ darkMode: mode }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSearchResults: (pages, index) =>
    set({ searchResults: pages, searchResultIndex: index }),

  nextSearchResult: () => {
    const { searchResults, searchResultIndex, setCurrentPage } = get();
    if (!searchResults.length) return;
    const next = (searchResultIndex + 1) % searchResults.length;
    set({ searchResultIndex: next });
    setCurrentPage(searchResults[next]);
  },

  prevSearchResult: () => {
    const { searchResults, searchResultIndex, setCurrentPage } = get();
    if (!searchResults.length) return;
    const prev =
      (searchResultIndex - 1 + searchResults.length) % searchResults.length;
    set({ searchResultIndex: prev });
    setCurrentPage(searchResults[prev]);
  },

  setActiveTool: (tool) => set({ activeTool: tool }),

  setSidebarWidth: (w) => {
    const clamped = Math.max(150, Math.min(500, w));
    localStorage.setItem("sidebar-width", String(clamped));
    set({ sidebarWidth: clamped });
  },

  focusSearch: () => set((s) => ({
    activeTool: "search",
    searchFocusToken: s.searchFocusToken + 1,
  })),
}));
