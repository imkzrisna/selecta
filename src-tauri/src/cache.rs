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
    pub sessions: u64,
    pub export_logs: u64,
}

pub fn size_report(app: &AppHandle) -> Result<CacheSizeReport, String> {
    let root = cache_dir(app)?;
    Ok(CacheSizeReport {
        total: dir_size(&root),
        thumbs: dir_size(&root.join("thumbs")),
        full: dir_size(&root.join("full")),
        sessions: dir_size(&root.join("sessions")),
        export_logs: dir_size(&root.join("export-logs")),
    })
}
