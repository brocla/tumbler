import { useState } from "react";
import { usePdfStore } from "../store/usePdfStore";
import { searchAllPages } from "../utils/pdfEngine";

export default function SearchPanel() {
  const {
    pdfDoc, searchQuery, searchResults, searchResultIndex,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    setCurrentPage,
  } = usePdfStore();

  const [loading, setLoading] = useState(false);

  const runSearch = async (q: string) => {
    setSearchQuery(q);
    if (!pdfDoc || !q.trim()) {
      setSearchResults([], 0);
      return;
    }
    setLoading(true);
    const pages = await searchAllPages(pdfDoc, q);
    setSearchResults(pages, 0);
    if (pages.length) setCurrentPage(pages[0]);
    setLoading(false);
  };

  return (
    <div className="search-panel">
      <input
        type="search"
        placeholder="Search document…"
        value={searchQuery}
        onChange={(e) => runSearch(e.target.value)}
        autoFocus
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
                setCurrentPage(page);
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
