import { useEffect, useRef, useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfViewerProps {
  /** Dipanggil sekali begitu halaman pertama terbaca, dengan rasio lebar/tinggi
   *  asli halaman (tidak tergantung zoom) — dipakai parent agar bingkai
   *  kartu mengikuti bentuk PDF. */
  onDimensionsChange?: (aspectRatio: number) => void;
  path: string;
  /** true = kartu di stack (toolbar hover). false = viewer penuh (modal). */
  compact?: boolean;
}

const MAX_RENDER_SCALE = 4;
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const FULL_FIT_CAP = 1.6;
const ZOOM_STEP = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export default function PdfViewer({ path, compact = false, onDimensionsChange }: PdfViewerProps) {
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const containerScrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitted, setFitted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Ukuran halaman 1 pada skala 1 (dasar perhitungan fit & ukuran CSS).
  const baseSize = useRef<{ w: number; h: number } | null>(null);
  const fitScaleRef = useRef(1);
  // true begitu user zoom manual -> fit otomatis berhenti menimpa zoom user.
  const userZoomed = useRef(false);
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const dpr =
    typeof window !== "undefined"
      ? Math.min(2, window.devicePixelRatio || 1)
      : 1;

  // ---- Load dokumen setiap kali path berubah ----
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFitted(false);
    setCurrentPage(1);
    userZoomed.current = false;
    baseSize.current = null;
    pageCanvasRefs.current.clear();

    const task = pdfjsLib.getDocument(convertFileSrc(path));
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // ---- Fit-to-width ----
  const computeFit = useCallback(() => {
    const el = containerScrollRef.current;
    const base = baseSize.current;
    if (!el || !base) return 1;
    const avail = Math.max(120, el.clientWidth - (compact ? 28 : 56));
    const cap = compact ? MAX_SCALE : FULL_FIT_CAP;
    const byWidth = avail / base.w;
    if (compact && el.clientHeight > 80) {
      // Kartu queue: seluruh halaman pertama harus terlihat (lebar DAN tinggi).
      const availH = Math.max(120, el.clientHeight - 24);
      return clamp(Math.min(byWidth, availH / base.h), MIN_SCALE, cap);
    }
    return clamp(byWidth, MIN_SCALE, cap);
  }, [compact]);

  useEffect(() => {
    if (loading || error || numPages === 0) return;
    const doc = docRef.current;
    if (!doc) return;
    let cancelled = false;
    doc
      .getPage(1)
      .then((page) => {
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        baseSize.current = { w: vp.width, h: vp.height };
        onDimensionsChange?.(vp.width / vp.height);
        const fit = computeFit();
        fitScaleRef.current = fit;
        setScale(fit);
        scaleRef.current = fit;
        setFitted(true);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, numPages, computeFit]);

  // Kartu bisa berubah ukuran (animasi aspect-ratio / resize window):
  // selama user belum zoom manual, fit dihitung ulang.
  useEffect(() => {
    const el = containerScrollRef.current;
    if (!el || loading) return;
    const ro = new ResizeObserver(() => {
      if (!baseSize.current) return;
      const fit = computeFit();
      fitScaleRef.current = fit;
      if (!userZoomed.current && Math.abs(fit - scaleRef.current) > 0.005) {
        setScale(fit);
        scaleRef.current = fit;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, computeFit]);

  // ---- Render halaman ke canvas ----
  const renderTasks = useRef<Map<HTMLCanvasElement, pdfjsLib.RenderTask>>(
    new Map(),
  );

  const renderPageToCanvas = useCallback(
    async (pageIndex: number, canvas: HTMLCanvasElement, cssScale: number) => {
      const doc = docRef.current;
      if (!doc) return;

      const prevTask = renderTasks.current.get(canvas);
      if (prevTask) {
        prevTask.cancel();
        renderTasks.current.delete(canvas);
      }

      const page = await doc.getPage(pageIndex);
      const base = page.getViewport({ scale: 1 });
      const renderScale = Math.min(cssScale * dpr, MAX_RENDER_SCALE);
      const viewport = page.getViewport({ scale: renderScale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // Ukuran CSS dari skala (bukan dari resolusi render) -> persentase akurat.
      canvas.style.width = `${base.width * cssScale}px`;
      canvas.style.height = `${base.height * cssScale}px`;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTasks.current.set(canvas, task);
      try {
        await task.promise;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") throw e;
      } finally {
        if (renderTasks.current.get(canvas) === task) {
          renderTasks.current.delete(canvas);
        }
      }
    },
    [dpr],
  );

  useEffect(() => {
    if (loading || error || numPages === 0 || !fitted) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      (async () => {
        for (let i = 1; i <= numPages; i++) {
          if (cancelled) return;
          const canvas = pageCanvasRefs.current.get(i);
          if (canvas) {
            try {
              await renderPageToCanvas(i, canvas, scale);
            } catch (e) {
              if (!cancelled) setError(String(e));
            }
          }
        }
      })();
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, error, numPages, scale, fitted, renderPageToCanvas]);

  // ---- Penanda halaman saat scroll ----
  const onScroll = useCallback(() => {
    const el = containerScrollRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + el.clientHeight * 0.35;
    const pages = Array.from(el.children) as HTMLElement[];
    let cur = 1;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].getBoundingClientRect().top <= top) cur = i + 1;
      else break;
    }
    setCurrentPage((p) => (p === cur ? p : cur));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // ---- Zoom ke skala absolut, berpusat di kursor/jari ----
  const zoomToScale = useCallback(
    (clientX: number, clientY: number, targetScale: number) => {
      const el = containerScrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cursorX = clientX - rect.left + el.scrollLeft;
      const cursorY = clientY - rect.top + el.scrollTop;
      const prevScale = scaleRef.current;
      const nextScale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
      if (nextScale === prevScale) return;
      const ratio = nextScale / prevScale;
      userZoomed.current = true;
      setScale(nextScale);
      scaleRef.current = nextScale;
      requestAnimationFrame(() => {
        el.scrollLeft = cursorX * ratio - (clientX - rect.left);
        el.scrollTop = cursorY * ratio - (clientY - rect.top);
      });
    },
    [],
  );

  const zoomBy = useCallback((delta: number) => {
    userZoomed.current = true;
    setScale((s) => {
      const n = clamp(s + delta, MIN_SCALE, MAX_SCALE);
      scaleRef.current = n;
      return n;
    });
  }, []);

  const resetFit = useCallback(() => {
    userZoomed.current = false;
    const fit = computeFit();
    fitScaleRef.current = fit;
    setScale(fit);
    scaleRef.current = fit;
    const el = containerScrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [computeFit]);

  // Pinch trackpad = wheel + ctrlKey. Listener native non-passive supaya
  // preventDefault benar-benar mencegah zoom halaman.
  useEffect(() => {
    const el = containerScrollRef.current;
    if (!el || loading) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.01);
      zoomToScale(e.clientX, e.clientY, scaleRef.current * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading, zoomToScale]);

  useEffect(() => {
    if (compact) return;
    const handler = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [compact]);

  // ---- Keyboard (hanya viewer penuh) ----
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      const el = containerScrollRef.current;
      if (!el) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        resetFit();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        el.scrollBy({ top: 90, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        el.scrollBy({ top: -90, behavior: "smooth" });
      } else if (e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" });
      } else if (e.key === "Home") {
        e.preventDefault();
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else if (e.key === "End") {
        e.preventDefault();
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, zoomBy, resetFit]);

  // ---- Drag untuk geser (hanya viewer penuh, mouse) ----
  const panRef = useRef<{ x: number; y: number; l: number; t: number } | null>(
    null,
  );
  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (compact || e.pointerType !== "mouse" || e.button !== 0) return;
    const el = containerScrollRef.current;
    if (!el) return;
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      l: el.scrollLeft,
      t: el.scrollTop,
    };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = panRef.current;
    const el = containerScrollRef.current;
    if (!s || !el) return;
    el.scrollLeft = s.l - (e.clientX - s.x);
    el.scrollTop = s.t - (e.clientY - s.y);
  };
  const onPanUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerScrollRef.current;
    if (!panRef.current || !el) return;
    panRef.current = null;
    el.releasePointerCapture?.(e.pointerId);
    el.style.cursor = "";
  };

  // Double-click (viewer penuh): fit <-> 200%.
  const onDoubleClick = (e: React.MouseEvent) => {
    if (compact) return;
    const nearFit = Math.abs(scaleRef.current - fitScaleRef.current) < 0.05;
    if (nearFit) zoomToScale(e.clientX, e.clientY, 2);
    else resetFit();
  };

  if (error) {
    return (
      <div className="pdf-viewer pdf-viewer-error mono">
        Gagal memuat PDF: {error}
      </div>
    );
  }

  const scrollClass = compact ? "pdf-compact-scroll" : "pdf-full-scroll";
  const pageWrapClass = compact ? "pdf-compact-page" : "pdf-full-page";
  const stop = compact ? (e: React.SyntheticEvent) => e.stopPropagation() : undefined;

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer${compact ? " pdf-viewer-compact" : " pdf-viewer-full"}${
        isFullscreen ? " is-fullscreen" : ""
      }`}
    >
      {loading ? (
        <div className="pdf-viewer-loading mono">Memuat PDF…</div>
      ) : (
        <>
          <div
            className={compact ? "pdf-toolbar mono" : "pdf-full-toolbar mono"}
            onClick={stop}
            onPointerDown={stop}
          >
            <span className="pdf-page-label">
              {currentPage} / {numPages}
            </span>
            <span className="pdf-toolbar-sep" />
            <button type="button" className="ghost-btn" onClick={() => zoomBy(-ZOOM_STEP)}>
              −
            </button>
            <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
            <button type="button" className="ghost-btn" onClick={() => zoomBy(ZOOM_STEP)}>
              +
            </button>
            <button type="button" className="ghost-btn" onClick={resetFit} title="Pas lebar (0)">
              Fit
            </button>
            {!compact && (
              <>
                <span className="pdf-toolbar-sep" />
                <button type="button" className="ghost-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
                </button>
              </>
            )}
          </div>
          <div
            ref={containerScrollRef}
            className={scrollClass}
            onScroll={onScroll}
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerCancel={onPanUp}
            onDoubleClick={onDoubleClick}
          >
            {Array.from({ length: numPages }).map((_, i) => {
              const pageIndex = i + 1;
              return (
                <div className={pageWrapClass} key={pageIndex}>
                  <canvas
                    ref={(el) => {
                      if (el) pageCanvasRefs.current.set(pageIndex, el);
                      else pageCanvasRefs.current.delete(pageIndex);
                    }}
                    className="pdf-canvas"
                  />
                  {!compact && (
                    <span className="pdf-full-page-num mono">{pageIndex}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
