import { useState, useRef, useEffect } from "react";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";
import { searchAllPages } from "../utils/pdfEngine";

export default function SearchPanel() {
  const tab = useActiveTab();
  const { pdfDoc, searchQuery, searchResults, searchResultIndex, searchFocusToken } = tab;
  const { setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult, requestJumpToPage } =
    usePdfStore.getState();

  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select-all every time focusSearch() is called (token increments)
  useEffect(() => {
    if (searchFocusToken === 0) return; // skip initial render
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
    setLoading(true);
    const pages = await searchAllPages(pdfDoc, q);
    setSearchResults(pages, 0);
    if (pages.length) requestJumpToPage(pages[0]);
    setLoading(false);
  };

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
        <div className="search-page-list">
          {searchResults.map((page, idx) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
