import { useEffect, useMemo, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

type VideoViewerProps = {
  path: string;
  compact?: boolean;
  /** Dipanggil begitu metadata video termuat, dengan rasio lebar/tinggi asli. */
  onDimensionsChange?: (aspectRatio: number) => void;
};

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

// Cache sederhana per-path supaya thumbnail tidak digenerate ulang.
const thumbCache = new Map<string, string>();

export default function VideoViewer({ path, compact = false, onDimensionsChange }: VideoViewerProps) {
  const src = useMemo(() => convertFileSrc(path), [path]);
  const [thumb, setThumb] = useState<string>(thumbCache.get(path) ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!compact) return;
    const cached = thumbCache.get(path);
    if (cached) {
      setThumb(cached);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setThumb("");
    setFailed(false);

    invoke<string>("get_video_thumbnail", { path })
      .then((dataUrl) => {
        if (cancelled) return;
        thumbCache.set(path, dataUrl);
        setThumb(dataUrl);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("Gagal membuat thumbnail video:", e);
        setFailed(true);
        // Tanpa thumbnail tidak ada rasio asli -> pakai 16:9 supaya kartu
        // tidak mengecil.
        onDimensionsChange?.(16 / 9);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, compact]);

  if (compact) {
    return (
      <div className="video-viewer video-viewer-compact">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="video-thumb-img"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight && onDimensionsChange) {
                onDimensionsChange(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        ) : failed ? (
          <div className="video-thumb-fallback" />
        ) : (
          <div className="video-thumb-placeholder mono">Memuat thumbnail…</div>
        )}
        {(thumb || failed) && (
          <>
            <span className="video-thumb-badge mono">VIDEO</span>
            <span className="video-thumb-play" aria-hidden="true">
              ▶
            </span>
            <span className="video-thumb-name mono">{fileNameFromPath(path)}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="video-viewer">
      <video
        key={src}
        className="video-el"
        src={src}
        controls
        autoPlay
        playsInline
        preload="auto"
        tabIndex={-1}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight && onDimensionsChange) {
            onDimensionsChange(v.videoWidth / v.videoHeight);
          }
        }}
      />
    </div>
  );
}
