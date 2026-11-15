export function RollDial({
  progress,
  size = 180,
}: {
  progress: number;
  size?: number;
}) {
  const clamped = Math.min(100, Math.max(0, progress));
  const cx = size / 2;
  const cy = size / 2;

  const ringStroke = 7;
  const ringR = size / 2 - 26;
  const c = 2 * Math.PI * ringR;
  const offset = c - (clamped / 100) * c;

  const tickCount = 48;
  const tickOuter = size / 2 - 3;
  const ticks = Array.from({ length: tickCount }).map((_, i) => {
    const major = i % 4 === 0;
    const tickInner = tickOuter - (major ? 11 : 6);
    const angleDeg = (i / tickCount) * 360 - 90;
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = cx + tickInner * Math.cos(rad);
    const y1 = cy + tickInner * Math.sin(rad);
    const x2 = cx + tickOuter * Math.cos(rad);
    const y2 = cy + tickOuter * Math.sin(rad);
    const filled = (i / tickCount) * 100 <= clamped;
    return { key: i, x1, y1, x2, y2, filled, major };
  });

  return (
    <svg width={size} height={size} className="roll-dial">
      {ticks.map((t) => (
        <line
          key={t.key}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.filled ? "var(--accent)" : "var(--border-strong)"}
          strokeWidth={t.major ? 2 : 1.4}
          strokeLinecap="round"
          opacity={t.filled ? 1 : 0.6}
        />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke="var(--border)"
        strokeWidth={ringStroke}
      />
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={ringStroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="roll-dial-arc"
      />
    </svg>
  );
}

export function ProgressRing({
  progress,
  size = 40,
  strokeWidth = 3.5,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, progress)) / 100) * c;
  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
