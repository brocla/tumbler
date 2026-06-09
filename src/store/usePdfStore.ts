import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { clearPageCache } from "../utils/pdfEngine";

export type DarkMode = "off" | "invert" | "sepia";

function loadSidebarWidth(): number {
  return Math.max(150, Math.min(500, Number(localStorage.getItem("sidebar-width")) || 220));
}

export interface PdfStore {
  // ── Loaded document ──────────────────────────────────────────────────────
  fileBytes: Uint8Array | null;
  pdfDoc: PDFDocumentProxy | null;
  fileName: string;
  pageCount: number;
  /** Natural (scale=1) dimensions for every page, index 0-based */
  pageDimensions: Array<{ width: number; height: number }>;

  // ── Viewer state ─────────────────────────────────────────────────────────
  currentPage: number;
  zoom: number;
  darkMode: DarkMode;

  // ── Search ───────────────────────────────────────────────────────────────
  searchQuery: string;
  searchResults: number[];
  searchResultIndex: number;

  // ── UI panels ────────────────────────────────────────────────────────────
  activeTool: "none" | "search" | "metadata" | "thumbnails";
  sidebarWidth: number;
  searchFocusToken: number;

  // ── Imperative scroll signal ──────────────────────────────────────────────
  /** Non-null when a component should scroll to this page then clear it */
  jumpToPage: number | null;

  // ── Actions ──────────────────────────────────────────────────────────────
  setFile: (bytes: Uint8Array, doc: PDFDocumentProxy, name: string) => void;
  clearFile: () => void;
  setPageDimensions: (dims: Array<{ width: number; height: number }>) => void;
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
  requestJumpToPage: (page: number) => void;
  clearJumpRequest: () => void;
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  fileBytes: null,
  pdfDoc: null,
  fileName: "",
  pageCount: 0,
  pageDimensions: [],

  currentPage: 1,
  zoom: 1.0,
  darkMode: "off",

  searchQuery: "",
  searchResults: [],
  searchResultIndex: 0,

  activeTool: "thumbnails",
  sidebarWidth: loadSidebarWidth(),
  searchFocusToken: 0,

  jumpToPage: null,

  setFile: (bytes, doc, name) => {
    clearPageCache();
    set({
      fileBytes: bytes,
      pdfDoc: doc,
      fileName: name,
      pageCount: doc.numPages,
      pageDimensions: [],
      currentPage: 1,
      jumpToPage: null,
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
      pageDimensions: [],
      currentPage: 1,
      jumpToPage: null,
      searchQuery: "",
      searchResults: [],
      searchResultIndex: 0,
    }),

  setPageDimensions: (dims) => set({ pageDimensions: dims }),

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
    const { searchResults, searchResultIndex } = get();
    if (!searchResults.length) return;
    const next = (searchResultIndex + 1) % searchResults.length;
    set({ searchResultIndex: next });
    get().requestJumpToPage(searchResults[next]);
  },

  prevSearchResult: () => {
    const { searchResults, searchResultIndex } = get();
    if (!searchResults.length) return;
    const prev = (searchResultIndex - 1 + searchResults.length) % searchResults.length;
    set({ searchResultIndex: prev });
    get().requestJumpToPage(searchResults[prev]);
  },

  setActiveTool: (tool) => set({ activeTool: tool }),

  setSidebarWidth: (w) => {
    const clamped = Math.max(150, Math.min(500, w));
    localStorage.setItem("sidebar-width", String(clamped));
    set({ sidebarWidth: clamped });
  },

  focusSearch: () =>
    set((s) => ({
      activeTool: "search",
      searchFocusToken: s.searchFocusToken + 1,
    })),

  requestJumpToPage: (page) => {
    const { pageCount } = get();
    set({ jumpToPage: Math.max(1, Math.min(page, pageCount)) });
  },

  clearJumpRequest: () => set({ jumpToPage: null }),
}));
