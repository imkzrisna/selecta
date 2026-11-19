import { useEffect, useState } from "react";

type Nat = { w: number; h: number };

// Ukuran target (px) agar foto kecil mengisi kotak preview, dibatasi maxScale.
// Mengembalikan null jika foto sudah cukup besar (tidak perlu dibesarkan).
export function useFitUpscale(nat: Nat | null, maxScale: number, watchKey: string) {
  const [box, setBox] = useState<Nat | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".preview-box:not(.review-box)");
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [watchKey]);

  if (!nat || !box || !nat.w || !nat.h || maxScale <= 1) return null;
  // Kartu = inset 3% di tiap sisi dari preview-box.
  const availW = box.w * 0.94;
  const availH = box.h * 0.94;
  const fit = Math.min(availW / nat.w, availH / nat.h);
  const scale = Math.min(fit, maxScale);
  if (scale <= 1.02) return null;
  return { w: Math.round(nat.w * scale), h: Math.round(nat.h * scale), fit };
}
