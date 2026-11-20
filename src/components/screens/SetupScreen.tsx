import type { ReactNode } from "react";
import { FolderGlyph } from "../ui/Glyphs";

type Props = {
  toasts: ReactNode;
  sourceFolder: string;
  onPickSource: () => void;
  onStart: () => void;
  cacheBytes: number | null;
  confirmClear: boolean;
  clearing: boolean;
  onClearCache: () => void;
};

const fmtSize = (b: number) =>
  b >= 1073741824
    ? (b / 1073741824).toFixed(1) + " GB"
    : Math.round(b / 1048576) + " MB";

export default function SetupScreen(p: Props) {
  const ready = !!p.sourceFolder;
  return (
    <div className="container setup-screen">
      {p.toasts}
      <div className="brand">
        <span className="brand-mark">Selecta</span>
        <h1>Aplikasi yang memudahkan untuk memanage foto seabrek</h1>
      </div>

      <div className="setup-card">
        <button
          type="button"
          className={`setup-row${p.sourceFolder ? " is-filled" : ""}`}
          onClick={p.onPickSource}
        >
          <span className="setup-row-label">
            <span className="setup-icon" aria-hidden="true">
              <FolderGlyph />
            </span>
            <span className="setup-text">
              <span className="setup-title">Folder sumber</span>
              <span className="path-label">
                {p.sourceFolder || "klik untuk memilih…"}
              </span>
            </span>
          </span>
          <span className="setup-chevron" aria-hidden="true">
            {p.sourceFolder ? "✓" : "›"}
          </span>
        </button>
      </div>

      <button className="primary" disabled={!ready} onClick={p.onStart}>
        {ready ? "Mulai Sortir" : "Pilih folder sumber dulu"}
      </button>

      <div className="setup-keys">
        <span><kbd>←</kbd> lewati</span>
        <span><kbd>→</kbd> pilih</span>
        <span><kbd>⌘Z</kbd> batal</span>
        <span><kbd>F</kbd> layar penuh</span>
      </div>

      <button
        type="button"
        className={`cache-clear mono${p.confirmClear ? " is-confirm" : ""}`}
        disabled={p.clearing || !p.cacheBytes}
        onClick={p.onClearCache}
      >
        {p.clearing
          ? "Membersihkan…"
          : p.confirmClear
            ? "Yakin? Klik lagi untuk menghapus"
            : `Bersihkan cache${p.cacheBytes !== null ? ` (${fmtSize(p.cacheBytes)})` : ""}`}
      </button>
    </div>
  );
}
