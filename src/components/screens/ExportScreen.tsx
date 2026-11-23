import type { MutableRefObject, ReactNode } from "react";
import { FolderGlyph } from "../ui/Glyphs";
import { splitName } from "../../lib/utils";
import type { PhotoEntry } from "../../lib/types";

type Props = {
  toastStack: ReactNode;
  count: number;
  photos: PhotoEntry[];
  renames: Record<string, string>;
  previewCache: MutableRefObject<Map<string, string>>;
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

const MODES = [
  { value: "original", title: "Format asli", desc: "File dipindahkan apa adanya." },
  { value: "zip", title: "ZIP", desc: "Dibungkus satu .zip, file asli dihapus dari sumber." },
] as const;

export default function ExportScreen({
  toastStack,
  count,
  photos,
  renames,
  previewCache,
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
  return (
    <div className="container export-page">
      {toastStack}
      <div className="top-bar">
        <button type="button" className="ghost-btn" onClick={onBack} disabled={isProcessing}>
          ← Kembali
        </button>
        <span className="top-bar-mid">
          Ekspor <span className="stat-value">{count}</span> file
        </span>
        <span className="xp-spacer" />
      </div>

      <div className="xp-body">
        <section className="xp-grid-wrap" aria-label="Foto yang akan diekspor">
          <div className="xp-grid">
            {photos.map((p) => {
              const { base, ext } = splitName(p.name);
              const shown = (renames[p.path] ?? base) + ext;
              const thumb = p.kind === "image" ? previewCache.current.get(p.path) : undefined;
              return (
                <figure className="xp-item" key={p.path} title={shown}>
                  <div className="xp-thumb">
                    {thumb ? (
                      <img src={thumb} alt="" draggable={false} />
                    ) : (
                      <span className="xp-kind">{p.kind === "pdf" ? "PDF" : p.kind === "video" ? "VIDEO" : "IMG"}</span>
                    )}
                  </div>
                  <figcaption className="xp-name">{shown}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        <aside className="xp-panel">
          <div className="xp-block">
            <div className="xp-label">Lokasi tujuan</div>
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

          <div className="xp-block">
            <div className="xp-label">Format</div>
            <div className="xp-modes" role="radiogroup" aria-label="Format ekspor">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={exportMode === m.value}
                  className={`xp-mode${exportMode === m.value ? " is-active" : ""}`}
                  onClick={() => setExportMode(m.value)}
                >
                  <span className="xp-mode-title">{m.title}</span>
                  <span className="xp-mode-desc">{m.desc}</span>
                </button>
              ))}
            </div>
            {exportMode === "zip" && (
              <input
                className="rename-input xp-input"
                type="text"
                placeholder="Nama file ZIP"
                spellCheck={false}
                value={exportZipName}
                onChange={(e) => setExportZipName(e.target.value)}
              />
            )}
          </div>

          <div className="xp-actions">
            <button type="button" className="primary xp-go" onClick={onExport} disabled={!canGo}>
              {isProcessing ? "Mengekspor…" : `Ekspor ${count} file`}
            </button>
            {!destFolder && <span className="xp-hint">Pilih folder tujuan dulu.</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}
