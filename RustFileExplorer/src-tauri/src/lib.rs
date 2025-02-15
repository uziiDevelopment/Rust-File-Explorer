// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::{Path, PathBuf};
use std::fs;

#[derive(serde::Serialize)]
pub struct DriveInfo {
    path: String,
    name: String,
}

#[derive(serde::Serialize)]
pub struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
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
fn list_directory_contents(path: &str) -> Result<Vec<FileInfo>, String> {
    let dir = fs::read_dir(path).map_err(|e| e.to_string())?;
    
    let mut contents: Vec<FileInfo> = Vec::new();
    
    for entry in dir {
        if let Ok(entry) = entry {
            let path_buf = entry.path();
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

#[tauri::command]
fn search_files(start_path: &str, query: &str) -> Result<Vec<FileInfo>, String> {
    let mut results = Vec::new();
    
    // Handle root path search errors gracefully
    if let Err(e) = search_directory(Path::new(start_path), query, &mut results) {
        eprintln!("Error searching directory {}: {}", start_path, e);
        return Ok(results); // Return any results we found before the error
    }
    
    // Sort results the same way as directory listings
    results.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(results)
}

fn search_directory(dir: &Path, query: &str, results: &mut Vec<FileInfo>) -> Result<(), String> {
    if !dir.exists() || !dir.is_dir() {
        return Ok(());
    }

    let read_dir = match fs::read_dir(dir) {
        Ok(dir) => dir,
        Err(e) => {
            // Skip directories we can't access instead of failing
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                return Ok(());
            }
            return Err(e.to_string());
        }
    };

    for entry in read_dir {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Skip files we can't access
            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            
            // Check if the name matches the query (case-insensitive)
            if name.to_lowercase().contains(&query.to_lowercase()) {
                results.push(FileInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                    size: if metadata.is_file() { metadata.len() } else { 0 },
                });
            }
            
            // Recursively search subdirectories if we have access
            if metadata.is_dir() {
                let _ = search_directory(&path, query, results); // Ignore errors from subdirectories
            }
        }
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
            search_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
