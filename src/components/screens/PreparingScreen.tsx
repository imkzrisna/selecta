import type { ReactNode } from "react";
import { RollDial } from "../ui/Dials";

type Props = {
  toasts: ReactNode;
  done: number;
  total: number;
};

export default function PreparingScreen({ toasts, done, total }: Props) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="container done-screen">
      {toasts}
      <span className="brand-mark">Selecta</span>
      <h1>Menyiapkan foto…</h1>
      <div className="done-ring">
        <RollDial progress={pct} size={188} />
        <div className="done-ring-label">
          <span className="done-ring-pct mono">{pct}%</span>
          <span className="done-ring-sub">siap</span>
        </div>
      </div>
      <p className="done-tally">
        <span className="stat-value">{done}</span> dari {total} preview siap
      </p>
      <p className="done-path mono">Mohon tunggu sebentar…</p>
    </div>
  );
}
