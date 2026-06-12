import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ZOOM_MIN, ZOOM_MAX } from "../utils/zoomConstants";
import { clearPageCacheForDoc } from "../utils/pageCache";

export type DarkMode = "off" | "invert" | "sepia";

function loadSidebarWidth(): number {
  return Math.max(150, Math.min(500, Number(localStorage.getItem("sidebar-width")) || 220));
}

// ── Per-tab state ─────────────────────────────────────────────────────────────
export interface TabState {
  id: string;
  fileBytes: Uint8Array | null;
  pdfDoc: PDFDocumentProxy | null;
  fileName: string;
  pageCount: number;
  pageDimensions: Array<{ width: number; height: number }>;
  currentPage: number;
  zoom: number;
  darkMode: DarkMode;
  scrollTop: number;
  searchQuery: string;
  searchResults: number[];
  searchResultIndex: number;
  searchFocusToken: number;
  jumpToPage: number | null;
  isLoading: boolean;
  metadataDirty: boolean;
  zoomMode: "numeric" | "fit-width" | "fit-page";
}

function newTab(): TabState {
  return {
    id: crypto.randomUUID(),
    fileBytes: null,
    pdfDoc: null,
    fileName: "",
    pageCount: 0,
    pageDimensions: [],
    currentPage: 1,
    zoom: 1.0,
    darkMode: "off",
    scrollTop: 0,
    searchQuery: "",
    searchResults: [],
    searchResultIndex: 0,
    searchFocusToken: 0,
    jumpToPage: null,
    isLoading: false,
    metadataDirty: false,
    zoomMode: "numeric",
  };
}

// ── Store interface ───────────────────────────────────────────────────────────
export interface PdfStore {
  // ── Tab management ──────────────────────────────────────────────────────
  tabs: TabState[];
  activeTabId: string;

  // ── Global UI (not per-tab) ─────────────────────────────────────────────
  activeTool: "none" | "search" | "metadata" | "thumbnails";
  sidebarWidth: number;
  printDialogOpen: boolean;

  // ── Tab actions ─────────────────────────────────────────────────────────
  openNewTab: () => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  saveScrollTop: (id: string, scrollTop: number) => void;
  reorderTabs: (fromId: string, toIndex: number) => void;

  // ── Per-active-tab actions ──────────────────────────────────────────────
  setFile: (bytes: Uint8Array, doc: PDFDocumentProxy, name: string) => void;
  clearFile: () => void;
  setPageDimensions: (dims: Array<{ width: number; height: number }>) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (mode: TabState["zoomMode"]) => void;
  setDarkMode: (mode: DarkMode) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (pages: number[], index: number, tabId?: string) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  requestJumpToPage: (page: number) => void;
  clearJumpRequest: () => void;
  focusSearch: () => void;
  setLoading: (v: boolean) => void;
  setMetadataDirty: (dirty: boolean) => void;

  // ── Global actions ──────────────────────────────────────────────────────
  setActiveTool: (tool: PdfStore["activeTool"]) => void;
  setSidebarWidth: (w: number) => void;
  setPrintDialogOpen: (v: boolean) => void;
}

// ── Helper: patch the active tab ──────────────────────────────────────────────
function patchActive(
  set: (fn: (s: PdfStore) => Partial<PdfStore>) => void,
  get: () => PdfStore,
  patch: Partial<TabState>
) {
  const { activeTabId } = get();
  set((s) => ({
    tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, ...patch } : t)),
  }));
}

// ── Exported selector ─────────────────────────────────────────────────────────
const EMPTY_TAB = newTab();
export const useActiveTab = () =>
  usePdfStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? EMPTY_TAB);

