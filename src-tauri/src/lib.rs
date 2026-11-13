use serde::{Deserialize, Serialize};
mod cache;

// Batasi jumlah sips/generate preview yang jalan BERSAMAAN.
// Current-photo request tidak lewat semaphore ini (prioritas tinggi),
// tapi prefetch (foto di belakang) wajib antre lewat semaphore supaya
// tidak menyaturasi thread pool dan bikin request current ikut ngantre.
static PREVIEW_SEMAPHORE: std::sync::OnceLock<std::sync::Arc<std::sync::atomic::AtomicUsize>> =
    std::sync::OnceLock::new();
const MAX_CONCURRENT_PREFETCH: usize = 2;

struct PrefetchGuard;
impl Drop for PrefetchGuard {
    fn drop(&mut self) {
        release_prefetch_slot();
    }
}
fn scopeguard_release() -> PrefetchGuard {
    PrefetchGuard
}

fn acquire_prefetch_slot() -> bool {
    let sem = PREVIEW_SEMAPHORE.get_or_init(|| std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0)));
    let current = sem.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if current >= MAX_CONCURRENT_PREFETCH {
        sem.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        false
    } else {
        true
    }
}

fn release_prefetch_slot() {
    if let Some(sem) = PREVIEW_SEMAPHORE.get() {
        sem.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}
use cache::{CacheIndex, PREVIEW_VERSION};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use base64::{engine::general_purpose, Engine as _};

#[derive(Serialize, Clone)]
struct PhotoEntry {
    path: String,
    name: String,
    kind: String, // "image" | "pdf" | "video"
}

const RAW_HEIC_EXT: &[&str] = &[
    "heic", "heif", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "raf",
];
const STANDARD_EXT: &[&str] = &["jpg", "jpeg", "png", "tiff", "tif", "bmp"];
const PDF_EXT: &[&str] = &["pdf"];
const VIDEO_EXT: &[&str] = &["mp4", "mov", "m4v", "avi", "mkv", "webm"];

fn kind_for_ext(ext: &str) -> Option<&'static str> {
    if STANDARD_EXT.contains(&ext) || RAW_HEIC_EXT.contains(&ext) {
        Some("image")
    } else if PDF_EXT.contains(&ext) {
        Some("pdf")
    } else if VIDEO_EXT.contains(&ext) {
        Some("video")
    } else {
        None
    }
}

// 1. List semua foto + PDF + video di folder yang dipilih
#[tauri::command]
fn list_photos(folder: String) -> Result<Vec<PhotoEntry>, String> {
    let mut entries: Vec<PhotoEntry> = Vec::new();
    let dir = Path::new(&folder);

    if !dir.is_dir() {
        return Err("Folder tidak valid".into());
    }

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if let Some(kind) = kind_for_ext(&ext_lower) {
                    entries.push(PhotoEntry {
                        path: path.to_string_lossy().to_string(),
                        name: path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        kind: kind.to_string(),
                    });
                }
            }
        }
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[derive(Serialize, Clone)]
struct MediaIndexEntry {
    path: String,
    name: String,
    kind: String,
    size: u64,
    modified: u64,
    // true jika sudah ada entry cache valid untuk file ini (size, modified,
    // dan preview_version cocok). STEP 3 hanya MENANDAI ini — belum
    // men-generate preview untuk yang false (itu tugas STEP 5).
    cached: bool,
}

// Scan folder + tandai per-file apakah preview-nya sudah valid di cache
// disk. Tidak men-generate apa pun di sini — murni membaca metadata file
// dan membandingkan dengan index.json yang ada.
#[tauri::command]
fn scan_media(folder: String, app: AppHandle) -> Result<Vec<MediaIndexEntry>, String> {
    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err("Folder tidak valid".into());
    }

    let index: CacheIndex = cache::load_index(&app);
    let mut entries: Vec<MediaIndexEntry> = Vec::new();

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        let kind = match kind_for_ext(&ext) {
            Some(k) => k,
            None => continue,
        };

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let size = metadata.len();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let path_str = path.to_string_lossy().to_string();
        let cached = index
            .get(&path_str)
            .map(|e| {
                e.size == size && e.modified == modified && e.preview_version == PREVIEW_VERSION
            })
            .unwrap_or(false);

        entries.push(MediaIndexEntry {
            path: path_str,
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            kind: kind.to_string(),
            size,
            modified,
            cached,
        });
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

