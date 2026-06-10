import { usePdfStore, useActiveTab } from "./store/usePdfStore";
import Toolbar from "./components/Toolbar";
import TabBar from "./components/TabBar";
import IconRail from "./components/IconRail";
import Sidebar from "./components/Sidebar";
import ViewerArea from "./components/ViewerArea";

export default function App() {
  const activeTool   = usePdfStore((s) => s.activeTool);
  const sidebarWidth = usePdfStore((s) => s.sidebarWidth);
  const tab          = useActiveTab();
  const darkMode     = tab?.darkMode ?? "off";

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
      <TabBar />
      <IconRail />
      <Sidebar />
      <ViewerArea />
    </div>
  );
}
