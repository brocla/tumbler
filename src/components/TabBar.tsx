import { useRef, useState } from "react";
import { usePdfStore } from "../store/usePdfStore";

/** Compute which gap index (0 = before first, N = after last) the cursor is in. */
function getDropIndex(clientX: number): number {
  const chips = Array.from(document.querySelectorAll<HTMLElement>("[data-tabid]"));
  let idx = 0;
  for (let i = 0; i < chips.length; i++) {
    const rect = chips[i].getBoundingClientRect();
    if (clientX > rect.left + rect.width / 2) idx = i + 1;
  }
  return idx;
}

export default function TabBar() {
  const tabs        = usePdfStore((s) => s.tabs);
  const activeTabId = usePdfStore((s) => s.activeTabId);
  const { switchTab, closeTab, reorderTabs } = usePdfStore.getState();

  const dragId     = useRef<string | null>(null);
  const didMove    = useRef(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return;
    dragId.current = id;
    didMove.current = false;

    const onMouseMove = (me: MouseEvent) => {
      didMove.current = true;
      setDropIndex(getDropIndex(me.clientX));
    };

    const onMouseUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (didMove.current && dragId.current !== null) {
        reorderTabs(dragId.current, getDropIndex(me.clientX));
      }
      dragId.current  = null;
      didMove.current = false;
      setDropIndex(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="tab-bar">
      {tabs.flatMap((tab, i) => [
        <div
          key={`gap-${i}`}
          className={`tab-drop-gap ${dropIndex === i ? "active" : ""}`}
        />,
        <div
          key={tab.id}
          data-tabid={tab.id}
          className={`tab-chip ${tab.id === activeTabId ? "active" : ""}`}
          onMouseDown={(e) => onMouseDown(e, tab.id)}
          onClick={() => { if (!didMove.current) switchTab(tab.id); }}
          title={tab.fileName}
        >
          <span className="tab-title">{tab.fileName}</span>
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            aria-label="Close tab"
          >
            ×
          </button>
        </div>,
      ]).concat(
        <div
          key="gap-end"
          className={`tab-drop-gap ${dropIndex === tabs.length ? "active" : ""}`}
        />
      )}
    </div>
  );
}
