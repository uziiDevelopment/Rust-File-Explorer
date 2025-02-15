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
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function getFileIcon(file: FileInfo): string {
  if (file.is_dir) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
    </svg>`;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M16 13H8"/>
        <path d="M16 17H8"/>
        <path d="M10 9H8"/>
      </svg>`;
    
    case 'doc':
    case 'docx':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M16 13H8"/>
        <path d="M16 17H8"/>
        <path d="M10 9H8"/>
      </svg>`;
    
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>`;
    
    case 'mp4':
    case 'mov':
    case 'avi':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <path d="M10 8l6 4-6 4V8z"/>
      </svg>`;
    
    default:
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>`;
  }
}

function renderFileItem(file: FileInfo): string {
  const icon = getFileIcon(file);
  const size = formatFileSize(file.size);
  
  return `
    <div class="file-item" data-path="${file.path}">
      <div class="file-icon">
        ${icon}
      </div>
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-meta">${size}</div>
      </div>
    </div>
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
    
    // Score each result based on how well it matches
    const scoredResults = contents.map(file => {
      const fileName = file.name;
      const lowerFileName = fileName.toLowerCase();
      const lowerQuery = query.toLowerCase();
      let score = 0;
      
      // Exact match gets highest score
      if (fileName === query) {
        score = 100;
      }
      // Case-insensitive exact match
      else if (lowerFileName === lowerQuery) {
        score = 95;
      }
      // Starts with query (case-sensitive)
      else if (fileName.startsWith(query)) {
        score = 90;
      }
      // Starts with query (case-insensitive)
      else if (lowerFileName.startsWith(lowerQuery)) {
        score = 85;
      }
      // Contains query as word (case-sensitive)
      else if (new RegExp(`\\b${escapeRegExp(query)}\\b`).test(fileName)) {
        score = 80;
      }
      // Contains query as word (case-insensitive)
      else if (new RegExp(`\\b${escapeRegExp(lowerQuery)}\\b`, 'i').test(fileName)) {
        score = 75;
      }
      // Contains query (case-sensitive)
      else if (fileName.includes(query)) {
        score = 70;
      }
      // Contains query (case-insensitive)
      else if (lowerFileName.includes(lowerQuery)) {
        score = 65;
      }
      // Contains all words in any order (case-insensitive)
      else {
        const queryWords = lowerQuery.split(/\s+/);
        const allWordsFound = queryWords.every(word => lowerFileName.includes(word));
        if (allWordsFound) {
          score = 60;
        }
      }
      
      // Boost score for files vs directories based on query
      if (score > 0) {
        // If query has an extension, boost files with that extension
        if (query.includes('.') && file.name.toLowerCase().endsWith(lowerQuery)) {
          score += 20;
        }
        // If query is uppercase, boost exact case matches
        if (query.toUpperCase() === query && file.name.includes(query)) {
          score += 15;
        }
      }
      
      return { file, score };
    }).filter(item => item.score > 0);
    
    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);
    
    let results = scoredResults.map(item => item.file);
    
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

// Helper function to escape special characters in string for RegExp
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function quickSearch(query: string) {
  const searchStatusElement = document.querySelector("#search-status");
  
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
      .map(renderFileItem)
      .join("");

    // Add click event listeners to directory items
    const items = directoryContentsElement.querySelectorAll(".file-item");
    items.forEach((item) => {
      item.addEventListener("click", async () => {
        const path = item.getAttribute("data-path");
        const file = files.find(file => file.path === path);
        if (file) {
          handleFileClick(file);
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

// Add view toggle functionality
let isGridView = true;
const viewGridButton = document.querySelector('#view-grid');
const viewListButton = document.querySelector('#view-list');
const directoryContents = document.querySelector('#directory-contents');

viewGridButton?.addEventListener('click', () => {
  isGridView = true;
  directoryContents?.classList.add('grid-view');
  viewGridButton.classList.add('active');
  viewListButton?.classList.remove('active');
});

viewListButton?.addEventListener('click', () => {
  isGridView = false;
  directoryContents?.classList.remove('grid-view');
  viewListButton.classList.add('active');
  viewGridButton?.classList.remove('active');
});

function handleFileClick(file: FileInfo) {
  if (file.is_dir) {
    currentPath = file.path;
    loadDirectoryContents(file.path);
  }
}
