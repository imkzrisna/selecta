import { useState } from "react";
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react";
import { useFitUpscale } from "../../lib/useFitUpscale";
import PdfViewer from "../media/PdfViewer";
import VideoViewer from "../media/VideoViewer";
import BackThumb from "../media/BackThumb";
import {
  seededOffset,
  backCardStyle,
  longKindOf,
  shapeRatio,
} from "../../lib/utils";
import type { PhotoEntry, Stage } from "../../lib/types";

type Dir = "left" | "right" | "down" | "up";

type Props = {
  ToastStack: ReactNode;
  reviewPending: PhotoEntry[];
  reviewAll: PhotoEntry[];
  stackAspectRatios: Record<string, number>;
  setStackAspectRatios: Dispatch<SetStateAction<Record<string, number>>>;
  setStage: (s: Stage) => void;
  isProcessing: boolean;
  reviewIndex: number;
  onJumpTo: (i: number) => void;
  reviewUndoCount: number;
  reviewUndoFlyRef: MutableRefObject<() => void>;
  reviewPressRef: MutableRefObject<(dir: Dir, repeat: boolean) => void>;
  burst: boolean;
  reviewBox: { w: number; h: number } | null;
  previewCache: MutableRefObject<Map<string, string>>;
  frontFull: MutableRefObject<Map<string, string>>;
  setReviewCardEl: Dispatch<SetStateAction<HTMLDivElement | null>>;
  reviewUndoAnim: { path: string; kind: "from-back" | "from-tray" | "from-below" | "from-above" | "nav-next" | "nav-prev" } | null;
  scrolledPath: string | null;
  setScrolledPath: Dispatch<SetStateAction<string | null>>;
  exitInProgress: MutableRefObject<boolean>;
  setFullViewPhoto: (p: PhotoEntry | null) => void;
  setZoomPhoto: (p: PhotoEntry | null) => void;
};

