import { LayoutGrid, Search, Info, type LucideIcon } from "lucide-react";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";

type Tool = "thumbnails" | "search" | "metadata";

const TOOLS: { id: Tool; Icon: LucideIcon; label: string }[] = [
  { id: "thumbnails", Icon: LayoutGrid, label: "Pages"            },
  { id: "search",     Icon: Search,     label: "Search (Ctrl+F)"  },
  { id: "metadata",   Icon: Info,       label: "Document info"    },
];

export default function IconRail() {
  const pdfDoc = useActiveTab()?.pdfDoc;
  const { activeTool, setActiveTool, focusSearch } = usePdfStore();

  const handleClick = (id: Tool) => {
    if (!pdfDoc) return;
    if (activeTool === id) {
      setActiveTool("none");
    } else if (id === "search") {
      focusSearch();
    } else {
      setActiveTool(id);
    }
  };

  return (
    <div className="icon-rail" role="toolbar" aria-label="Panel switcher">
      {TOOLS.map(({ id, Icon, label }) => (
        <button
          key={id}
          className={`icon-rail-btn ${activeTool === id ? "active" : ""}`}
          title={label}
          aria-label={label}
          aria-pressed={activeTool === id}
          onClick={() => handleClick(id)}
          disabled={!pdfDoc}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