// 2. Generate preview base64 JPG.
//    PDF dan video TIDAK direct render di sini — itu tugas PdfViewer /
//    VideoViewer di frontend (pdfjs-dist / convertFileSrc). Fungsi ini
//    mengembalikan error khusus supaya App.tsx skip stack-preview untuk
//    keduanya dan biarkan komponen viewer masing-masing yang menangani.
#[tauri::command]
fn get_preview(path: String, app: AppHandle, is_prefetch: Option<bool>) -> Result<String, String> {
    // Kalau ini prefetch (bukan foto current), antre lewat semaphore.
    // Retry singkat dengan backoff kecil -- kalau tetap penuh, biarkan
    // request ini gagal-lembut supaya tidak numpuk; frontend akan
    // retry sendiri di render berikutnya (index berubah lagi).
    let is_prefetch = is_prefetch.unwrap_or(false);
    if is_prefetch {
        let mut tries = 0;
        while !acquire_prefetch_slot() {
            tries += 1;
            if tries > 20 {
                return Err("prefetch-slot-busy".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
    }
    let _guard = is_prefetch.then(|| scopeguard_release());

    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if PDF_EXT.contains(&ext.as_str()) {
        return Err("PDF_PREVIEW_UNSUPPORTED".into());
    }

    if VIDEO_EXT.contains(&ext.as_str()) {
        return Err("VIDEO_PREVIEW_UNSUPPORTED".into());
    }

    // --- Metadata file saat ini, dipakai untuk validasi cache ---
    let metadata = fs::metadata(p).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let modified = metadata
        .modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // --- Cek disk cache dulu sebelum generate ulang ---
    let index = cache::load_index(&app);
    if let Some(entry) = index.get(&path) {
        if entry.size == size
            && entry.modified == modified
            && entry.preview_version == PREVIEW_VERSION
        {
            if let Ok(thumb) = cache::thumb_path(&app, &path) {
                if let Ok(bytes) = fs::read(&thumb) {
                    let b64 = general_purpose::STANDARD.encode(bytes);
                    return Ok(format!("data:image/jpeg;base64,{}", b64));
                }
                // Index bilang valid tapi file thumbnail hilang (mis.
                // dihapus manual) -> jangan error, jatuh ke generate ulang.
            }
        }
    }

    // --- Cache miss / invalid: generate preview ---
    // Semua ekstensi (termasuk JPG) lewat sips: resize + kompresi ke JPG.
    // Input asli TIDAK PERNAH ditimpa -- sips selalu menulis ke --out (file temp).
    let tmp_dir = std::env::temp_dir().join("photo-culler-preview");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    let file_stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("preview");
    let out_path = tmp_dir.join(format!("{}.jpg", file_stem));

    // -Z 2048          -> resize proporsional, sisi terpanjang max 2048px
    // -s formatOptions -> kompresi JPEG 80% (cukup tajam untuk culling)
    let output = Command::new("sips")
        .args([
            "-Z",
            "2048",
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            "80",
            path.as_str(),
            "--out",
            out_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan sips: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "sips gagal convert: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let bytes: Vec<u8> = fs::read(&out_path).map_err(|e| e.to_string())?;

    // --- Simpan ke disk cache + update index. Best-effort: kalau gagal,
    // preview tetap dikembalikan seperti biasa (caching = optimisasi,
    // bukan syarat fitur jalan). ---
    if let Ok(thumb) = cache::thumb_path(&app, &path) {
        if fs::write(&thumb, &bytes).is_ok() {
            let mut index = index;
            index.insert(
                path.clone(),
                cache::CacheEntry {
                    hash: cache::hash_path(&path),
                    size,
                    modified,
                    preview_version: PREVIEW_VERSION,
                    kind: "image".to_string(),
                },
            );
            let _ = cache::save_index(&app, &index);
        }
    }

    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

// App GUI macOS tidak mewarisi PATH shell, jadi cari ffmpeg di lokasi umum.
fn ffmpeg_bin() -> String {
    for c in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ] {
        if Path::new(c).exists() {
            return c.to_string();
        }
    }
    "ffmpeg".to_string()
}

// 2b. Generate thumbnail JPG dari video pakai ffmpeg (ambil 1 frame).
//     Beda dari get_preview: ini khusus video, dan mengembalikan error
//     yang jelas kalau ffmpeg tidak ada di sistem, supaya frontend bisa
//     fallback ke ikon generik tanpa nge-hang.
#[tauri::command]
fn get_video_thumbnail(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !VIDEO_EXT.contains(&ext.as_str()) {
        return Err("Bukan file video".into());
    }

    let tmp_dir = std::env::temp_dir().join("photo-culler-video-thumb");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    let file_stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("thumb");
    let out_path = tmp_dir.join(format!("{}.jpg", file_stem));

    // Ambil 1 frame di detik ke-1 (fallback ke frame pertama kalau video
    // lebih pendek dari itu — ffmpeg otomatis clamp ke durasi video).
    let output = Command::new(ffmpeg_bin())
        .args([
            "-y",
            "-ss", "1",
            "-i", path.as_str(),
            "-frames:v", "1",
            "-vf", "scale='min(1280,iw)':-2",
            "-q:v", "3",
            out_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan ffmpeg (apakah sudah terinstall?): {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg gagal membuat thumbnail: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let bytes = fs::read(&out_path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

// 3. Pindahkan (move) foto/PDF/video yang dipilih ke folder tujuan
#[tauri::command]
fn move_photo(
    source: String,
    dest_folder: String,
    new_name: Option<String>,
) -> Result<String, String> {
    let src = Path::new(&source);
    let dest_dir = Path::new(&dest_folder);

    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    }

    let orig_name = src
        .file_name()
        .ok_or_else(|| "Nama file tidak valid".to_string())?
        .to_string_lossy()
        .to_string();
    let chosen = match new_name.as_deref().map(str::trim) {
        Some(n) if !n.is_empty() => {
            if n.contains('/') || n.contains('\\') || n == "." || n == ".." {
                return Err("Nama file tidak valid".into());
            }
            n.to_string()
        }
        _ => orig_name,
    };
    let chosen_path = Path::new(&chosen);
    let stem = chosen_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = chosen_path
        .extension()
        .map(|e| e.to_string_lossy().to_string());
    let dest_path = dest_dir.join(&chosen);

    let final_dest = if dest_path.exists() {
        let mut counter = 1;
        loop {
            let candidate_name = match &ext {
                Some(e) => format!("{}_{}.{}", stem, counter, e),
                None => format!("{}_{}", stem, counter),
            };
            let candidate = dest_dir.join(candidate_name);
            if !candidate.exists() {
                break candidate;
            }
            counter += 1;
        }
    } else {
        dest_path
    };

    fs::rename(src, &final_dest).map_err(|e| e.to_string())?;
    Ok(final_dest.to_string_lossy().to_string())
}

// 4. Export: salin / konversi JPG / bungkus ZIP ke folder tujuan.
#[derive(Deserialize)]
struct ExportItem {
    path: String,
    name: String,
}

#[derive(Serialize)]
struct ExportResult {
    output: String,
    ok: usize,
    failed: Vec<String>,
}

fn split_name(name: &str) -> (String, Option<String>) {
    let p = Path::new(name);
    (
        p.file_stem().unwrap_or_default().to_string_lossy().to_string(),
        p.extension().map(|e| e.to_string_lossy().to_string()),
    )
}

fn numbered(stem: &str, ext: &Option<String>, i: u32) -> String {
    match ext {
        Some(e) => format!("{}_{}.{}", stem, i, e),
        None => format!("{}_{}", stem, i),
    }
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = split_name(name);
    let mut i = 1;
    loop {
        let c = dir.join(numbered(&stem, &ext, i));
        if !c.exists() {
            return c;
        }
        i += 1;
    }
}

fn unique_entry(used: &mut std::collections::HashSet<String>, name: &str) -> String {
    let mut candidate = name.to_string();
    let (stem, ext) = split_name(name);
    let mut i = 1;
    while used.contains(&candidate) {
        candidate = numbered(&stem, &ext, i);
        i += 1;
    }
    used.insert(candidate.clone());
    candidate
}

fn safe_component(s: &str) -> Result<String, String> {
    let t = s.trim();
    if t.is_empty() || t.contains('/') || t.contains('\\') || t == "." || t == ".." {
        return Err("Nama tidak valid".into());
    }
    Ok(t.to_string())
}

// Pindahkan file: rename; kalau beda disk, salin lalu hapus yang lama.
fn move_file(src: &str, dst: &Path) -> Result<(), String> {
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    fs::copy(src, dst).map_err(|e| e.to_string())?;
    fs::remove_file(src).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_files(
    items: Vec<ExportItem>,
    dest_folder: String,
    new_folder: Option<String>,
    mode: String,
    zip_name: Option<String>,
) -> Result<ExportResult, String> {
    let mut target = PathBuf::from(&dest_folder);
    if let Some(f) = new_folder.as_deref() {
        if !f.trim().is_empty() {
            target = target.join(safe_component(f)?);
        }
    }
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    let mut failed: Vec<String> = Vec::new();
    let mut ok = 0usize;
    let output: String;

    if mode == "zip" {
        let base = match zip_name.as_deref().map(str::trim) {
            Some(n) if !n.is_empty() => safe_component(n)?,
            _ => "Selecta-export".to_string(),
        };
        let file_name = if base.to_lowercase().ends_with(".zip") {
            base
        } else {
            format!("{}.zip", base)
        };
        let zip_path = unique_path(&target, &file_name);
        let file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut zipped: Vec<String> = Vec::new();
        for it in &items {
            let res: Result<(), String> = (|| {
                let entry = unique_entry(&mut used, &it.name);
                writer.start_file(entry, opts).map_err(|e| e.to_string())?;
                let mut f = fs::File::open(&it.path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut writer).map_err(|e| e.to_string())?;
                Ok(())
            })();
            match res {
                Ok(()) => {
                    ok += 1;
                    zipped.push(it.path.clone());
                }
                Err(e) => failed.push(format!("{}: {}", it.name, e)),
            }
        }
        writer.finish().map_err(|e| e.to_string())?;
        // ZIP sudah jadi: hapus file asli (konsep pindah).
        for src in &zipped {
            if let Err(e) = fs::remove_file(src) {
                failed.push(format!("{}: gagal menghapus asli: {}", src, e));
            }
        }
        output = zip_path.to_string_lossy().to_string();
    } else {
        for it in &items {
            let res: Result<(), String> = (|| {
                let ext = Path::new(&it.path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let is_image = kind_for_ext(&ext) == Some("image");
                if mode == "jpg" && is_image && ext != "jpg" && ext != "jpeg" {
                    let (stem, _) = split_name(&it.name);
                    let out = unique_path(&target, &format!("{}.jpg", stem));
                    let output = Command::new("sips")
                        .args(["-s", "format", "jpeg", "-s", "formatOptions", "92"])
                        .arg(&it.path)
                        .arg("--out")
                        .arg(&out)
                        .output()
                        .map_err(|e| format!("Gagal menjalankan sips: {}", e))?;
                    if !output.status.success() {
                        return Err(String::from_utf8_lossy(&output.stderr).to_string());
                    }
                    fs::remove_file(&it.path).map_err(|e| e.to_string())?;
                } else {
                    let out = unique_path(&target, &it.name);
                    move_file(&it.path, &out)?;
                }
                Ok(())
            })();
            match res {
                Ok(()) => ok += 1,
                Err(e) => failed.push(format!("{}: {}", it.name, e)),
            }
        }
        output = target.to_string_lossy().to_string();
    }

    Ok(ExportResult { output, ok, failed })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_photos,
            get_preview,
            get_video_thumbnail,
            move_photo,
            scan_media,
            export_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
