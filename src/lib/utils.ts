import type { CSSProperties } from "react";

export function seededOffset(seed: string, index: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const n = (i: number) => {
    const x = Math.sin(h + i * 97.13) * 10000;
    return x - Math.floor(x); // 0..1
  };
  const rotate = (n(index) - 0.5) * 3; // subtle — minimal stack, not a paper toss
  const shiftX = (n(index + 1) - 0.5) * 6;
  return { rotate, shiftX };
}

export function cacheSet(
  map: Map<string, string>,
  key: string,
  value: string,
  limit = 60,
) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

export function splitName(name: string) {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

export const cleanBase = (v: string) => v.replace(/[\/\\:]/g, "-").trim();

export const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase() : "FILE";
};

export const LONG_MIN = 0.4;

export const LONG_MAX = 2.5;

export function longKindOf(r: number | null | undefined): "tall" | "wide" | undefined {
  if (!r) return undefined;
  if (r < LONG_MIN) return "tall";
  if (r > LONG_MAX) return "wide";
  return undefined;
}

export function shapeRatio(r: number): number {
  const k = longKindOf(r);
  return k === "tall" ? 0.72 : k === "wide" ? 4 / 3 : r;
}

export function backCardStyle(
  r0: number | undefined,
  box: { w: number; h: number } | null,
): CSSProperties | undefined {
  if (!r0) return undefined;
  const r = shapeRatio(r0);
  if (!box || !box.w || !box.h) return { aspectRatio: `${r}` };
  const w = Math.min(box.w * 0.8, box.h * 0.8 * r);
  return {
    aspectRatio: `${r}`,
    width: w,
    height: w / r,
    maxWidth: "none",
    maxHeight: "none",
  };
}
