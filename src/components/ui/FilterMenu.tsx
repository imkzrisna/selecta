import { useEffect, useRef, useState } from "react";
import type { PhotoKind } from "../../lib/types";
import { FilterGlyph } from "./Glyphs";

type Value = "all" | PhotoKind;

type Props = {
  value: Value;
  onChange: (v: Value) => void;
  disabled: boolean;
  counts: Record<Value, number>;
};

export default function FilterMenu({ value, onChange, disabled, counts }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const opts = [
    { value: "all", label: "Semua" },
    { value: "image", label: "Foto" },
    { value: "pdf", label: "PDF" },
    { value: "video", label: "Video" },
  ] as const;
  const active = opts.find((o) => o.value === value) ?? opts[0];

  return (
    <div className="filter-menu" ref={ref}>
      <button
        type="button"
        className={`filter-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter jenis media"
      >
        <span className="filter-ico">
          <FilterGlyph kind={active.value} />
        </span>
        <span className="filter-label">{active.label}</span>
        <span className="filter-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="filter-pop" role="listbox" aria-label="Filter jenis media">
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              className={`filter-opt${value === o.value ? " is-active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="filter-ico">
                <FilterGlyph kind={o.value} />
              </span>
              <span className="filter-opt-label">{o.label}</span>
              <span className="filter-opt-count mono">{counts[o.value]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
