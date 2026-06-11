import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { usePdfStore, useActiveTab } from "./store/usePdfStore";
import { loadPdfBytes, getPageDimensions } from "./utils/pdfEngine";
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

  useEffect(() => {
    // TEMPORARY: log all process args to console to verify file-association launch
    invoke<string[]>("get_all_args").then((args) => {
      console.log("[tumbler] process args:", args);
    });

    invoke<string | null>("get_initial_file").then(async (path) => {
      console.log("[tumbler] initial file path:", path);
      if (!path) return;
      try {
        const bytes = await readFile(path);
        const name = path.split(/[\\/]/).pop() ?? "document.pdf";
        const { openNewTab, setFile, setPageDimensions } = usePdfStore.getState();
        openNewTab();
        const doc = await loadPdfBytes(bytes);
        setFile(bytes, doc, name);
        const dims = await getPageDimensions(doc);
        setPageDimensions(dims);
      } catch (err) {
        console.error("[tumbler] failed to open initial file:", err);
      }
    }).catch((err) => {
      console.error("[tumbler] get_initial_file failed:", err);
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

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
