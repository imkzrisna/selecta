// Modul cache: mengelola index persisten (index.json) dan lokasi thumbnail
// di disk, terpisah dari folder source/target milik user.
//
// Sengaja TIDAK pakai database — cukup satu file JSON + folder gambar,
// sesuai prinsip "jangan over-engineer" untuk ukuran data yang dihadapi
// (ratusan-ribuan entry, index.json realistis di kisaran ratusan KB).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// Bump angka ini kapan pun logic generate preview berubah (mis. ganti
// resolusi target) — otomatis membuat semua entry cache lama dianggap
// invalid tanpa perlu migrasi manual.
pub const PREVIEW_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CacheEntry {
    pub hash: String,
    pub size: u64,
    pub modified: u64,
    pub preview_version: u32,
    pub kind: String,
}

pub type CacheIndex = HashMap<String, CacheEntry>;

/// Folder cache aplikasi (bukan di dalam source/target folder user).
/// Membuat folder ini + subfolder thumbs/ kalau belum ada.
pub fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("selecta-previews");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("thumbs")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(cache_dir(app)?.join("index.json"))
}

/// Baca index.json. Kalau belum ada / rusak / gagal parse, kembalikan
/// index kosong (bukan error) — cache yang hilang bukan kondisi fatal,
/// cukup dianggap "belum ada apa-apa yang di-cache".
pub fn load_index(app: &AppHandle) -> CacheIndex {
    let path = match index_path(app) {
        Ok(p) => p,
        Err(_) => return CacheIndex::new(),
    };
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => CacheIndex::new(),
    }
}

pub fn save_index(app: &AppHandle, index: &CacheIndex) -> Result<(), String> {
    let path = index_path(app)?;
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Hash deterministik dari path absolut file — dipakai sebagai nama file
/// thumbnail di disk supaya tidak tabrakan antar folder berbeda dengan
/// nama file yang sama. Bukan cryptographic hash (tidak perlu, ini cuma
/// untuk penamaan file, bukan keamanan).
pub fn hash_path(path: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn thumb_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    Ok(cache_dir(app)?
        .join("thumbs")
        .join(format!("{}.jpg", hash_path(path))))
}

fn dir_size(p: &std::path::Path) -> u64 {
    walkdir::WalkDir::new(p)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

#[derive(Serialize)]
pub struct CacheSizeReport {
    pub total: u64,
    pub thumbs: u64,
    pub full: u64,
    pub screen: u64,
    pub sessions: u64,
    pub export_logs: u64,
}

pub fn size_report(app: &AppHandle) -> Result<CacheSizeReport, String> {
    let root = cache_dir(app)?;
    Ok(CacheSizeReport {
        total: dir_size(&root),
        thumbs: dir_size(&root.join("thumbs")),
        full: dir_size(&root.join("full")),
        screen: dir_size(&root.join("screen")),
        sessions: dir_size(&root.join("sessions")),
        export_logs: dir_size(&root.join("export-logs")),
    })
}

#[derive(Serialize)]
pub struct TrimReport {
    pub removed_files: u32,
    pub freed: u64,
}

/// Hapus thumbnail paling lama tidak dipakai sampai total <= max_bytes.
/// Hanya menyentuh file di dalam thumbs/. Juga membuang entri index yang
/// thumbnail-nya sudah tidak ada, dan file sementara sips yang sudah lama.
static TRIMMING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Hanya satu trim berjalan sekaligus; panggilan lain yang bersamaan dilewati.
pub fn trim_thumbs(app: &AppHandle, max_bytes: u64) -> Result<TrimReport, String> {
    use std::sync::atomic::Ordering;
    if TRIMMING.swap(true, Ordering::SeqCst) {
        return Ok(TrimReport { removed_files: 0, freed: 0 });
    }
    let r = trim_thumbs_inner(app, max_bytes);
    TRIMMING.store(false, Ordering::SeqCst);
    r
}

fn trim_thumbs_inner(app: &AppHandle, max_bytes: u64) -> Result<TrimReport, String> {
    let thumbs = cache_dir(app)?.join("thumbs");
    let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
    for e in fs::read_dir(&thumbs).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("jpg") {
            continue;
        }
        if let Ok(m) = e.metadata() {
            if !m.is_file() {
                continue;
            }
            let t = match (m.accessed().ok(), m.modified().ok()) {
                (Some(a), Some(b)) => a.max(b),
                (Some(a), None) => a,
                (None, Some(b)) => b,
                _ => std::time::UNIX_EPOCH,
            };
            files.push((p, m.len(), t));
        }
    }

    let mut total: u64 = files.iter().map(|f| f.1).sum();
    let mut report = TrimReport { removed_files: 0, freed: 0 };

    if total > max_bytes {
        files.sort_by_key(|f| f.2); // paling lama dulu
        for (p, size, _) in files {
            if total <= max_bytes {
                break;
            }
            if p.starts_with(&thumbs) && fs::remove_file(&p).is_ok() {
                total = total.saturating_sub(size);
                report.removed_files += 1;
                report.freed += size;
            }
        }
        // Buang entri index yang thumbnail-nya sudah hilang.
        let mut index = load_index(app);
        let before = index.len();
        index.retain(|k, _| thumb_path(app, k).map(|t| t.exists()).unwrap_or(false));
        if index.len() != before {
            let _ = save_index(app, &index);
        }
    }

    // File sementara sips (>1 jam) di temp dir.
    let tmp = std::env::temp_dir().join("selecta-preview");
    if let Ok(rd) = fs::read_dir(&tmp) {
        for e in rd.flatten() {
            let old = e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .map(|d| d.as_secs() > 3600)
                .unwrap_or(false);
            if old {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    Ok(report)
}
