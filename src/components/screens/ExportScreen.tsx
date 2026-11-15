import type { ReactNode } from "react";
import { FolderGlyph } from "../ui/Glyphs";

type Props = {
  toastStack: ReactNode;
  count: number;
  destFolder: string;
  isProcessing: boolean;
  exportMode: "original" | "zip";
  setExportMode: (m: "original" | "zip") => void;
  exportZipName: string;
  setExportZipName: (v: string) => void;
  onPickDest: () => void;
  onBack: () => void;
  onExport: () => void;
};

export default function ExportScreen({
  toastStack,
  count,
  destFolder,
  isProcessing,
  exportMode,
  setExportMode,
  exportZipName,
  setExportZipName,
  onPickDest,
  onBack,
  onExport,
}: Props) {
  const canGo = !!destFolder && count > 0 && !isProcessing;
  const modes = [
    { value: "original", title: "Format asli", desc: "Semua file dipindahkan tanpa diubah." },
    {
      value: "zip",
      title: "ZIP",
      desc: "Semua file dibungkus dalam satu .zip, lalu file asli dihapus dari folder sumber.",
    },
  ] as const;
  return (
  <div className="container export-screen">
    {toastStack}
    <span className="brand-mark">Selecta</span>
    <h1>Ekspor {count} file</h1>
    <p className="export-sub">
      File dipindahkan dari folder sumber ke folder tujuan.
    </p>

    <div className="export-section">
      <div className="export-section-title mono">Lokasi</div>
      <button
        type="button"
        className={`setup-row export-pick${destFolder ? " is-filled" : ""}`}
        onClick={onPickDest}
      >
        <span className="setup-row-label">
          <span className="setup-icon" aria-hidden="true">
            <FolderGlyph />
          </span>
          <span className="setup-text">
            <span className="setup-title">Folder tujuan</span>
            <span className="path-label">{destFolder || "klik untuk memilih…"}</span>
          </span>
        </span>
        <span className="setup-chevron" aria-hidden="true">
          {destFolder ? "✓" : "›"}
        </span>
      </button>
    </div>

    <div className="export-section">
      <div className="export-section-title mono">Format</div>
      <div className="export-modes">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`export-mode${exportMode === m.value ? " is-active" : ""}`}
            onClick={() => setExportMode(m.value)}
            aria-pressed={exportMode === m.value}
          >
            <span className="export-mode-title">{m.title}</span>
            <span className="export-mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
      {exportMode === "zip" && (
        <input
          className="rename-input export-input"
          type="text"
          placeholder="Nama file ZIP"
          spellCheck={false}
          value={exportZipName}
          onChange={(e) => setExportZipName(e.target.value)}
        />
      )}
    </div>

    <div className="export-actions">
      <button
        type="button"
        className="ghost-btn"
        onClick={onBack}
        disabled={isProcessing}
      >
        ← Kembali
      </button>
      <button
        type="button"
        className="primary export-go"
        onClick={onExport}
        disabled={!canGo}
      >
        {isProcessing ? "Mengekspor…" : "Ekspor"}
      </button>
    </div>
  </div>
  );
}
