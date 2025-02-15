import { invoke } from "@tauri-apps/api/core";

interface DriveInfo {
  path: string;
  name: string;
}

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(isDirectory: boolean): string {
  if (isDirectory) {
    return `
      <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    `;
  }
  return `
    <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M13 2v7h7" />
    </svg>
  `;
}

async function loadDrives() {
  try {
    const drives: DriveInfo[] = await invoke("get_drives");
    const drivesListElement = document.querySelector("#drives-list");
    
    if (drivesListElement) {
      drivesListElement.innerHTML = drives
        .map(
          (drive) => `
          <div class="drive-item" data-path="${drive.path}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18v12H3z"/>
              <path d="M3 14h18"/>
              <circle cx="8" cy="17" r="1"/>
            </svg>
            <div class="drive-name">${drive.name}</div>
          </div>
        `
        )
        .join("");
        
      // Add click event listeners to drive items
      document.querySelectorAll(".drive-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const path = item.getAttribute("data-path");
          if (path) {
            await loadDirectoryContents(path);
          }
        });
      });
    }
  } catch (error) {
    console.error("Error loading drives:", error);
  }
}

let currentPath: string = '';
let isSearching: boolean = false;

async function searchFiles(query: string) {
  if (!currentPath || query.trim().length === 0) return;
  
  const searchStatusElement = document.querySelector("#search-status");
  const directoryContentsElement = document.querySelector("#directory-contents");
  
  try {
    isSearching = true;
    if (searchStatusElement) {
      searchStatusElement.textContent = "Searching...";
    }
    if (directoryContentsElement) {
      directoryContentsElement.classList.add("searching");
    }
    
    const results: FileInfo[] = await invoke("search_files", { 
      startPath: currentPath,
      query: query.trim()
    });
    
    if (searchStatusElement) {
      searchStatusElement.textContent = `Found ${results.length} results for "${query}"`;
    }
    
    if (directoryContentsElement) {
      directoryContentsElement.innerHTML = `
        <div class="file-list">
          ${results
            .map(
              (item) => `
              <div class="file-item" data-path="${item.path}" data-is-dir="${item.is_dir}">
                ${getFileIcon(item.is_dir)}
                <div class="file-info">
                  <span class="file-name">${item.name}</span>
                  ${!item.is_dir ? `<span class="file-size">${formatFileSize(item.size)}</span>` : ''}
                </div>
              </div>
            `
            )
            .join("")}
        </div>
      `;
      
      // Add click event listeners to directory items
      document.querySelectorAll(".file-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const itemPath = item.getAttribute("data-path");
          const isDir = item.getAttribute("data-is-dir") === "true";
          
          if (itemPath && isDir) {
            await loadDirectoryContents(itemPath);
          }
        });
      });
    }
  } catch (error) {
    if (searchStatusElement) {
      searchStatusElement.textContent = `Error searching: ${error}`;
    }
    console.error("Error searching files:", error);
  } finally {
    isSearching = false;
    if (directoryContentsElement) {
      directoryContentsElement.classList.remove("searching");
    }
  }
}

async function loadDirectoryContents(path: string) {
  currentPath = path;
  // Clear search input and status when loading new directory
  const searchInput = document.querySelector("#search-input") as HTMLInputElement;
  const searchStatus = document.querySelector("#search-status");
  if (searchInput) {
    searchInput.value = "";
  }
  if (searchStatus) {
    searchStatus.textContent = "";
  }
  
  try {
    const contents: FileInfo[] = await invoke("list_directory_contents", { path });
    const directoryContentsElement = document.querySelector("#directory-contents");
    const currentPathElement = document.querySelector("#current-path");
    
    if (currentPathElement) {
      currentPathElement.textContent = path;
    }
    
    if (directoryContentsElement) {
      directoryContentsElement.innerHTML = `
        <div class="file-list">
          ${contents
            .map(
              (item) => `
              <div class="file-item" data-path="${item.path}" data-is-dir="${item.is_dir}">
                ${getFileIcon(item.is_dir)}
                <div class="file-info">
                  <span class="file-name">${item.name}</span>
                  ${!item.is_dir ? `<span class="file-size">${formatFileSize(item.size)}</span>` : ''}
                </div>
              </div>
            `
            )
            .join("")}
        </div>
      `;
      
      // Add click event listeners to directory items
      document.querySelectorAll(".file-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const itemPath = item.getAttribute("data-path");
          const isDir = item.getAttribute("data-is-dir") === "true";
          
          if (itemPath && isDir) {
            await loadDirectoryContents(itemPath);
          }
        });
      });
    }
  } catch (error) {
    console.error("Error loading directory contents:", error);
  }
}

// Initialize the application when the DOM is loaded
window.addEventListener("DOMContentLoaded", () => {
  loadDrives();
  
  // Add search event listeners
  const searchInput = document.querySelector("#search-input");
  const searchButton = document.querySelector("#search-button");
  
  let searchDebounceTimeout: number | null = null;
  
  searchInput?.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    
    // Clear previous timeout
    if (searchDebounceTimeout) {
      window.clearTimeout(searchDebounceTimeout);
    }
    
    // Set new timeout to debounce search
    searchDebounceTimeout = window.setTimeout(() => {
      if (!isSearching && input.value.trim().length > 0) {
        searchFiles(input.value);
      }
    }, 500); // Wait 500ms after user stops typing
  });
  
  searchButton?.addEventListener("click", () => {
    const input = document.querySelector("#search-input") as HTMLInputElement;
    if (!isSearching && input?.value.trim().length > 0) {
      searchFiles(input.value);
    }
  });
});
