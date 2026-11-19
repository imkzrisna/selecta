import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

// Pinch trackpad (wheel + ctrlKey) untuk zoom inline di kartu sorting.
// Transform dipasang di anak pertama container, bukan di kartu, karena
// transform kartu dipakai animasi swipe/exit/undo.
export function useCardPinchZoom(enabled: boolean, resetKey?: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const viewRef = useRef<View>({ ...IDENTITY });
  const rafRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);

  const paint = useCallback(() => {
    rafRef.current = null;
    const target = el?.firstElementChild as HTMLElement | null;
    if (!target) return;
    const { scale, tx, ty } = viewRef.current;
    if (scale === 1) {
      target.style.transform = "";
      target.style.transformOrigin = "";
      target.style.willChange = "";
      return;
    }
    target.style.transformOrigin = "50% 50%";
    target.style.willChange = "transform";
    target.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    // will-change permanen membuat WebKit menahan raster di skala awal
    // (buram). Lepas setelah gesture berhenti agar dirender ulang tajam.
    if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      idleRef.current = null;
      target.style.willChange = "auto";
    }, 160);
  }, [el]);

  const apply = useCallback(
    (v: View) => {
      if (!el) return;
      let next = v;
      if (v.scale <= MIN_SCALE) {
        next = { ...IDENTITY };
      } else {
        const maxX = (el.clientWidth * v.scale - el.clientWidth) / 2;
        const maxY = (el.clientHeight * v.scale - el.clientHeight) / 2;
        next = {
          scale: v.scale,
          tx: Math.min(maxX, Math.max(-maxX, v.tx)),
          ty: Math.min(maxY, Math.max(-maxY, v.ty)),
        };
      }
      viewRef.current = next;
      setZoomed((z) => (z === next.scale > 1 ? z : next.scale > 1));
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(paint);
    },
    [el, paint],
  );

  const reset = useCallback(() => apply({ ...IDENTITY }), [apply]);

  // Reset setiap ganti foto / hook dimatikan.
  useEffect(() => {
    viewRef.current = { ...IDENTITY };
    setZoomed(false);
    paint();
  }, [resetKey, enabled, paint]);

  useEffect(() => {
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (e.ctrlKey) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        // Posisi kursor relatif ke pusat container (origin transform = tengah).
        const px = e.clientX - (r.left + r.width / 2);
        const py = e.clientY - (r.top + r.height / 2);
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, v.scale * Math.exp(-e.deltaY * 0.01)),
        );
        if (next === v.scale) return;
        const ratio = next / v.scale;
        apply({
          scale: next,
          tx: px - (px - v.tx) * ratio,
          ty: py - (py - v.ty) * ratio,
        });
      } else if (v.scale > 1) {
        e.preventDefault();
        apply({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [el, enabled, apply]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    },
    [],
  );

  return { setEl, zoomed, reset };
}
