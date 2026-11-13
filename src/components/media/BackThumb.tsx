import { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const cache = new Map<string, string>();
const failed = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();

// Antre satu per satu supaya tidak membebani saat burst.
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

async function makePdfThumb(path: string): Promise<string> {
  const task = pdfjsLib.getDocument(convertFileSrc(path));
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 520 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    task.destroy();
  }
}

function loadThumb(kind: "pdf" | "video", path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return Promise.resolve(hit);
  return enqueue(async () => {
    const again = cache.get(path);
    if (again) return again;
    const url =
      kind === "pdf"
        ? await makePdfThumb(path)
        : await invoke<string>("get_video_thumbnail", { path });
    cache.set(path, url);
    return url;
  });
}

type Props = {
  kind: "pdf" | "video";
  path: string;
  name: string;
  onRatio: (r: number) => void;
};

export default function BackThumb({ kind, path, name, onRatio }: Props) {
  const [src, setSrc] = useState<string>(cache.get(path) ?? "");

  useEffect(() => {
    if (cache.has(path)) {
      setSrc(cache.get(path)!);
      return;
    }
    if (failed.has(path)) return;
    let cancelled = false;
    setSrc("");
    loadThumb(kind, path)
      .then((u) => {
        if (!cancelled) setSrc(u);
      })
      .catch(() => failed.add(path));
    return () => {
      cancelled = true;
    };
  }, [kind, path]);

  if (!src) {
    return (
      <div className="stack-sheet-kind mono">
        <span className="stack-sheet-kind-label">
          {kind === "pdf" ? "PDF" : "VIDEO"}
        </span>
        <span className="stack-sheet-kind-name">{name}</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt=""
        className="stack-sheet-thumb is-loaded"
        draggable={false}
        onLoad={(e) => {
          const i = e.currentTarget;
          if (i.naturalWidth && i.naturalHeight) {
            onRatio(i.naturalWidth / i.naturalHeight);
          }
        }}
      />
      <span className="back-thumb-badge mono">
        {kind === "pdf" ? "PDF" : "▶ VIDEO"}
      </span>
    </>
  );
}
