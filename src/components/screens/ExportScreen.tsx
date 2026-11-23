import { useEffect, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import BackThumb from "../media/BackThumb";
import { FolderGlyph } from "../ui/Glyphs";
import { splitName, seededOffset, backCardStyle, shapeRatio } from "../../lib/utils";
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

  const [idx0, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [returning, setReturning] = useState(false);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const n = photos.length;
  const idx = Math.min(idx0, Math.max(0, n - 1));
  const cur = photos[idx];

  useEffect(() => {
    if (!cardEl) return;
    const upd = () =>
      setBox((prev) =>
        prev &&
        Math.abs(prev.w - cardEl.offsetWidth) < 1 &&
        Math.abs(prev.h - cardEl.offsetHeight) < 1
          ? prev
          : { w: cardEl.offsetWidth, h: cardEl.offsetHeight },
      );
    const ro = new ResizeObserver(upd);
    ro.observe(cardEl);
    upd();
    return () => ro.disconnect();
  }, [cardEl]);

  const setRatio = (path: string, r: number) =>
    setRatios((prev) => (prev[path] === r ? prev : { ...prev, [path]: r }));

  const goNext = () => {
    if (leaving || idx >= n - 1) return;
    setReturning(false);
    setLeaving(true);
    window.setTimeout(() => {
      setIdx(idx + 1);
      setLeaving(false);
    }, 320);
  };
  const goPrev = () => {
    if (leaving || idx <= 0) return;
    setReturning(true);
    setIdx(idx - 1);
    window.setTimeout(() => setReturning(false), 440);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape" && !isProcessing) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
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
        <section className="xp-stack" aria-label="Foto yang akan diekspor">
          <div className="preview-box xp-box">
            {photos
              .slice(idx + 1, idx + 4)
              .map((p, i) => {
                const depth = i + 1;
                const { rotate: rotSeed } = seededOffset(p.path, depth);
                const thumb = p.kind === "image" ? previewCache.current.get(p.path) : undefined;
                return (
                  <div
                    key={p.path}
                    className="stack-sheet"
                    style={{
                      transform: `translate(${-(depth * 7)}%, ${-(depth * 7)}%) rotate(${-(depth * 3) + rotSeed * 0.5}deg) scale(${1 - depth * 0.05})`,
                      transformOrigin: "80% 80%",
                      zIndex: 4 - depth,
                      opacity: 1 - depth * 0.14,
                      ["--depth-blur" as string]: `${depth * 0.3}px`,
                      ["--depth-shadow-y" as string]: `${2 + depth * 2}px`,
                      ["--depth-shadow-blur" as string]: `${8 + depth * 4}px`,
                    }}
                    aria-hidden="true"
                  >
                    <div
                      className="stack-sheet-inner"
                      data-kind={p.kind}
                      style={backCardStyle(ratios[p.path], box)}
                    >
                      {p.kind !== "image" && (
                        <BackThumb
                          kind={p.kind}
                          path={p.path}
                          name={p.name}
                          onRatio={(r) => setRatio(p.path, r)}
                        />
                      )}
                      {thumb && (
                        <img
                          src={thumb}
                          alt=""
                          className="stack-sheet-thumb is-loaded"
                          draggable={false}
                          onLoad={(e) => {
                            const im = e.currentTarget;
                            if (im.naturalWidth && im.naturalHeight)
                              setRatio(p.path, im.naturalWidth / im.naturalHeight);
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })
              .reverse()}

            {cur && (() => {
              const r = ratios[cur.path] ?? (cur.kind === "pdf" ? 0.707 : cur.kind === "video" ? 16 / 9 : undefined);
              const src = cur.kind === "image" ? previewCache.current.get(cur.path) : undefined;
              return (
                <div
                  key={cur.path}
                  ref={setCardEl}
                  className={
                    "preview-card" +
                    (leaving ? " exit-left" : "") +
                    (returning && !leaving ? " undo-from-back" : "")
                  }
                  style={{
                    zIndex: 5,
                    ["--start-x" as string]: "0px",
                    ["--start-rot" as string]: "0deg",
                    ["--undo-x" as string]: "-120%",
                    ["--undo-y" as string]: "0px",
                    ["--undo-ms" as string]: "420ms",
                    ["--enter-rot" as string]: `${-3 + seededOffset(cur.path, 1).rotate * 0.5}deg`,
                  }}
                >
                  <div
                    className="preview-photo-inner no-resize-anim"
                    style={r ? { aspectRatio: `${shapeRatio(r)}` } : undefined}
                  >
                    {cur.kind !== "image" ? (
                      <BackThumb
                        kind={cur.kind}
                        path={cur.path}
                        name={cur.name}
                        onRatio={(x) => setRatio(cur.path, x)}
                      />
                    ) : src ? (
                      <img
                        src={src}
                        alt={cur.name}
                        className="preview-img"
                        draggable={false}
                        onLoad={(e) => {
                          const im = e.currentTarget;
                          if (im.naturalWidth && im.naturalHeight)
                            setRatio(cur.path, im.naturalWidth / im.naturalHeight);
                        }}
                      />
                    ) : (
                      <span className="xp-kind">Preview tidak tersedia</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {cur && (
            <div className="xp-meta">
              <span className="xp-count">
                {String(idx + 1).padStart(3, "0")} / {String(n).padStart(3, "0")}
              </span>
              <span className="xp-cur-name">
                {(renames[cur.path] ?? splitName(cur.name).base) + splitName(cur.name).ext}
              </span>
            </div>
          )}
          <div className="xp-nav">
            <button type="button" className="ghost-btn" onClick={goPrev} disabled={idx <= 0 || leaving}>
              ‹ Sebelumnya
            </button>
            <button type="button" className="ghost-btn" onClick={goNext} disabled={idx >= n - 1 || leaving}>
              Berikutnya ›
            </button>
          </div>
          <p className="hint">
            <kbd>←</kbd> <kbd>→</kbd> lihat foto · <kbd>Esc</kbd> kembali
          </p>
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
