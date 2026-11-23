import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import BackThumb from "../media/BackThumb";
import { FolderGlyph } from "../ui/Glyphs";
import { splitName, cleanBase, seededOffset, backCardStyle, shapeRatio } from "../../lib/utils";
import {
  NORMAL_EXIT_MS,
  BURST_WINDOW_MS,
  BURST_IDLE_MS,
  MAX_PENDING_BURST,
  UNDO_BACK_MS,
  burstExitMs,
} from "../../lib/motion";
import { flyGhost } from "../../lib/ghost";
import type { PhotoEntry } from "../../lib/types";

type Props = {
  toastStack: ReactNode;
  count: number;
  photos: PhotoEntry[];
  renames: Record<string, string>;
  setRenames: Dispatch<SetStateAction<Record<string, string>>>;
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

const STACK_DEPTH = 2;
const MODES = [
  { value: "original", title: "Format asli", desc: "File dipindahkan apa adanya." },
  { value: "zip", title: "ZIP", desc: "Dibungkus satu .zip, file asli dihapus dari sumber." },
] as const;

type Dir = "next" | "prev";

export default function ExportScreen({
  toastStack, count, photos, renames, setRenames, previewCache, destFolder, isProcessing,
  exportMode, setExportMode, exportZipName, setExportZipName, onPickDest, onBack, onExport,
}: Props) {
  const canGo = !!destFolder && count > 0 && !isProcessing;
  const n = photos.length;

  const [idx0, setIdx] = useState(0);
  const idx = Math.min(idx0, Math.max(0, n - 1));
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const cur = photos[idx];

  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  cardRef.current = cardEl;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [burst, setBurst] = useState(false);
  const [undoPath, setUndoPath] = useState<string | null>(null);
  const [, bumpFull] = useState(0);
  const frontFull = useRef<Map<string, string>>(new Map());

  const gate = useRef(false);
  const pend = useRef<Dir[]>([]);
  const lastAt = useRef({ next: 0, prev: 0 });
  const held = useRef(false);
  const streak = useRef(0);
  const burstRef = useRef(false);
  const burstTimer = useRef<number | null>(null);

  const setRatio = (path: string, r: number) =>
    setRatios((p) => (p[path] === r ? p : { ...p, [path]: r }));

  useEffect(() => {
    if (!cardEl) return;
    const upd = () =>
      setBox((p) =>
        p && Math.abs(p.w - cardEl.offsetWidth) < 1 && Math.abs(p.h - cardEl.offsetHeight) < 1
          ? p
          : { w: cardEl.offsetWidth, h: cardEl.offsetHeight },
      );
    const ro = new ResizeObserver(upd);
    ro.observe(cardEl);
    upd();
    return () => ro.disconnect();
  }, [cardEl]);

  // Foto depan: muat file asli supaya tajam (sama seperti sorting/review).
  useEffect(() => {
    const c = photos[idx];
    if (!c || c.kind !== "image" || frontFull.current.has(c.path)) return;
    let cancelled = false;
    invoke<string>("get_full_image", { path: c.path })
      .then((full) => {
        const url = convertFileSrc(full);
        const img = new Image();
        img.onload = () => {
          frontFull.current.set(c.path, url);
          if (!cancelled) bumpFull((v) => v + 1);
        };
        img.src = url;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.path]);

  const drain = () => {
    const d = pend.current.shift();
    if (d) fireRef.current(d, true);
  };

  const fire = (dir: Dir, fast: boolean) => {
    const i = idxRef.current;
    if (dir === "next" && i >= n - 1) return;
    if (dir === "prev" && i <= 0) return;
    gate.current = true;
    setUndoPath(null);
    if (fast) {
      streak.current += 1;
      burstRef.current = true;
      setBurst(true);
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => {
        burstRef.current = false;
        setBurst(false);
      }, BURST_IDLE_MS);
    } else {
      streak.current = 0;
    }
    let wait = 120;
    if (dir === "next") {
      const ms = fast ? burstExitMs(streak.current) : NORMAL_EXIT_MS.left;
      const card = cardRef.current;
      if (card?.parentElement) {
        flyGhost(card, card.parentElement, { dir: "left", ms, fast, zIndex: STACK_DEPTH + 2 });
      }
      idxRef.current = i + 1;
      setIdx(i + 1);
    } else {
      idxRef.current = i - 1;
      setUndoPath(photos[i - 1].path);
      setIdx(i - 1);
      wait = fast ? 110 : UNDO_BACK_MS;
    }
    window.setTimeout(() => {
      gate.current = false;
      drain();
    }, fast ? 40 : wait);
  };
  const fireRef = useRef(fire);
  fireRef.current = fire;

  const press = (dir: Dir, repeat: boolean) => {
    const now = performance.now();
    const fast = repeat || now - lastAt.current[dir] < BURST_WINDOW_MS;
    lastAt.current[dir] = now;
    if (repeat) held.current = true;
    if (gate.current) {
      if (fast && pend.current.length < MAX_PENDING_BURST) pend.current.push(dir);
      return;
    }
    fireRef.current(dir, fast);
  };
  const pressRef = useRef(press);
  pressRef.current = press;
  const backRef = useRef(onBack);
  backRef.current = onBack;
  const busyRef = useRef(isProcessing);
  busyRef.current = isProcessing;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        pressRef.current("next", e.repeat);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        pressRef.current("prev", e.repeat);
      } else if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        backRef.current();
      }
    };
    const up = (e: KeyboardEvent) => {
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && held.current) {
        held.current = false;
        pend.current = [];
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const shownName = (p: PhotoEntry) => {
    const { base, ext } = splitName(p.name);
    return (renames[p.path] ?? base) + ext;
  };

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
          <div className={`preview-box xp-box${burst ? " is-burst" : ""}`}>
            {photos
              .slice(idx + 1, idx + STACK_DEPTH)
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
                      zIndex: STACK_DEPTH - depth,
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
                        <BackThumb kind={p.kind} path={p.path} name={p.name} onRatio={(r) => setRatio(p.path, r)} />
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

            {cur &&
              (() => {
                const r =
                  ratios[cur.path] ??
                  (cur.kind === "pdf" ? 0.707 : cur.kind === "video" ? 16 / 9 : undefined);
                const src =
                  cur.kind === "image"
                    ? (frontFull.current.get(cur.path) ?? previewCache.current.get(cur.path))
                    : undefined;
                return (
                  <div
                    key={cur.path}
                    ref={setCardEl}
                    className={
                      "preview-card" +
                      (burst ? " is-burst" : "") +
                      (undoPath === cur.path ? " undo-from-back" : "")
                    }
                    style={{
                      zIndex: STACK_DEPTH + 1,
                      ["--enter-rot" as string]: `${-3 + seededOffset(cur.path, 1).rotate * 0.5}deg`,
                    }}
                  >
                    <div
                      className="preview-photo-inner no-resize-anim"
                      style={r ? { aspectRatio: `${shapeRatio(r)}` } : undefined}
                    >
                      {cur.kind !== "image" ? (
                        <BackThumb kind={cur.kind} path={cur.path} name={cur.name} onRatio={(x) => setRatio(cur.path, x)} />
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
              <div className="xp-rename">
                <input
                  key={cur.path}
                  className="rename-input xp-rename-input"
                  type="text"
                  spellCheck={false}
                  aria-label="Nama file"
                  title={shownName(cur)}
                  disabled={isProcessing}
                  value={renames[cur.path] ?? splitName(cur.name).base}
                  onChange={(e) =>
                    setRenames((prev) => ({ ...prev, [cur.path]: e.target.value }))
                  }
                  onBlur={(e) => {
                    const v = cleanBase(e.target.value);
                    setRenames((prev) => {
                      const next = { ...prev };
                      if (!v || v === splitName(cur.name).base) delete next[cur.path];
                      else next[cur.path] = v;
                      return next;
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenames((prev) => {
                        const next = { ...prev };
                        delete next[cur.path];
                        return next;
                      });
                      e.currentTarget.blur();
                    }
                  }}
                />
                <span className="xp-rename-ext">{splitName(cur.name).ext}</span>
                {renames[cur.path] !== undefined && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setRenames((prev) => {
                        const next = { ...prev };
                        delete next[cur.path];
                        return next;
                      })
                    }
                  >
                    Asli
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="xp-nav">
            <button type="button" className="ghost-btn" onClick={() => pressRef.current("prev", false)} disabled={idx <= 0}>
              ‹ Sebelumnya
            </button>
            <button type="button" className="ghost-btn" onClick={() => pressRef.current("next", false)} disabled={idx >= n - 1}>
              Berikutnya ›
            </button>
          </div>
          <p className="hint">
            <kbd>←</kbd> <kbd>→</kbd> lihat foto · ketik untuk ganti nama · <kbd>Esc</kbd> kembali
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
