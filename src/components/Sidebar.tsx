import { usePdfStore } from "../store/usePdfStore";
import ThumbnailPanel from "./ThumbnailPanel";
import SearchPanel from "./SearchPanel";
import MetadataPanel from "./MetadataPanel";
import { useSidebarResize } from "../hooks/useSidebarResize";

export default function Sidebar() {
  const activeTool = usePdfStore((s) => s.activeTool);
  const { onMouseDown } = useSidebarResize();

  if (activeTool === "none") return null;

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {activeTool === "thumbnails" && <ThumbnailPanel />}
        {activeTool === "search"     && <SearchPanel />}
        {activeTool === "metadata"   && <MetadataPanel />}
      </div>
      <div className="sidebar-resize-handle" onMouseDown={onMouseDown} />
    </div>
  );
}
