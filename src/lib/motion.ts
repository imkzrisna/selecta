// Harus SAMA PERSIS dengan durasi @keyframes card-pop-in di App.css
// (animation: card-pop-in 0.38s ...). Dipakai untuk menahan guard exit
// selama kartu baru masih dalam proses animasi "masuk", supaya swipe
// berikutnya tidak bisa dimulai sebelum kartu baru benar-benar settle.
export const CARD_POP_IN_MS = 380;

// Durasi animasi exit normal (single press) — NILAI TIDAK BERUBAH dari
// sebelumnya (320ms kiri via exit-to-queue, 380ms kanan via
// exit-to-selected di App.css). Dipusatkan di sini supaya HOLD_EXIT_MS
// (ditambahkan di step berikutnya) tidak perlu hardcode terpisah.
export const NORMAL_EXIT_MS: Record<"left" | "right", number> = {
  left: 460,
  right: 380,
};

// Mode burst (← ditahan / ditekan beruntun): animasi dipersingkat.
// Nilai HARUS sama dengan .preview-card.is-burst di App.css (160ms)
// dan .preview-card.exit-left.is-burst (150ms).
export const BURST_EXIT_MS = 150;

export const BURST_WINDOW_MS = 300; // jeda maksimum antar tekanan ← agar dianggap burst

export const BURST_IDLE_MS = 500; // burst berakhir jika tidak ada trigger sepanjang ini

export const BURST_GATE_MS = 24; // jeda gerbang antar kartu saat burst

export const MAX_PENDING_BURST = 3; // maks. tekanan yang ditampung

export const BURST_MIN_MS = 65; // durasi exit tercepat saat burst panjang

export const BURST_RAMP = 14; // jumlah kartu sampai kecepatan maksimum

// Durasi animasi undo — HARUS sama dengan App.css (.undo-from-back / .undo-from-tray).
export const UNDO_BACK_MS = 420;

export const UNDO_TRAY_MS = 460;

export const burstExitMs = (n: number) =>
  Math.round(
    BURST_EXIT_MS -
      (BURST_EXIT_MS - BURST_MIN_MS) * (Math.min(n, BURST_RAMP) / BURST_RAMP),
  );
