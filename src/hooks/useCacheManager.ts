import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Stage } from "../lib/types";

const CACHE_LIMIT = 500 * 1024 * 1024;

// Ukuran cache, tombol bersihkan (konfirmasi 2 klik), dan trim otomatis.
export function useCacheManager(stage: Stage) {
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refreshCacheSize = useCallback(() => {
    invoke<{ total: number }>("get_cache_size")
      .then((r) => setCacheBytes(r.total))
      .catch(() => setCacheBytes(null));
  }, []);

  useEffect(() => {
    if (stage === "setup") refreshCacheSize();
  }, [stage, refreshCacheSize]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  useEffect(() => {
    if (stage !== "setup" && stage !== "done") return;
    invoke("trim_cache", { maxBytes: CACHE_LIMIT })
      .then(() => refreshCacheSize())
      .catch(() => {});
  }, [stage, refreshCacheSize]);

  const clearCache = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    setClearing(true);
    try {
      await invoke("trim_cache", { maxBytes: 0 });
    } catch {
      /* abaikan */
    }
    setClearing(false);
    refreshCacheSize();
  };

  return { cacheBytes, confirmClear, clearing, clearCache };
}
