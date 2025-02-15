// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use rayon::prelude::*;
use ignore::WalkBuilder;
use parking_lot::Mutex;
use std::time::Instant;

#[derive(serde::Serialize)]
pub struct DriveInfo {
    path: String,
    name: String,
}

#[derive(serde::Serialize, Clone)]
pub struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(serde::Serialize)]
pub struct SearchStats {
    elapsed_ms: u64,
    files_indexed: usize,
    matches_found: usize,
}

#[derive(serde::Serialize)]
pub struct SearchResponse {
    results: Vec<FileInfo>,
    stats: SearchStats,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();
    
    #[cfg(windows)]
    {
        for drive_letter in b'A'..=b'Z' {
            let path = format!("{}:\\", drive_letter as char);
            let path_buf = PathBuf::from(&path);
            
            if path_buf.exists() {
                drives.push(DriveInfo {
                    path: path.clone(),
                    name: format!("Drive ({}:)", drive_letter as char),
                });
            }
        }
    }
    
    drives
}

#[tauri::command]
fn list_directory_contents(path: &str, search_hidden: Option<bool>) -> Result<Vec<FileInfo>, String> {
    let dir = fs::read_dir(path).map_err(|e| e.to_string())?;
    
    let mut contents: Vec<FileInfo> = Vec::new();
    
    for entry in dir {
        if let Ok(entry) = entry {
            let path_buf = entry.path();
            
            // Skip hidden files if search_hidden is false
            if search_hidden.unwrap_or(false) == false {
                if let Some(file_name) = path_buf.file_name() {
                    let name = file_name.to_string_lossy();
                    if name.starts_with(".") {
                        continue;
                    }
                }
            }
            
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            
            contents.push(FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path_buf.to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                size: if metadata.is_file() { metadata.len() } else { 0 },
            });
        }
    }
    
    // Sort directories first, then files
    contents.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(contents)
}

const MAX_RESULTS: usize = 1000; // Limit results to prevent memory issues

#[tauri::command]
fn search_files(start_path: &str, query: &str) -> Result<SearchResponse, String> {
    let start_time = Instant::now();
    let results = Arc::new(Mutex::new(Vec::new()));
    let count = Arc::new(AtomicUsize::new(0));
    let files_indexed = Arc::new(AtomicUsize::new(0));
    let query = query.to_lowercase();

    let walker = WalkBuilder::new(start_path)
        .hidden(true)
        .git_ignore(true)
        .build_parallel();

    walker.run(|| {
        Box::new(|entry| {
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => return ignore::WalkState::Continue,
            };

            // Increment files indexed counter
            files_indexed.fetch_add(1, Ordering::Relaxed);

            // Check if we've hit the result limit
            if count.load(Ordering::Relaxed) >= MAX_RESULTS {
                return ignore::WalkState::Quit;
            }

            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip if the name doesn't match (case-insensitive)
            if !name.to_lowercase().contains(&query) {
                return ignore::WalkState::Continue;
            }

            // Skip files we can't access
            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => return ignore::WalkState::Continue,
            };

            // Add to results if we haven't hit the limit
            if count.fetch_add(1, Ordering::Relaxed) < MAX_RESULTS {
                let mut results = results.lock();
                results.push(FileInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                    size: if metadata.is_file() { metadata.len() } else { 0 },
                });
            }

            ignore::WalkState::Continue
        })
    });

    // Get the final results and sort them
    let mut final_results = results.lock().to_vec();
    
    // Sort results the same way as directory listings
    final_results.par_sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    let stats = SearchStats {
        elapsed_ms: start_time.elapsed().as_millis() as u64,
        files_indexed: files_indexed.load(Ordering::Relaxed),
        matches_found: final_results.len(),
    };

    Ok(SearchResponse {
        results: final_results,
        stats,
    })
}

#[tauri::command]
fn calculate_folder_size(path: &str) -> Result<u64, String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() || !path_buf.is_dir() {
        return Err("Invalid directory path".to_string());
    }

    let mut total_size = 0u64;
    let walker = WalkBuilder::new(path)
        .hidden(true)  // Include hidden files
        .build();

    for entry in walker {
        if let Ok(entry) = entry {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    total_size += metadata.len();
                }
            }
        }
    }

    Ok(total_size)
}

#[tauri::command]
fn open_file(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_drives,
            list_directory_contents,
            search_files,
            calculate_folder_size,
            open_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
