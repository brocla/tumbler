import { usePdfStore, useActiveTab } from "../store/usePdfStore";

type Tool = "thumbnails" | "search" | "metadata";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "thumbnails", icon: "▦", label: "Pages"         },
  { id: "search",     icon: "🔍", label: "Search (Ctrl+F)" },
  { id: "metadata",   icon: "ℹ",  label: "Document info" },
];

export default function IconRail() {
  const pdfDoc = useActiveTab()?.pdfDoc;
  const { activeTool, setActiveTool, focusSearch } = usePdfStore();

  const handleClick = (id: Tool) => {
    if (!pdfDoc) return;
    if (activeTool === id) {
      // Toggle off — close the panel
      setActiveTool("none");
    } else if (id === "search") {
      focusSearch();
    } else {
      setActiveTool(id);
    }
  };

  return (
    <div className="icon-rail" role="toolbar" aria-label="Panel switcher">
      {TOOLS.map(({ id, icon, label }) => (
        <button
          key={id}
          className={`icon-rail-btn ${activeTool === id ? "active" : ""}`}
          title={label}
          aria-label={label}
          aria-pressed={activeTool === id}
          onClick={() => handleClick(id)}
          disabled={!pdfDoc}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