// ── Store ─────────────────────────────────────────────────────────────────────
export const usePdfStore = create<PdfStore>((set, get) => ({
  tabs: [],
  activeTabId: "",

  activeTool: "thumbnails",
  sidebarWidth: loadSidebarWidth(),
  printDialogOpen: false,

  // ── Tab management ────────────────────────────────────────────────────────
  openNewTab: () => {
    const tab = newTab();
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (id) => {
    // Release resources eagerly before removing from state
    const closing = get().tabs.find((t) => t.id === id);
    if (closing?.pdfDoc) {
      clearPageCacheForDoc(closing.pdfDoc.fingerprints[0] ?? "");
      closing.pdfDoc.destroy();
    }
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        return { tabs: [], activeTabId: "" };
      }
      const activeTabId =
        s.activeTabId === id
          ? (remaining[s.tabs.findIndex((t) => t.id === id) - 1] ?? remaining[0]).id
          : s.activeTabId;
      return { tabs: remaining, activeTabId };
    });
  },

  switchTab: (id) => set({ activeTabId: id }),

  saveScrollTop: (id, scrollTop) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, scrollTop } : t)),
    })),

  reorderTabs: (fromId, toIndex) =>
    set((s) => {
      const tabs = [...s.tabs];
      const fromIdx = tabs.findIndex((t) => t.id === fromId);
      if (fromIdx === -1) return s;
      const [moved] = tabs.splice(fromIdx, 1);
      // toIndex was computed before removal; adjust if inserting after the removed slot
      const insertAt = toIndex > fromIdx ? toIndex - 1 : toIndex;
      tabs.splice(insertAt, 0, moved);
      return { tabs };
    }),

  // ── Per-tab actions ───────────────────────────────────────────────────────
  setFile: (bytes, doc, name) =>
    patchActive(set, get, {
      fileBytes: bytes,
      pdfDoc: doc,
      fileName: name,
      pageCount: doc.numPages,
      pageDimensions: [],
      currentPage: 1,
      scrollTop: 0,
      jumpToPage: null,
      searchQuery: "",
      searchResults: [],
      searchResultIndex: 0,
    }),

  clearFile: () =>
    patchActive(set, get, {
      fileBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      pageDimensions: [],
      currentPage: 1,
      scrollTop: 0,
      jumpToPage: null,
      searchQuery: "",
      searchResults: [],
      searchResultIndex: 0,
    }),

  setPageDimensions: (dims) => patchActive(set, get, { pageDimensions: dims }),

  setCurrentPage: (page) => {
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    if (!tab) return;
    patchActive(set, get, { currentPage: Math.max(1, Math.min(page, tab.pageCount)) });
  },

  setZoom: (zoom) => patchActive(set, get, {
    zoom: Math.max(ZOOM_MIN, Math.min(zoom, ZOOM_MAX)),
    zoomMode: "numeric",
  }),

  setZoomMode: (mode) => patchActive(set, get, { zoomMode: mode }),

  setDarkMode: (mode) => patchActive(set, get, { darkMode: mode }),

  setSearchQuery: (q) => patchActive(set, get, { searchQuery: q }),

  setSearchResults: (pages, index, tabId) => {
    // Use the caller-supplied tabId when provided (async search started on a
    // different tab than the one that is currently active).
    const targetId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === targetId ? { ...t, searchResults: pages, searchResultIndex: index } : t
      ),
    }));
  },

  nextSearchResult: () => {
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    if (!tab || !tab.searchResults.length) return;
    const next = (tab.searchResultIndex + 1) % tab.searchResults.length;
    patchActive(set, get, { searchResultIndex: next });
    get().requestJumpToPage(tab.searchResults[next]);
  },

  prevSearchResult: () => {
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    if (!tab || !tab.searchResults.length) return;
    const prev = (tab.searchResultIndex - 1 + tab.searchResults.length) % tab.searchResults.length;
    patchActive(set, get, { searchResultIndex: prev });
    get().requestJumpToPage(tab.searchResults[prev]);
  },

  requestJumpToPage: (page) => {
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    if (!tab) return;
    patchActive(set, get, { jumpToPage: Math.max(1, Math.min(page, tab.pageCount)) });
  },

  clearJumpRequest: () => patchActive(set, get, { jumpToPage: null }),

  setLoading: (v) => patchActive(set, get, { isLoading: v }),

  setMetadataDirty: (dirty) => patchActive(set, get, { metadataDirty: dirty }),

  focusSearch: () => {
    const { activeTabId } = get();
    set((s) => ({
      activeTool: "search",
      tabs: s.tabs.map((t) =>
        t.id === activeTabId ? { ...t, searchFocusToken: t.searchFocusToken + 1 } : t
      ),
    }));
  },

  // ── Global actions ────────────────────────────────────────────────────────
  setActiveTool: (tool) => set({ activeTool: tool }),

  setPrintDialogOpen: (v) => set({ printDialogOpen: v }),

  setSidebarWidth: (w) => {
    const clamped = Math.max(150, Math.min(500, w));
    localStorage.setItem("sidebar-width", String(clamped));
    set({ sidebarWidth: clamped });
  },
}));
