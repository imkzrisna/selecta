import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

type View = { scale: number; tx: number; ty: number };
const IDENTITY: View = { scale: 1, tx: 0, ty: 0 };

// Pinch trackpad (wheel + ctrlKey) untuk zoom inline di kartu sorting.
// Zoom lewat width/height (bukan transform: scale) supaya gambar dirender
// ulang tajam dari file asli, bukan bitmap yang direntangkan.
export function useCardPinchZoom(enabled: boolean, resetKey?: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const viewRef = useRef<View>({ ...IDENTITY });
  const baseRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  const paint = useCallback(() => {
    rafRef.current = null;
    const t = el?.firstElementChild as HTMLElement | null;
    if (!t) return;
    const { scale, tx, ty } = viewRef.current;
    if (scale === 1) {
      t.style.width = "";
      t.style.height = "";
      t.style.maxWidth = "";
      t.style.maxHeight = "";
      t.style.flexShrink = "";
      t.style.transform = "";
      return;
    }
    const b = baseRef.current;
    t.style.maxWidth = "none";
    t.style.maxHeight = "none";
    t.style.flexShrink = "0";
    t.style.width = `${b.w * scale}px`;
    t.style.height = `${b.h * scale}px`;
    t.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }, [el]);

  const apply = useCallback(
    (v: View) => {
      if (!el) return;
      let next: View = { ...IDENTITY };
      if (v.scale > MIN_SCALE) {
        const b = baseRef.current;
        const maxX = Math.max(0, (b.w * v.scale - el.clientWidth) / 2);
        const maxY = Math.max(0, (b.h * v.scale - el.clientHeight) / 2);
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
        const t = el.firstElementChild as HTMLElement | null;
        if (!t) return;
        if (v.scale === 1) {
          baseRef.current = { w: t.offsetWidth, h: t.offsetHeight };
        }
        const r = el.getBoundingClientRect();
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
    },
    [],
  );

  return { setEl, zoomed, reset };
}