export default function ReviewScreen(props: Props) {
  const {
    ToastStack, reviewPending, reviewAll, stackAspectRatios, setStackAspectRatios,
    setStage, isProcessing, reviewIndex, onJumpTo, reviewUndoCount, reviewUndoFlyRef, reviewPressRef,
    burst, reviewBox, previewCache, frontFull, setReviewCardEl, reviewUndoAnim,
    scrolledPath, setScrolledPath, exitInProgress, setFullViewPhoto, setZoomPhoto,
  } = props;
    const list = reviewPending;
    const idx = Math.min(reviewIndex, Math.max(0, list.length - 1));
    const cur = list[idx];
    const behind = list[idx + 1];
    const all = reviewAll;
    const approvedCount = all.length - list.length;
    const [nat, setNat] = useState<{ path: string; w: number; h: number } | null>(null);
    const up = useFitUpscale(
      cur && nat && nat.path === cur.path ? { w: nat.w, h: nat.h } : null,
      cur?.kind === "image" && !longKindOf(stackAspectRatios[cur.path]) ? 3 : 1,
      cur?.path ?? "",
      ".review-box",
    );
    const setRatio = (r: number) => {
      if (!cur) return;
      setStackAspectRatios((prev) =>
        prev[cur.path] === r ? prev : { ...prev, [cur.path]: r },
      );
    };
    return (
      <div className="container review-screen">
        {ToastStack}
        <div className="top-bar">
          <button
            className="ghost-btn"
            onClick={() => setStage("sorting")}
            disabled={isProcessing}
          >
            ← Kembali
          </button>
          <span className="top-bar-mid">
            Disetujui <span className="stat-value">{approvedCount}</span> /{" "}
            {all.length}
          </span>
          <div className="top-bar-actions">
            <button
              className="ghost-btn"
              onClick={() => reviewUndoFlyRef.current()}
              disabled={isProcessing || reviewUndoCount === 0}
              title="Batalkan ACC atau pengeluaran terakhir (⌘Z)"
            >
              Kembalikan
            </button>
            <button
              className="primary review-save"
              onClick={() => setStage("export")}
              disabled={isProcessing || all.length === 0 || list.length > 0}
              title={list.length > 0 ? `ACC semua foto dulu (${list.length} belum)` : "Lanjut ke ekspor"}
            >
              {list.length > 0 ? `${list.length} belum di-ACC` : `Ekspor ${all.length} file ›`}
            </button>
          </div>
        </div>

        <div className="review-stage">
          <div className={`preview-box review-box${burst ? " is-burst" : ""}`}>
            {behind && (
              <div
                key={behind.path}
                className="stack-sheet"
                style={{
                  transform: `translate(-7%, -7%) rotate(${-3 + seededOffset(behind.path, 1).rotate * 0.5}deg) scale(0.95)`,
                  transformOrigin: "80% 80%",
                  zIndex: 1,
                  opacity: 0.86,
                  ["--depth-blur" as string]: "0.3px",
                  ["--depth-shadow-y" as string]: "4px",
                  ["--depth-shadow-blur" as string]: "12px",
                }}
                aria-hidden="true"
              >
                <div
                  className="stack-sheet-inner"
                  data-kind={behind.kind}
                  data-long={longKindOf(stackAspectRatios[behind.path])}
                  style={backCardStyle(
                    stackAspectRatios[behind.path],
                    reviewBox,
                  )}
                >
                  {behind.kind !== "image" && (
                    <BackThumb
                      kind={behind.kind}
                      path={behind.path}
                      name={behind.name}
                      onRatio={(r) =>
                        setStackAspectRatios((prev) =>
                          prev[behind.path] === r
                            ? prev
                            : { ...prev, [behind.path]: r },
                        )
                      }
                    />
                  )}
                  {behind.kind === "image" &&
                    previewCache.current.get(behind.path) && (
                      <img
                        src={previewCache.current.get(behind.path)}
                        alt=""
                        className="stack-sheet-thumb is-loaded"
                        draggable={false}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            const r = img.naturalWidth / img.naturalHeight;
                            setStackAspectRatios((prev) =>
                              prev[behind.path] === r
                                ? prev
                                : { ...prev, [behind.path]: r },
                            );
                          }
                        }}
                      />
                    )}
                </div>
              </div>
            )}

            {cur ? (
              (() => {
                const baseR =
                  stackAspectRatios[cur.path] ??
                  (cur.kind === "pdf"
                    ? 0.707
                    : cur.kind === "video"
                      ? 16 / 9
                      : undefined);
                const lk = cur.kind === "image" ? longKindOf(baseR) : undefined;
                const shaped = baseR ? shapeRatio(baseR) : undefined;
                const rot = -3 + seededOffset(cur.path, 1).rotate * 0.5;
                const src =
                  frontFull.current.get(cur.path) ??
                  previewCache.current.get(cur.path);
                return (
                  <div
                    key={cur.path}
                    ref={setReviewCardEl}
                    className={
                      "preview-card" +
                      (burst ? " is-burst" : "") +
                      (reviewUndoAnim && reviewUndoAnim.path === cur.path
                        ? ` undo-${reviewUndoAnim.kind}`
                        : "")
                    }
                    style={{
                      zIndex: 3,
                      ["--enter-rot" as string]: `${rot}deg`,
                    }}
                  >
                    <div
                      className={
                        "preview-photo-inner no-resize-anim" +
                        (lk ? ` is-long-${lk}` : "")
                      }
                      style={(up ? { width: up.w, height: up.h, maxWidth: "none", maxHeight: "none", aspectRatio: "auto" } : (shaped ? { aspectRatio: `${shaped}` } : undefined))}
                      onScroll={(e) => {
                        if (!lk) return;
                        const el = e.currentTarget;
                        const moved =
                          lk === "tall" ? el.scrollTop : el.scrollLeft;
                        if (moved > 24 && scrolledPath !== cur.path)
                          setScrolledPath(cur.path);
                      }}
                      onClick={() => {
                        if (exitInProgress.current) return;
                        if (cur.kind === "pdf" || cur.kind === "video")
                          setFullViewPhoto(cur);
                        else if (cur.kind === "image") setZoomPhoto(cur);
                      }}
                    >
                      {cur.kind === "pdf" ? (
                        <PdfViewer
                          path={cur.path}
                          compact
                          onDimensionsChange={setRatio}
                        />
                      ) : cur.kind === "video" ? (
                        <VideoViewer
                          path={cur.path}
                          compact
                          onDimensionsChange={setRatio}
                        />
                      ) : src ? (
                        <img
                          src={src}
                          alt={cur.name}
                          className="preview-img" style={up ? { width: "100%", height: "100%", objectFit: "contain", imageRendering: up.fit >= 4 ? "pixelated" : undefined } : undefined}
                          draggable={false}
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              setRatio(img.naturalWidth / img.naturalHeight);
                              setNat({ path: cur.path, w: img.naturalWidth, h: img.naturalHeight });
                            }
                          }}
                        />
                      ) : (
                        <span className="mono photo-lightbox-fallback">
                          Preview tidak tersedia
                        </span>
                      )}
                    </div>
                    {lk && scrolledPath !== cur.path && (
                      <span
                        className={`scroll-hint scroll-hint-${lk} mono review-scroll-hint`}
                        aria-hidden="true"
                      >
                        <span className="scroll-hint-arrow">
                          {lk === "tall" ? "↓" : "→"}
                        </span>
                        Gulir
                      </span>
                    )}
                    <span className="frame-counter mono">
                      {String(idx + 1).padStart(3, "0")} /{" "}
                      {String(list.length).padStart(3, "0")}
                    </span>
                  </div>
                );
              })()
            ) : (
              <div
                className="preview-placeholder empty-state"
                style={{ zIndex: 2 }}
              >
                <span className="empty-title">
                  {all.length > 0
                    ? "Semua sudah diperiksa"
                    : "Tidak ada foto terpilih"}
                </span>
                <span className="hint-inline">
                  Klik &quot;Kembali&quot; untuk melanjutkan sortir.
                </span>
              </div>
            )}
          </div>

          {list.length > 1 && (() => {
            const MAX = 15;
            const n = list.length;
            let start = 0;
            let end = n;
            if (n > MAX) {
              start = Math.min(Math.max(0, idx - Math.floor(MAX / 2)), n - MAX);
              end = start + MAX;
            }
            return (
              <div className="review-dots" role="tablist" aria-label="Posisi foto">
                {list.slice(start, end).map((p, k) => {
                  const i = start + k;
                  const edge =
                    n > MAX &&
                    ((k === 0 && start > 0) || (k === MAX - 1 && end < n));
                  return (
                    <button
                      key={p.path}
                      type="button"
                      role="tab"
                      aria-selected={i === idx}
                      aria-label={`Foto ${i + 1} dari ${n}`}
                      className={`review-dot${i === idx ? " is-current" : ""}${edge ? " is-edge" : ""}`}
                      onClick={() => onJumpTo(i)}
                      disabled={isProcessing}
                    />
                  );
                })}
              </div>
            );
          })()}
          <div className="controls">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => reviewPressRef.current("left", false)}
              disabled={idx <= 0}
            >
              ‹ Sebelumnya
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => reviewPressRef.current("up", false)}
              disabled={!cur || isProcessing}
            >
              ACC ↑
            </button>
            <button
              type="button"
              className="photo-lightbox-remove"
              onClick={() => reviewPressRef.current("down", false)}
              disabled={!cur || isProcessing}
            >
              Keluarkan dari terpilih
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => reviewPressRef.current("right", false)}
              disabled={idx >= list.length - 1}
            >
              Berikutnya ›
            </button>
          </div>
          <p className="hint mono">
            <kbd>←</kbd> <kbd>→</kbd> navigasi · <kbd>↑</kbd> acc ·{" "}
            <kbd>↓</kbd> keluarkan · <kbd>⌘Z</kbd> kembalikan · <kbd>Esc</kbd> kembali
          </p>
        </div>
      </div>
    );
}
