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

interface SearchStats {
  elapsed_ms: number;
  files_indexed: number;
  matches_found: number;
}

interface SearchResponse {
  results: FileInfo[];
  stats: SearchStats;
}

interface SearchConfig {
  quickSearchDepth: number;
  maxResults: number;
  searchHidden: boolean;
  debounceMs: number;
}

let searchConfig: SearchConfig = {
  quickSearchDepth: 2,
  maxResults: 1000,
  searchHidden: false,
  debounceMs: 100
};

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
let currentDirectoryFiles: FileInfo[] = [];

async function recursiveQuickSearch(baseDir: string, query: string, depth: number): Promise<FileInfo[]> {
  if (depth < 0) return [];
  
  try {
    const contents: FileInfo[] = await invoke("list_directory_contents", { 
      path: baseDir,
      searchHidden: searchConfig.searchHidden 
    });
    const lowerQuery = query.toLowerCase();
    
    // Score each result based on how well it matches
    const scoredResults = contents.map(file => {
      const lowerName = file.name.toLowerCase();
      let score = 0;
      
      // Exact match gets highest score
      if (lowerName === lowerQuery) {
        score = 100;
      }
      // Starting with query gets high score
      else if (lowerName.startsWith(lowerQuery)) {
        score = 80;
      }
      // Contains full query gets medium score
      else if (lowerName.includes(lowerQuery)) {
        score = 60;
      }
      // Contains all characters in order gets low score
      else {
        let lastIndex = -1;
        let allFound = true;
        for (const char of lowerQuery) {
          const index = lowerName.indexOf(char, lastIndex + 1);
          if (index === -1) {
            allFound = false;
            break;
          }
          lastIndex = index;
        }
        if (allFound) {
          score = 20;
        }
      }
      
      return { file, score };
    }).filter(item => item.score > 0);
    
    let results: FileInfo[] = scoredResults.map(item => item.file);
    
    // Recursively search subdirectories up to the specified depth
    if (depth > 0) {
      for (const file of contents) {
        if (file.is_dir) {
          const subResults = await recursiveQuickSearch(file.path, query, depth - 1);
          results = results.concat(subResults);
          
          // Stop if we've hit the max results
          if (results.length >= searchConfig.maxResults) {
            results = results.slice(0, searchConfig.maxResults);
            break;
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error searching directory ${baseDir}:`, error);
    return [];
  }
}

async function quickSearch(query: string) {
  const searchStatusElement = document.querySelector("#search-status");
  const directoryContentsElement = document.querySelector("#directory-contents");
  
  if (!query.trim()) {
    displayFiles(currentDirectoryFiles);
    if (searchStatusElement) {
      searchStatusElement.textContent = "";
    }
    return;
  }

  const startTime = performance.now();
  const results = await recursiveQuickSearch(currentPath, query, searchConfig.quickSearchDepth);
  const endTime = performance.now();

  if (searchStatusElement) {
    const timeMs = Math.round(endTime - startTime);
    searchStatusElement.textContent = 
      `Quick found ${results.length} matches in ${timeMs}ms (depth: ${searchConfig.quickSearchDepth})`;
  }

  displayFiles(results);
}

function displayFiles(files: FileInfo[]) {
  const directoryContentsElement = document.querySelector("#directory-contents");
  if (directoryContentsElement) {
    directoryContentsElement.innerHTML = files
      .map(
        (file) => `
        <div class="file-item ${file.is_dir ? 'directory' : ''}" data-path="${file.path}">
          ${getFileIcon(file.is_dir)}
          <div class="file-name">${file.name}</div>
          ${!file.is_dir ? `<div class="file-size">${formatFileSize(file.size)}</div>` : ''}
        </div>
      `
      )
      .join("");

    // Add click event listeners to directory items
    document.querySelectorAll(".file-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const path = item.getAttribute("data-path");
        const isDir = item.classList.contains("directory");
        if (path && isDir) {
          await loadDirectoryContents(path);
        }
      });
    });
  }
}

async function loadDirectoryContents(path: string) {
  try {
    currentPath = path;
    const contents: FileInfo[] = await invoke("list_directory_contents", { 
      path,
      searchHidden: searchConfig.searchHidden 
    });
    currentDirectoryFiles = contents;
    displayFiles(contents);
  } catch (error) {
    console.error("Error loading directory contents:", error);
  }
}

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
    
    const response: SearchResponse = await invoke("search_files", { 
      startPath: currentPath,
      query: query.trim()
    });
    
    if (searchStatusElement) {
      const { stats } = response;
      const timeStr = stats.elapsed_ms < 1000 
        ? `${stats.elapsed_ms}ms` 
        : `${(stats.elapsed_ms / 1000).toFixed(2)}s`;
      searchStatusElement.textContent = 
        `Deep found ${stats.matches_found} matches in ${timeStr} (searched ${stats.files_indexed.toLocaleString()} files)`;
    }
    
    displayFiles(response.results);
  } catch (error) {
    console.error("Error searching files:", error);
  } finally {
    isSearching = false;
    if (directoryContentsElement) {
      directoryContentsElement.classList.remove("searching");
    }
  }
}

function toggleConfigPanel() {
  const configPanel = document.querySelector('.config-panel');
  if (configPanel) {
    configPanel.classList.toggle('hidden');
  }
}

function updateConfig() {
  const depthInput = document.querySelector('#quick-search-depth') as HTMLInputElement;
  const maxResultsInput = document.querySelector('#max-results') as HTMLInputElement;
  const searchHiddenInput = document.querySelector('#search-hidden') as HTMLInputElement;
  const debounceInput = document.querySelector('#debounce-time') as HTMLInputElement;

  searchConfig = {
    quickSearchDepth: parseInt(depthInput.value) || 2,
    maxResults: parseInt(maxResultsInput.value) || 1000,
    searchHidden: searchHiddenInput.checked,
    debounceMs: parseInt(debounceInput.value) || 100
  };

  // Save to localStorage
  localStorage.setItem('searchConfig', JSON.stringify(searchConfig));
}

// Initialize the application when the DOM is loaded
window.addEventListener("DOMContentLoaded", () => {
  loadDrives();
  
  // Add search event listeners
  const searchInput = document.querySelector("#search-input");
  const searchButton = document.querySelector("#search-button");
  const configButton = document.querySelector("#config-button");
  const configApplyButton = document.querySelector("#config-apply");
  
  let searchDebounceTimeout: number | null = null;
  
  searchInput?.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    
    // Clear previous timeout
    if (searchDebounceTimeout) {
      window.clearTimeout(searchDebounceTimeout);
    }
    
    // Set new timeout to debounce search
    searchDebounceTimeout = window.setTimeout(() => {
      if (!isSearching) {
        quickSearch(input.value);
      }
    }, searchConfig.debounceMs);
  });
  
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const input = e.target as HTMLInputElement;
      if (!isSearching && input.value.trim().length > 0) {
        searchFiles(input.value);
      }
    }
  });
  
  searchButton?.addEventListener("click", () => {
    const input = document.querySelector("#search-input") as HTMLInputElement;
    if (!isSearching && input?.value.trim().length > 0) {
      searchFiles(input.value);
    }
  });

  // Add configuration panel event listeners
  configButton?.addEventListener("click", () => {
    const configPanel = document.querySelector('.config-panel');
    if (configPanel) {
      configPanel.classList.toggle('hidden');
    }
  });

  // Handle clicking outside the config panel to close it
  document.addEventListener("click", (e) => {
    const configPanel = document.querySelector('.config-panel');
    const configButton = document.querySelector('#config-button');
    const target = e.target as HTMLElement;

    if (configPanel && !configPanel.classList.contains('hidden')) {
      // Check if click is outside both the config panel and config button
      if (!configPanel.contains(target) && !configButton?.contains(target)) {
        configPanel.classList.add('hidden');
      }
    }
  });

  configApplyButton?.addEventListener("click", () => {
    updateConfig();
    const configPanel = document.querySelector('.config-panel');
    if (configPanel) {
      configPanel.classList.add('hidden');
    }
  });

  // Load saved config
  const savedConfig = localStorage.getItem('searchConfig');
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      searchConfig = {
        quickSearchDepth: parsed.quickSearchDepth ?? 2,
        maxResults: parsed.maxResults ?? 1000,
        searchHidden: parsed.searchHidden ?? false,
        debounceMs: parsed.debounceMs ?? 100
      };
    } catch (e) {
      console.error('Error loading saved config:', e);
    }
  }

  // Update config panel with current values
  const depthInput = document.querySelector('#quick-search-depth') as HTMLInputElement;
  const maxResultsInput = document.querySelector('#max-results') as HTMLInputElement;
  const searchHiddenInput = document.querySelector('#search-hidden') as HTMLInputElement;
  const debounceInput = document.querySelector('#debounce-time') as HTMLInputElement;

  if (depthInput) depthInput.value = searchConfig.quickSearchDepth.toString();
  if (maxResultsInput) maxResultsInput.value = searchConfig.maxResults.toString();
  if (searchHiddenInput) searchHiddenInput.checked = searchConfig.searchHidden;
  if (debounceInput) debounceInput.value = searchConfig.debounceMs.toString();
});
