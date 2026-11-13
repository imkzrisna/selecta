import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  name: string;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 8;

type View = { scale: number; tx: number; ty: number };

export default function ImageZoomViewer({ src, name, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  // View disimpan di ref (dibaca listener native tanpa closure basi),
  // lalu disalin ke state agar React me-render ulang.
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const [view, setViewState] = useState<View>(viewRef.current);
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  // Zoom ke scale target, berpusat di posisi kursor/jari.
  const zoomTo = useCallback(
    (clientX: number, clientY: number, target: number) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const { scale, tx, ty } = viewRef.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      if (next === scale) return;
      if (next === MIN_SCALE) {
        setView({ scale: 1, tx: 0, ty: 0 });
        return;
      }
      const ratio = next / scale;
      setView({
        scale: next,
        tx: px - (px - tx) * ratio,
        ty: py - (py - ty) * ratio,
      });
    },
    [setView],
  );

  const zoomCenter = useCallback(
    (target: number) => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      zoomTo(r.left + r.width / 2, r.top + r.height / 2, target);
    },
    [zoomTo],
  );

  // Wheel native (non-passive) supaya preventDefault berfungsi.
  // ctrlKey = pinch trackpad -> zoom. Tanpa ctrlKey = geser 2 jari -> pan.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomTo(e.clientX, e.clientY, viewRef.current.scale * factor);
      } else if (viewRef.current.scale > 1) {
        const v = viewRef.current;
        setView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, setView]);

  // Keyboard: Esc tutup, + / - zoom, 0 reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomCenter(viewRef.current.scale * 1.25);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomCenter(viewRef.current.scale / 1.25);
      } else if (e.key === "0") {
        e.preventDefault();
        setView({ scale: 1, tx: 0, ty: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomCenter, setView]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Klik ganda tidak boleh membentuk seleksi teks/elemen (blok biru).
    if (e.detail > 1) e.preventDefault();
    if (viewRef.current.scale <= 1) return;
    const v = viewRef.current;
    panStart.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
    setPanning(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = panStart.current;
    if (!s) return;
    setView({
      scale: viewRef.current.scale,
      tx: s.tx + (e.clientX - s.x),
      ty: s.ty + (e.clientY - s.y),
    });
  };
  const endPan = (e: React.PointerEvent) => {
    if (!panStart.current) return;
    panStart.current = null;
    setPanning(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    zoomTo(e.clientX, e.clientY, viewRef.current.scale > 1 ? 1 : 2.5);
  };

  return (
    <div className="zoom-viewer" role="dialog" aria-modal="true">
      <div
        ref={stageRef}
        className={`zoom-stage${view.scale > 1 ? " is-zoomed" : ""}${panning ? " is-panning" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={onDoubleClick}
        onMouseDown={(e) => {
          if (e.detail > 1) e.preventDefault();
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        <img
          src={src}
          alt={name}
          className="zoom-img"
          draggable={false}
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transition: panning ? "none" : "transform 0.12s ease-out",
          }}
        />
      </div>

      <button type="button" className="zoom-close" onClick={onClose} aria-label="Tutup">
        ×
      </button>

      <div className="zoom-toolbar mono">
        <button type="button" className="ghost-btn" onClick={() => zoomCenter(view.scale / 1.25)}>
          −
        </button>
        <span className="zoom-label">{Math.round(view.scale * 100)}%</span>
        <button type="button" className="ghost-btn" onClick={() => zoomCenter(view.scale * 1.25)}>
          +
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
        >
          Reset
        </button>
        <span className="zoom-name">{name}</span>
      </div>
    </div>
  );
}
