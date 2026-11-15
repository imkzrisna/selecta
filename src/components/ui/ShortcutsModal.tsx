export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => onClose()}
          role="dialog"
          aria-modal="true"
        >
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-modal-header">
              <span>Tutorial & Panduan</span>
              <button
                type="button"
                className="photo-lightbox-close"
                onClick={() => onClose()}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="shortcuts-modal-body">
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Cara Kerja</div>
                <p className="tutorial-desc">
                  Setiap file (foto/PDF/video) muncul satu per satu sebagai
                  kartu paling depan di tumpukan. Beberapa file berikutnya
                  terlihat samar di belakangnya sebagai antrian.
                </p>
                <p className="tutorial-desc">
                  <kbd>&larr;</kbd> melewati file (kembali ke belakang antrian),
                  <kbd>&rarr;</kbd> memilihnya (masuk ke Selected dan dipindah
                  ke folder tujuan).
                </p>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Filter Jenis Media</div>
                <p className="tutorial-desc">
                  Tombol Semua/Foto/PDF/Video di top-bar menyaring apa yang
                  ditampilkan di tumpukan. File jenis lain tidak hilang, cuma
                  disembunyikan sementara.
                </p>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Mode Banding</div>
                <p className="tutorial-desc">
                  Jadikan file yang sedang tampil sebagai patokan untuk
                  dibandingkan berdampingan dengan file lain di antrian --
                  berguna saat memilih yang terbaik dari beberapa foto mirip.
                </p>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Umum</div>
                <div className="shortcuts-row">
                  <kbd>←</kbd> <span>Skip / masukkan kembali ke Queue</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>→</kbd> <span>Select / masukkan ke Selected</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>Esc</kbd> <span>Kembali</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>Enter</kbd> <span>Konfirmasi</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> <span>Undo aksi terakhir</span>
                </div>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Video</div>
                <div className="shortcuts-row">
                  <kbd>Space</kbd> <span>Play / Pause</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>J</kbd> <span>Mundur 5 detik</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>L</kbd> <span>Maju 5 detik</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>Shift</kbd>+<kbd>J</kbd> <span>Mundur 10 detik</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>Shift</kbd>+<kbd>L</kbd> <span>Maju 10 detik</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>↑</kbd>/<kbd>↓</kbd>{" "}
                  <span>Naikkan / turunkan volume</span>
                </div>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">PDF</div>
                <div className="shortcuts-row">
                  <kbd>↑</kbd>/<kbd>↓</kbd> <span>Navigasi halaman</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>+</kbd>/<kbd>−</kbd> <span>Zoom in / out</span>
                </div>
              </div>
              <div className="shortcuts-group">
                <div className="shortcuts-group-title">Mode Banding</div>
                <div className="shortcuts-row">
                  <kbd>⌘/Ctrl</kbd>+<kbd>↓</kbd> <span>Jadikan patokan</span>
                </div>
                <div className="shortcuts-row">
                  <kbd>⌘/Ctrl</kbd>+<kbd>↑</kbd>{" "}
                  <span>Keluar mode banding</span>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
}
