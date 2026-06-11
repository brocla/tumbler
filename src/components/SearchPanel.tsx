import { useState, useRef, useEffect } from "react";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";
import { searchAllPages } from "../utils/pdfEngine";

const PAGE_SIZE = 20;

export default function SearchPanel() {
  const tab = useActiveTab();
  const { pdfDoc, searchQuery, searchResults, searchResultIndex, searchFocusToken } = tab;
  const { setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult, requestJumpToPage } =
    usePdfStore.getState();

  const [loading, setLoading] = useState(false);
  const [listPage, setListPage] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset list page whenever results change
  useEffect(() => { setListPage(0); }, [searchResults]);

  // Ensure the active result is visible in the current list page
  useEffect(() => {
    if (searchResults.length === 0) return;
    const targetPage = Math.floor(searchResultIndex / PAGE_SIZE);
    setListPage(targetPage);
  }, [searchResultIndex, searchResults.length]);

  // Focus and select-all every time focusSearch() is called (token increments)
  useEffect(() => {
    if (searchFocusToken === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [searchFocusToken]);

  const runSearch = async (q: string) => {
    setSearchQuery(q);
    if (!pdfDoc || !q.trim()) {
      setSearchResults([], 0);
      return;
    }
    const searchTabId = usePdfStore.getState().activeTabId;
    setLoading(true);
    const pages = await searchAllPages(pdfDoc, q);
    setSearchResults(pages, 0, searchTabId);
    if (pages.length) requestJumpToPage(pages[0]);
    setLoading(false);
  };

  const totalListPages = Math.ceil(searchResults.length / PAGE_SIZE);
  const visibleResults = searchResults.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);

  return (
    <div className="search-panel">
      <input
        type="search"
        ref={inputRef}
        placeholder="Search document…"
        value={searchQuery}
        onChange={(e) => runSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (e.shiftKey) prevSearchResult(); else nextSearchResult();
          }
        }}
        style={{ width: "100%" }}
      />

      {loading && <span className="search-result-count">Searching…</span>}

      {!loading && searchQuery && (
        <span className="search-result-count">
          {searchResults.length === 0
            ? "No results"
            : `${searchResultIndex + 1} of ${searchResults.length} pages`}
        </span>
      )}

      {searchResults.length > 1 && (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={prevSearchResult} style={{ flex: 1 }}>↑ Prev</button>
          <button onClick={nextSearchResult} style={{ flex: 1 }}>↓ Next</button>
        </div>
      )}

      {searchResults.length > 0 && (
        <>
          <div className="search-page-list">
            {visibleResults.map((page, i) => {
              const idx = listPage * PAGE_SIZE + i;
              return (
                <div
                  key={page}
                  className={`search-page-item ${idx === searchResultIndex ? "active" : ""}`}
                  onClick={() => {
                    usePdfStore.getState().setSearchResults(searchResults, idx);
                    requestJumpToPage(page);
                  }}
                >
                  Page {page}
                </div>
              );
            })}
          </div>

          {totalListPages > 1 && (
            <div className="search-list-pager">
              <button
                onClick={() => setListPage((p) => p - 1)}
                disabled={listPage === 0}
                aria-label="Previous results page"
              >
                ‹
              </button>
              <span>{listPage + 1} / {totalListPages}</span>
              <button
                onClick={() => setListPage((p) => p + 1)}
                disabled={listPage >= totalListPages - 1}
                aria-label="Next results page"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
