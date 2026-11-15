import type { PhotoKind } from "../../lib/types";

export function FolderGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3a1.5 1.5 0 0 1 1.2.6l1 1.4h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function TrayGlyph({ large = false }: { large?: boolean }) {
  const s = large ? 34 : 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none">
      <path
        d="M4 13.5 6.2 5.8A1.5 1.5 0 0 1 7.65 4.7h8.7a1.5 1.5 0 0 1 1.45 1.1L20 13.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4 13.5h4.2a1 1 0 0 1 .95.68l.4 1.2a1 1 0 0 0 .95.68h2.6a1 1 0 0 0 .95-.68l.4-1.2a1 1 0 0 1 .95-.68H20V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function FilterGlyph({ kind }: { kind: "all" | PhotoKind }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none" } as const;
  const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (kind === "image") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2.5" {...s} />
        <circle cx="9" cy="10" r="1.4" {...s} />
        <path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L19 16" {...s} />
      </svg>
    );
  }
  if (kind === "pdf") {
    return (
      <svg {...common}>
        <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" {...s} />
        <path d="M9.5 13h5M9.5 16.5h5" {...s} />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg {...common}>
        <path d="M9 7.5v9l7.5-4.5L9 7.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" {...s} />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" {...s} />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" {...s} />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" {...s} />
    </svg>
  );
}
