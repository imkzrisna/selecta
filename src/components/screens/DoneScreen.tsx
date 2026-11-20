import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { RollDial } from "../ui/Dials";
import type { Stage } from "../../lib/types";

type Props = {
  toasts: ReactNode;
  selectedCount: number;
  totalLoaded: number;
  outputPath: string;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  pushToast: (m: string) => void;
  setStage: (s: Stage) => void;
  onReset: () => void;
};

export default function DoneScreen(p: Props) {
  const rate = p.totalLoaded
    ? Math.round((p.selectedCount / p.totalLoaded) * 100)
    : 0;

  const restore = async () => {
    const yes = await ask(
      "Semua file dari ekspor terakhir akan dikembalikan ke folder sumber. Lanjutkan?",
      { title: "Kembalikan ekspor", kind: "warning", okLabel: "Kembalikan", cancelLabel: "Batal" },
    );
    if (!yes) return;
    p.setIsProcessing(true);
    try {
      const r = await invoke<{ restored: number; failed: string[] }>("undo_last_export");
      if (r.failed.length > 0) console.warn("Kembalikan gagal sebagian:", r.failed);
      p.pushToast(
        r.failed.length > 0
          ? `${r.restored} dikembalikan, ${r.failed.length} gagal.`
          : `${r.restored} file dikembalikan.`,
      );
      if (r.failed.length === 0) p.setStage("setup");
    } catch (e) {
      p.pushToast(String(e));
    } finally {
      p.setIsProcessing(false);
    }
  };

  return (
    <div className="container done-screen">
      {p.toasts}
      <span className="brand-mark">Selecta</span>
      <h1>Selesai</h1>
      <div className="done-ring">
        <RollDial progress={rate} size={188} />
        <div className="done-ring-label">
          <span className="done-ring-pct mono">{rate}%</span>
          <span className="done-ring-sub">disimpan</span>
        </div>
      </div>
      <p className="done-tally">
        <span className="stat-value">{p.selectedCount}</span> dari {p.totalLoaded}{" "}
        foto disimpan
      </p>
      <p className="done-path mono">{p.outputPath}</p>
      <button className="ghost-btn" disabled={p.isProcessing} onClick={restore}>
        Kembalikan ekspor
      </button>
      <button className="primary" onClick={p.onReset}>
        Mulai Roll Baru
      </button>
    </div>
  );
}
