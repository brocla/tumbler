import { usePdfStore } from "../store/usePdfStore";
import ThumbnailPanel from "./ThumbnailPanel";
import SearchPanel from "./SearchPanel";
import MetadataPanel from "./MetadataPanel";

export default function Sidebar() {
  const { pdfDoc, activeTool, setActiveTool, focusSearch } = usePdfStore();

  if (!pdfDoc) return <div className="sidebar" />;

  return (
    <div className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        {(["thumbnails", "search", "metadata"] as const).map((tab) => (
          <div
            key={tab}
            role="tab"
            aria-selected={activeTool === tab}
            className={`sidebar-tab ${activeTool === tab ? "active" : ""}`}
            onClick={() => tab === "search" ? focusSearch() : setActiveTool(tab)}
          >
            {tab === "thumbnails" ? "Pages" : tab === "search" ? "Search" : "Info"}
          </div>
        ))}
      </div>

      <div className="sidebar-content">
        {activeTool === "thumbnails" && <ThumbnailPanel />}
        {activeTool === "search" && <SearchPanel />}
        {activeTool === "metadata" && <MetadataPanel />}
      </div>
    </div>
  );
}
