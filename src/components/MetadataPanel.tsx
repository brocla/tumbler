import { useEffect, useState } from "react";
import { usePdfStore, useActiveTab } from "../store/usePdfStore";
import { readMetadata, writeMetadata, loadPdfBytes } from "../utils/pdfEngine";
import { savePdfFile } from "../utils/fileHelpers";
import type { PdfMetadata } from "../utils/pdfEngine";

const EDITABLE_FIELDS: { key: keyof PdfMetadata; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords" },
  { key: "creator", label: "Creator" },
];

const READ_ONLY_FIELDS: { key: keyof PdfMetadata; label: string }[] = [
  { key: "producer", label: "Producer" },
  { key: "creationDate", label: "Created" },
  { key: "modificationDate", label: "Modified" },
];

export default function MetadataPanel() {
  const { fileBytes, fileName, metadataDirty } = useActiveTab();
  const setFile = usePdfStore((s) => s.setFile);
  const setMetadataDirty = usePdfStore((s) => s.setMetadataDirty);
  const [meta, setMeta] = useState<PdfMetadata | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fileBytes) { setMeta(null); return; }
    readMetadata(fileBytes).then(setMeta).catch(console.error);
    setMetadataDirty(false);
  }, [fileBytes, setMetadataDirty]);

  const handleChange = (key: keyof PdfMetadata, value: string) => {
    setMeta((prev) => prev ? { ...prev, [key]: value } : prev);
    setMetadataDirty(true);
  };

  const handleSave = async () => {
    if (!fileBytes || !meta) return;
    setSaving(true);
    try {
      const updated = await writeMetadata(fileBytes, meta);
      const saved = await savePdfFile(updated, fileName);
      if (saved) {
        // Reload the updated bytes into the store
        const newDoc = await loadPdfBytes(updated);
        setFile(updated, newDoc, fileName);
        setMetadataDirty(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!meta) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No document open.</p>;
  }

  return (
    <div className="metadata-panel">
      {EDITABLE_FIELDS.map(({ key, label }) => (
        <div key={key} className="metadata-field">
          <label htmlFor={`meta-${key}`}>{label}</label>
          <input
            id={`meta-${key}`}
            type="text"
            value={meta[key]}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4 }}>
        {READ_ONLY_FIELDS.map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text)", wordBreak: "break-all" }}>
              {meta[key] || "—"}
            </div>
          </div>
        ))}
      </div>

      {metadataDirty && (
        <button className="accent" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save metadata"}
        </button>
      )}
    </div>
  );
}
