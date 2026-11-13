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
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const [label, setLabel] = useState(100);
  const [zoomed, setZoomed] = useState(false);
  const [panning, setPanning] = useState(false);

  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const velocity = useRef({ vx: 0, vy: 0, t: 0 });
  const rafRef = useRef<number | null>(null);
  const inertiaRef = useRef<number | null>(null);
  const smoothTimer = useRef<number | null>(null);

  // Batas geser: gambar tidak boleh keluar dari area pandang.
  const clampView = useCallback((v: View): View => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || v.scale <= 1) return { scale: v.scale, tx: 0, ty: 0 };
    const maxX = Math.max(0, (img.offsetWidth * v.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * v.scale - stage.clientHeight) / 2);
    return {
      scale: v.scale,
      tx: Math.min(maxX, Math.max(-maxX, v.tx)),
      ty: Math.min(maxY, Math.max(-maxY, v.ty)),
    };
  }, []);

  const paint = useCallback(() => {
    rafRef.current = null;
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = viewRef.current;
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  }, []);

  // smooth=true: gerakan beranimasi (tombol, double-click, reset).
  const apply = useCallback(
    (v: View, smooth = false) => {
      stopInertia();
      const img = imgRef.current;
      if (img) {
        if (smoothTimer.current) window.clearTimeout(smoothTimer.current);
        if (smooth) {
          img.style.transition = "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
          smoothTimer.current = window.setTimeout(() => {
            if (imgRef.current) imgRef.current.style.transition = "none";
          }, 300);
        } else {
          img.style.transition = "none";
        }
      }
      viewRef.current = clampView(v);
      setLabel(Math.round(viewRef.current.scale * 100));
      setZoomed(viewRef.current.scale > 1);
      schedule();
    },
    [clampView, schedule, stopInertia],
  );

  const zoomTo = useCallback(
    (clientX: number, clientY: number, target: number, smooth = false) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const { scale, tx, ty } = viewRef.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      if (next === scale) return;
      if (next === MIN_SCALE) {
        apply({ scale: 1, tx: 0, ty: 0 }, smooth);
        return;
      }
      const ratio = next / scale;
      apply({ scale: next, tx: px - (px - tx) * ratio, ty: py - (py - ty) * ratio }, smooth);
    },
    [apply],
  );

  const zoomCenter = useCallback(
    (target: number) => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      zoomTo(r.left + r.width / 2, r.top + r.height / 2, target, true);
    },
    [zoomTo],
  );

  // Wheel native: ctrlKey = pinch (tanpa transisi), lainnya = pan 2 jari.
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
        apply({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, apply]);

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
        apply({ scale: 1, tx: 0, ty: 0 }, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomCenter, apply]);

  useEffect(
    () => () => {
      stopInertia();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (smoothTimer.current) window.clearTimeout(smoothTimer.current);
    },
    [stopInertia],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.detail > 1) e.preventDefault();
    if (viewRef.current.scale <= 1) return;
    stopInertia();
    const v = viewRef.current;
    panStart.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
    velocity.current = { vx: 0, vy: 0, t: performance.now() };
    if (imgRef.current) imgRef.current.style.transition = "none";
    setPanning(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = panStart.current;
    if (!s) return;
    const now = performance.now();
    const nx = s.tx + (e.clientX - s.x);
    const ny = s.ty + (e.clientY - s.y);
    const prev = viewRef.current;
    const dt = Math.max(1, now - velocity.current.t);
    // Kecepatan dihaluskan supaya inersia tidak liar.
    velocity.current = {
      vx: velocity.current.vx * 0.6 + ((nx - prev.tx) / dt) * 0.4,
      vy: velocity.current.vy * 0.6 + ((ny - prev.ty) / dt) * 0.4,
      t: now,
    };
    // Perlawanan karet saat melewati tepi.
    const c = clampView({ scale: prev.scale, tx: nx, ty: ny });
    viewRef.current = {
      scale: prev.scale,
      tx: c.tx + (nx - c.tx) * 0.25,
      ty: c.ty + (ny - c.ty) * 0.25,
    };
    schedule();
  };

  const endPan = (e: React.PointerEvent) => {
    if (!panStart.current) return;
    panStart.current = null;
    setPanning(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);

    let { vx, vy } = velocity.current;
    if (performance.now() - velocity.current.t > 80) {
      vx = 0;
      vy = 0;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      const v = viewRef.current;
      const c = clampView(v);
      // Di luar batas: tarik kembali dengan halus. Di dalam: meluncur.
      const outX = v.tx - c.tx;
      const outY = v.ty - c.ty;
      vx = vx * Math.pow(0.94, dt / 16) - outX * 0.02 * dt;
      vy = vy * Math.pow(0.94, dt / 16) - outY * 0.02 * dt;
      viewRef.current = { scale: v.scale, tx: v.tx + vx * dt, ty: v.ty + vy * dt };
      paint();
      const moving = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01 || Math.abs(outX) > 0.5 || Math.abs(outY) > 0.5;
      if (moving) {
        inertiaRef.current = requestAnimationFrame(step);
      } else {
        inertiaRef.current = null;
        viewRef.current = clampView(viewRef.current);
        paint();
      }
    };
    inertiaRef.current = requestAnimationFrame(step);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    zoomTo(e.clientX, e.clientY, viewRef.current.scale > 1 ? 1 : 2.5, true);
  };

  return (
    <div className="zoom-viewer" role="dialog" aria-modal="true">
      <div
        ref={stageRef}
        className={`zoom-stage${zoomed ? " is-zoomed" : ""}${panning ? " is-panning" : ""}`}
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
          ref={imgRef}
          src={src}
          alt={name}
          className="zoom-img"
          draggable={false}
          style={{ transform: "translate3d(0,0,0) scale(1)", transition: "none" }}
        />
      </div>

      <button type="button" className="zoom-close" onClick={onClose} aria-label="Tutup">
        ×
      </button>

      <div className="zoom-toolbar mono">
        <button type="button" className="ghost-btn" onClick={() => zoomCenter(viewRef.current.scale / 1.25)}>
          −
        </button>
        <span className="zoom-label">{label}%</span>
        <button type="button" className="ghost-btn" onClick={() => zoomCenter(viewRef.current.scale * 1.25)}>
          +
        </button>
        <button type="button" className="ghost-btn" onClick={() => apply({ scale: 1, tx: 0, ty: 0 }, true)}>
          Reset
        </button>
        <span className="zoom-name">{name}</span>
      </div>
    </div>
  );
}
