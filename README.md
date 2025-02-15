# Rust File Explorer

A basic file explorer built with Rust and Tauri. Uses TypeScript, HTML and CSS for the front-end. Built this project to learn Rust and it was done in under three hours so it is in no way completed, it is faster than windows file explorer though. Download it do whatever you want with it. Cheers -- uzii

## Features

- 🚀 Lightning-fast file indexing and search
- 📂 Dual view modes (Grid and List)
- 🔍 Quick search with configurable depth
- 🎨 Modern, responsive UI
- 🛠️ Customizable search settings
- 📱 Cross-platform support
- 🖥️ Native performance with Rust backend

## Technology Stack

### Backend
- **Rust**: Powers the core file system operations
- **Tauri**: Provides the native bridge between Rust and web technologies
- **tokio**: Handles asynchronous operations
- **walkdir**: Efficient directory traversal
- **serde**: Serialization/deserialization of data

### Frontend
- **TypeScript**: Type-safe frontend logic
- **HTML/CSS**: Modern, responsive UI
- **Custom Components**: Hand-crafted UI elements for optimal performance

## Setup and Installation

1. **Prerequisites**
   ```bash
   # Install Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # Install Node.js (16.0 or higher)
   # Windows: Download from https://nodejs.org/

   # Install Tauri CLI
   cargo install tauri-cli
   ```

2. **Development Setup**
   ```bash
   # Clone the repository
   git clone https://github.com/uziiDevelopment/Rust-File-Explorer.git
   cd Rust-File-Explorer

   # Install dependencies
   npm install

   # Run in development mode
   cargo tauri dev
   ```

3. **Building for Production**
   ```bash
   cargo tauri build
   ```

## Architecture

### File Indexing and Search Logic

The application uses a hybrid Rust/TypeScript approach for file operations:

1. **Drive Detection**
   - Rust backend detects available drives using Windows-specific APIs
   - Simple drive letter iteration (A-Z) with existence check

2. **File Indexing**
   - Directory contents are loaded on-demand
   - Files are sorted with directories first, then alphabetically
   - Basic metadata (name, path, size, type) is cached per directory

3. **Search Implementation**
   - Quick search with configurable depth (0-5 levels)
   - Smart scoring system for search results:
     - Exact matches
     - Case-sensitive/insensitive matches
     - Word boundary matches
     - Partial matches
   - Debounced search input
   - Configurable maximum results limit

4. **Performance Features**
   - Efficient file listing using Rust's fs module
   - Optional hidden file filtering
   - File size formatting
   - Basic file type detection for icons

## Configuration

The application provides several configurable options:

- **Quick Search Depth**: Control how deep the search goes (0-5 levels)
- **Max Results**: Limit the number of search results (100-10000)
- **Hidden Files**: Toggle visibility of hidden files
- **Debounce Time**: Adjust search responsiveness (50-1000ms)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

Developed by [uzii](mailto:uzii@imperiuminteractive.com)

## Support

For support, email uzii@imperiuminteractive.com or open an issue in the repository.
