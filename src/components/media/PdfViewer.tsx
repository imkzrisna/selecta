import { useEffect, useRef, useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfViewerProps {
  /** Dipanggil setiap kali halaman pertama selesai dirender, dengan rasio
   *  lebar/tinggi asli halaman (dalam skala render, bukan CSS scale) —
   *  dipakai parent untuk membuat bingkai foto/box mengikuti bentuk PDF. */
  onDimensionsChange?: (aspectRatio: number) => void;
  path: string;
  /** true = dipakai di stack preview kecil.
   *  false = mode penuh (modal "Lihat PDF") dengan toolbar lengkap + fullscreen.
   *  Keduanya sama-sama scroll semua halaman via trackpad/mouse wheel. */
  compact?: boolean;
}

const MAX_RENDER_SCALE = 3;
const COMPACT_SCALE = 0.75;
const DEFAULT_FULL_SCALE = 1.1; // 110%
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

export default function PdfViewer({ path, compact = false, onDimensionsChange }: PdfViewerProps) {
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const containerScrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(compact ? COMPACT_SCALE : DEFAULT_FULL_SCALE);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const dpr =
    typeof window !== "undefined"
      ? Math.min(2, window.devicePixelRatio || 1)
      : 1;

  // Load dokumen setiap kali path berubah
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScale(compact ? COMPACT_SCALE : DEFAULT_FULL_SCALE);
    pageCanvasRefs.current.clear();

    const url = convertFileSrc(path);
    const task = pdfjsLib.getDocument(url);

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

  // Render satu halaman ke canvas. Canvas TIDAK dibatasi max-width di CSS —
  // container-nya (overflow: auto) yang menangani scroll saat konten lebih
  // besar dari area tampil, supaya zoom di atas 100% benar-benar kelihatan.
  //
  // Pinch-zoom memicu banyak perubahan `scale` secara cepat berturut-turut;
  // tiap perubahan memicu render ulang semua halaman. Kalau render
  // sebelumnya untuk canvas yang sama belum selesai saat render baru
  // dimulai, pdf.js melempar "Cannot use the same canvas during multiple
  // render() operations". Jadi kita lacak RenderTask yang sedang berjalan
  // per canvas, dan cancel() dulu sebelum memulai render baru.
  const renderTasks = useRef<Map<HTMLCanvasElement, pdfjsLib.RenderTask>>(
    new Map(),
  );

  const renderPageToCanvas = useCallback(
    async (pageIndex: number, canvas: HTMLCanvasElement, cssScale: number) => {
      const doc = docRef.current;
      if (!doc) return;

      // Batalkan render yang masih berjalan untuk canvas ini (kalau ada)
      const prevTask = renderTasks.current.get(canvas);
      if (prevTask) {
        prevTask.cancel();
        renderTasks.current.delete(canvas);
      }

      const page = await doc.getPage(pageIndex);
      const renderScale = Math.min(cssScale * dpr, MAX_RENDER_SCALE);
      const viewport = page.getViewport({ scale: renderScale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      if (pageIndex === 1 && onDimensionsChange) {
        onDimensionsChange(viewport.width / viewport.height);
      }

      const task = page.render({ canvasContext: ctx, viewport });
      renderTasks.current.set(canvas, task);
      try {
        await task.promise;
      } catch (e: any) {
        // RenderingCancelledException itu normal (kita sendiri yang cancel
        // di atas saat scale berubah lagi sebelum render lama selesai) —
        // jangan dianggap error sungguhan.
        if (e?.name !== "RenderingCancelledException") throw e;
      } finally {
        if (renderTasks.current.get(canvas) === task) {
          renderTasks.current.delete(canvas);
        }
      }
    },
    [dpr],
  );

  // Render semua halaman begitu numPages diketahui / zoom berubah.
  // Di-debounce sedikit (80ms) supaya saat pinch-zoom memicu banyak
  // perubahan `scale` berturut-turut dalam waktu singkat, kita tidak
  // langsung merender ulang semua halaman di tiap perubahan — cukup
  // render final setelah gerakan sempat berhenti sejenak. Ini mengurangi
  // beban dan potensi race condition, di luar cancellation yang sudah
  // ditangani di renderPageToCanvas.
  useEffect(() => {
    if (loading || error || numPages === 0) return;
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
  }, [loading, error, numPages, scale, renderPageToCanvas]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);


  // scaleRef selalu menyimpan nilai `scale` TERKINI (bukan versi yang
  // "beku" saat effect gesture di-attach) — dipakai supaya listener native
  // (gesturestart/wheel) bisa baca scale terbaru tanpa perlu re-attach
  // listener tiap kali scale berubah (yang akan memutus gesture di tengah jalan).
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // ---- Zoom ke SCALE ABSOLUT target, berpusat di posisi kursor/jari ----
  // Beda dari versi delta-aditif sebelumnya: fungsi ini menerima nilai scale
  // tujuan langsung (bukan "tambah sekian"), supaya cocok dengan sifat
  // e.scale WebKit yang kumulatif-relatif, dan supaya gerakan pinch sekecil
  // apa pun langsung proporsional terasa (tidak "hilang" karena logic delta).
  const zoomToScale = useCallback((clientX: number, clientY: number, targetScale: number) => {
    const el = containerScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = clientX - rect.left + el.scrollLeft;
    const cursorY = clientY - rect.top + el.scrollTop;

    const prevScale = scaleRef.current;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
    if (nextScale === prevScale) return;
    const ratio = nextScale / prevScale;

    setScale(nextScale);
    scaleRef.current = nextScale;

    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollLeft = cursorX * ratio - (clientX - rect.left);
      el.scrollTop = cursorY * ratio - (clientY - rect.top);
    });
  }, []);

  useEffect(() => {
    if (compact) return; // tombol fullscreen cuma ada di mode full
    const handler = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [compact]);

  // ---- Pinch-to-zoom trackpad ----
  // Sudah dikonfirmasi lewat testing: WKWebView (Tauri di macOS) TIDAK
  // meneruskan native gesturestart/gesturechange ke DOM, tapi pinch
  // trackpad tetap muncul sebagai event "wheel" dengan ctrlKey === true
  // (browser secara umum memakai konvensi ini untuk trackpad pinch).
  // Jadi kita hanya perlu satu jalur: wheel + ctrlKey. Scroll wheel biasa
  // (ctrlKey false, termasuk swipe 2 jari pan) dibiarkan native.
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // deltaY negatif = pinch keluar (membesar), positif = pinch masuk
      // (mengecil) — dipakai sebagai faktor pengali eksponensial supaya
      // terasa halus baik untuk gerakan kecil maupun besar.
      const factor = Math.exp(-e.deltaY * 0.01);
      zoomToScale(e.clientX, e.clientY, scaleRef.current * factor);
    },
    [zoomToScale],
  );

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - 0.2));


  if (error) {
    return (
      <div className="pdf-viewer pdf-viewer-error mono">
        Gagal memuat PDF: {error}
      </div>
    );
  }

  const scrollClass = compact ? "pdf-compact-scroll" : "pdf-full-scroll";
  const pageWrapClass = compact ? "pdf-compact-page" : "pdf-full-page";

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
            onClick={compact ? (e) => e.stopPropagation() : undefined}
            onPointerDown={compact ? (e) => e.stopPropagation() : undefined}
          >
            <span className="pdf-page-label">{numPages} halaman</span>
            <span className="pdf-toolbar-sep" />
            <button type="button" className="ghost-btn" onClick={zoomOut}>
              −
            </button>
            <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
            <button type="button" className="ghost-btn" onClick={zoomIn}>
              +
            </button>
            {!compact && (
              <>
                <span className="pdf-toolbar-sep" />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
                </button>
              </>
            )}
          </div>
          {/* Scroll murni pakai overflow:auto native — trackpad/mouse wheel
              langsung jalan tanpa handler khusus, jadi tidak perlu dibedakan
              per-engine webview (WebKit/Chromium) seperti pinch-zoom. */}
          <div ref={containerScrollRef} className={scrollClass} onWheel={onWheel}>
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
