import { usePdfStore } from "./store/usePdfStore";
import Toolbar from "./components/Toolbar";
import IconRail from "./components/IconRail";
import Sidebar from "./components/Sidebar";
import ViewerArea from "./components/ViewerArea";

export default function App() {
  const activeTool   = usePdfStore((s) => s.activeTool);
  const sidebarWidth = usePdfStore((s) => s.sidebarWidth);
  const darkMode     = usePdfStore((s) => s.darkMode);

  const darkClass =
    darkMode === "invert" ? "dark-mode-invert" :
    darkMode === "sepia"  ? "dark-mode-sepia"  : "";

  const panelOpen = activeTool !== "none";

  const shellStyle = {
    "--panel-w": panelOpen ? `${sidebarWidth}px` : "0px",
  } as React.CSSProperties;

  return (
    <div className={`app-shell ${darkClass}`} style={shellStyle}>
      <Toolbar />
      <IconRail />
      <Sidebar />
      <ViewerArea />
    </div>
  );
}
