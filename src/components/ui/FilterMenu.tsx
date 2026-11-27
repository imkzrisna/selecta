import type { PhotoKind } from "../../lib/types";
import { FilterGlyph } from "./Glyphs";

type Value = "all" | PhotoKind;

type Props = {
  value: Value;
  onChange: (v: Value) => void;
  disabled: boolean;
  counts: Record<Value, number>;
};

const OPTS = [
  { value: "all", label: "Semua" },
  { value: "image", label: "Foto" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Video" },
] as const;

export default function FilterMenu({ value, onChange, disabled, counts }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="Filter jenis media">
      {OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`segmented-opt${value === o.value ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          title={`Tampilkan ${o.label.toLowerCase()}`}
        >
          <span className="filter-ico">
            <FilterGlyph kind={o.value} />
          </span>
          <span>{o.label}</span>
          <span className="segmented-count">{counts[o.value]}</span>
        </button>
      ))}
    </div>
  );
}
