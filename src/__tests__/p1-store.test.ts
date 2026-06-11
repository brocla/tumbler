/**
 * P1.2 — requestJumpToPage crashes with no active tab
 * P1.3 — search results bleed to wrong tab on async tab switch
 *
 * These tests document the desired behaviour AFTER the fixes.
 * They FAIL against the current code, proving the bugs exist.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { usePdfStore } from "../store/usePdfStore";
import type { TabState } from "../store/usePdfStore";

/** Minimal TabState factory — mirrors newTab() in the store */
function makeTab(overrides: Partial<TabState> = {}): TabState {
  return {
    id: crypto.randomUUID(),
    fileBytes: null,
    pdfDoc: null,
    fileName: "",
    pageCount: 10,
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
    ...overrides,
  };
}

// ── P1.2 ─────────────────────────────────────────────────────────────────────

describe("P1.2: store actions are safe when no tabs are open", () => {
  beforeEach(() => {
    usePdfStore.setState({ tabs: [], activeTabId: "" });
  });

  it("requestJumpToPage does not throw with empty tabs", () => {
    // BUG: get().tabs.find(...)! returns undefined; tab.pageCount throws
    // TypeError: Cannot read properties of undefined (reading 'pageCount')
    expect(() => usePdfStore.getState().requestJumpToPage(1)).not.toThrow();
  });

  it("nextSearchResult does not throw with empty tabs", () => {
    // nextSearchResult calls requestJumpToPage internally
    usePdfStore.setState({ tabs: [], activeTabId: "" });
    expect(() => usePdfStore.getState().nextSearchResult()).not.toThrow();
  });

  it("prevSearchResult does not throw with empty tabs", () => {
    usePdfStore.setState({ tabs: [], activeTabId: "" });
    expect(() => usePdfStore.getState().prevSearchResult()).not.toThrow();
  });

  it("setCurrentPage does not throw with empty tabs", () => {
    // BUG: same pattern — get().tabs.find(...)! used in setCurrentPage
    expect(() => usePdfStore.getState().setCurrentPage(1)).not.toThrow();
  });
});

// ── P1.3 ─────────────────────────────────────────────────────────────────────

describe("P1.3: search results go to the tab where the search started", () => {
  beforeEach(() => {
    usePdfStore.setState({ tabs: [], activeTabId: "" });
  });

  it("setSearchResults applies to the tab that was active when search began, not the current active tab", () => {
    const tab1 = makeTab();
    const tab2 = makeTab();
    usePdfStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });

    // Scenario: user starts a search on tab1, then switches to tab2
    // while searchAllPages() is still running asynchronously.
    // The caller captures tab1.id before the async gap and passes it here.
    const searchTabId = tab1.id;
    usePdfStore.setState({ activeTabId: tab2.id });

    // Simulate the async callback landing after the tab switch:
    usePdfStore.getState().setSearchResults([3, 7, 12], 0, searchTabId);

    const state = usePdfStore.getState();
    const t1 = state.tabs.find((t) => t.id === tab1.id)!;
    const t2 = state.tabs.find((t) => t.id === tab2.id)!;

    expect(t1.searchResults).toEqual([3, 7, 12]);
    expect(t2.searchResults).toEqual([]);
  });

  it("search result index lands on the correct tab", () => {
    const tab1 = makeTab();
    const tab2 = makeTab();
    usePdfStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
    const searchTabId = tab1.id;
    usePdfStore.setState({ activeTabId: tab2.id });

    usePdfStore.getState().setSearchResults([5], 0, searchTabId);

    const t1 = usePdfStore.getState().tabs.find((t) => t.id === tab1.id)!;
    expect(t1.searchResultIndex).toBe(0);
    expect(t1.searchResults).toHaveLength(1);
  });
});
