import { useEffect, useRef, useCallback } from "react";
import { usePdfStore } from "../store/usePdfStore";

export function useSidebarResize() {
  const sidebarWidth  = usePdfStore((s) => s.sidebarWidth);
  const setSidebarWidth = usePdfStore((s) => s.setSidebarWidth);

  // Keep the CSS var in sync with the committed store value
  useEffect(() => {
    document.documentElement.style.setProperty("--panel-w", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);
  const rafId    = useRef<number | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sidebarWidth;
    document.documentElement.classList.add("sidebar-resizing");
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(150, Math.min(500, startW.current + (e.clientX - startX.current)));
      // Throttle CSS var mutation to one write per animation frame
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--panel-w", `${next}px`);
        rafId.current = null;
      });
    };

    const onUp = (e: MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.documentElement.classList.remove("sidebar-resizing");
      const final = Math.max(150, Math.min(500, startW.current + (e.clientX - startX.current)));
      setSidebarWidth(final); // commits to store + localStorage
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [setSidebarWidth]);

  return { onMouseDown };
}
