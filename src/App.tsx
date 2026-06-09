import { usePdfStore } from "./store/usePdfStore";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import ViewerArea from "./components/ViewerArea";

export default function App() {
  const sidebarOpen = usePdfStore((s) => s.sidebarOpen);
  const darkMode = usePdfStore((s) => s.darkMode);

  const darkClass =
    darkMode === "invert"
      ? "dark-mode-invert"
      : darkMode === "sepia"
      ? "dark-mode-sepia"
      : "";

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"} ${darkClass}`}>
      <Toolbar />
      <Sidebar />
      <ViewerArea />
    </div>
  );
}
