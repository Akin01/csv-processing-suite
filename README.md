# CSV Processing Suite

A modern, clean web application for processing CSV files with multiple processing methods and real-time monitoring capabilities.

## Project Structure

The application has been refactored into a clean, feature-oriented architecture with organized components:

### Features

1. **Advanced CSV Streaming** (`/csv-streaming-advanced`)
   - High-performance streaming CSV processor with advanced configuration options
   - Real-time memory monitoring and performance metrics
   - Configurable batch sizes, throttling, and processing parameters
   - Detailed progress tracking and error handling
   - Optimized for large file processing

2. **DuckDB Processing** (`/duckdb`)
   - Ultra-fast CSV processing using DuckDB-Wasm analytics engine  
   - Automatic gzip decompression and format detection
   - Browser-based SQL analytics capabilities
   - OPFS (Origin Private File System) persistent storage
   - Advanced data querying and manipulation

### Clean Directory Structure

```
src/
├── app/
│   ├── csv-streaming-advanced/  # Advanced streaming feature
│   ├── duckdb/                 # DuckDB processing feature
│   ├── api/                    # API endpoints
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Landing page with feature selection
├── components/
│   ├── processors/             # CSV processing components
│   │   ├── csv-advanced-processor.tsx
│   │   ├── duckdb-csv-processor.tsx
│   │   └── index.ts
│   ├── ui/                     # Reusable UI components
│   │   ├── csv-data-table.tsx
│   │   ├── error-display.tsx
│   │   ├── example-urls.tsx
│   │   ├── memory-monitor.tsx
│   │   ├── opfs-manager.tsx
│   │   ├── progress-display.tsx
│   │   ├── url-input.tsx
│   │   └── index.ts
│   ├── feature-tabs.tsx        # Navigation between features
│   └── index.ts                # Main component exports
├── hooks/
│   └── use-csv-processor.ts    # CSV processing hook
├── lib/
│   ├── data/
│   │   └── test-data.ts        # Test data generator
│   ├── csv-processor.ts        # Core CSV processing logic
│   └── utils.ts                # Utility functions
└── providers/
    └── duckdb-provider.tsx     # DuckDB context provider
```

## Architecture Benefits

1. **Clean Organization**: Components are logically grouped into processors and UI
2. **Feature Separation**: Each processing method is isolated in its own route
3. **Reusable Components**: Shared UI components with consistent naming
4. **Better Imports**: Index files enable clean import statements
5. **Maintainable**: Clear separation of concerns and no unused code
6. **Readable**: Descriptive component and file names
7. **Scalable**: Easy to add new processing methods or features

## Technology Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety and better development experience
- **Tailwind CSS** - Modern utility-first CSS framework
- **PapaParse** - Fast CSV parsing with streaming support
- **DuckDB-Wasm** - High-performance in-browser analytics
- **Streaming APIs** - Memory-efficient processing of large files

## Features

### Navigation
- Clean tabbed interface with feature cards
- Active feature highlighting
- Consistent navigation across all pages

### Processing Capabilities
- **Streaming**: Handle large files without memory issues
- **Real-time Monitoring**: Track progress and memory usage
- **Configurable**: Adjust processing parameters for optimal performance
- **High Performance**: Choose between PapaParse and DuckDB

### User Experience
- Responsive design with dark mode support
- Intuitive feature selection interface
- Clear progress indication and error handling
- Modern, clean UI with consistent styling

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) to view the application

## Development

The codebase follows clean architecture principles:

- **No unused code**: All components and files serve a purpose
- **Consistent naming**: Clear, descriptive names for components and files
- **Organized structure**: Logical grouping of related functionality
- **Type safety**: Full TypeScript support with proper interfaces
- **Modular design**: Components can be easily reused and tested
