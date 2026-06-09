import { usePdfStore } from "../store/usePdfStore";
import ContinuousViewer from "./ContinuousViewer";

export default function ViewerArea() {
  const pdfDoc = usePdfStore((s) => s.pdfDoc);

  if (!pdfDoc) {
    return (
      <div className="viewer-area">
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h2>No document open</h2>
          <p>Click <strong>Open PDF</strong> in the toolbar to get started.</p>
        </div>
      </div>
    );
  }

  return <ContinuousViewer />;
}
