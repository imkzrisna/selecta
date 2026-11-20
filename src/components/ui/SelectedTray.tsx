import type { Dispatch, RefObject, SetStateAction, MutableRefObject } from "react";
import type { PhotoEntry } from "../../lib/types";

type Props = {
  trayRef: RefObject<HTMLDivElement | null>;
  trayBump: boolean;
  trayOpen: boolean;
  setTrayOpen: Dispatch<SetStateAction<boolean>>;
  selectedPhotos: PhotoEntry[];
  selectedCount: number;
  previewCache: MutableRefObject<Map<string, string>>;
  setViewingPhoto: (p: PhotoEntry | null) => void;
  handleRemoveSelected: (p: PhotoEntry) => void;
  isProcessing: boolean;
};

export default function SelectedTray({
  trayRef,
  trayBump,
  trayOpen,
  setTrayOpen,
  selectedPhotos,
  selectedCount,
  previewCache,
  setViewingPhoto,
  handleRemoveSelected,
  isProcessing,
}: Props) {
  return (
      <div
        ref={trayRef}
        className={`selected-tray${trayBump ? " tray-bump" : ""}`}
      >
        <button
          type="button"
          className="tray-toggle"
          onClick={() => setTrayOpen((o) => !o)}
          disabled={selectedCount === 0}
          aria-expanded={trayOpen}
          aria-haspopup="true"
          title={
            selectedCount === 0
              ? "Belum ada foto terpilih"
              : "Lihat foto terpilih"
          }
        >
          <span className="tray-count mono">{selectedCount}</span>
          <span className="tray-label">Terpilih</span>
        </button>

        {trayOpen && selectedPhotos.length > 0 && (
          <div className="tray-dropdown">
            <div className="tray-dropdown-header">
              <span>Foto Terpilih</span>
              <button
                type="button"
                className="tray-dropdown-close"
                onClick={() => setTrayOpen(false)}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="tray-dropdown-list">
              {selectedPhotos.map((p) => {
                const thumb = previewCache.current.get(p.path);
                return (
                  <div className="tray-dropdown-item" key={p.path}>
                    <button
                      type="button"
                      className="tray-dropdown-item-main"
                      onClick={() => setViewingPhoto(p)}
                    >
                      <div className="tray-thumb">
                        {p.kind === "pdf" ? (
                          <span className="tray-thumb-fallback mono">PDF</span>
                        ) : thumb ? (
                          <img src={thumb} alt={p.name} />
                        ) : (
                          <span className="tray-thumb-fallback mono">IMG</span>
                        )}
                      </div>
                      <span className="tray-dropdown-name mono">{p.name}</span>
                    </button>
                    <button
                      type="button"
                      className="tray-dropdown-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSelected(p);
                      }}
                      disabled={isProcessing}
                      title="Hapus dari terpilih"
                      aria-label={`Hapus ${p.name} dari terpilih`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
  );
}
