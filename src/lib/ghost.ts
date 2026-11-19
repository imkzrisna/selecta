// Kartu "hantu": salinan kartu depan yang terbang sendiri saat keputusan dicatat.
export function flyGhost(
  card: HTMLElement,
  box: HTMLElement,
  opts: {
    dir: "left" | "right" | "down";
    ms: number;
    fast: boolean;
    zIndex: number;
    trayEl?: HTMLElement | null;
  },
) {
  const { dir, ms, fast, zIndex, trayEl } = opts;
  const ghost = card.cloneNode(true) as HTMLDivElement;
  ghost.className = `preview-card exit-${dir}${fast ? " is-burst" : ""} is-ghost`;
  ghost.style.pointerEvents = "none";
  ghost.style.transform = "";
  ghost.style.zIndex = String(zIndex);
  ghost.style.setProperty("--start-x", "0px");
  ghost.style.setProperty("--start-rot", "0deg");
  if (fast) {
    ghost.style.setProperty("--burst-ms", `${ms}ms`);
    ghost.style.setProperty("--burst-fade", `${Math.max(30, Math.round(ms / 3))}ms`);
    ghost.style.setProperty("--burst-fade-delay", `${Math.round(ms * 0.66)}ms`);
  }
  if (dir === "right" && trayEl) {
    const c = card.getBoundingClientRect();
    const tr = trayEl.getBoundingClientRect();
    const S = 0.3;
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    ghost.style.setProperty(
      "--exit-x",
      `${tr.left + tr.width / 2 - cx - 0.3 * card.offsetWidth * (1 - S)}px`,
    );
    ghost.style.setProperty(
      "--exit-y",
      `${tr.top + tr.height / 2 - cy - 0.3 * card.offsetHeight * (1 - S)}px`,
    );
  }
  // Batasi ghost yang masih terbang agar tidak menumpuk saat burst panjang.
  const live = box.querySelectorAll(":scope > .is-ghost");
  for (let i = 0; i < live.length - 3; i++) live[i].remove();
  box.appendChild(ghost);
  // cloneNode tidak menyalin isi <canvas> (PDF) maupun posisi scroll.
  const src = card.querySelectorAll("canvas");
  const dst = ghost.querySelectorAll("canvas");
  src.forEach((c, i) => {
    const d = dst[i] as HTMLCanvasElement | undefined;
    try {
      d?.getContext("2d")?.drawImage(c, 0, 0);
    } catch {
      /* ghost tetap terbang tanpa isi kanvas */
    }
  });
  const s1 = card.querySelector(".pdf-compact-scroll");
  const s2 = ghost.querySelector(".pdf-compact-scroll");
  if (s1 && s2) {
    s2.scrollTop = s1.scrollTop;
    s2.scrollLeft = s1.scrollLeft;
  }
  window.setTimeout(() => ghost.remove(), ms + 120);
}
