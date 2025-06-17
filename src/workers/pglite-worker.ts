// PGLite Multi-tab Worker with Enhanced Configuration
import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";

// Initialize PGLite with IndexedDB persistence and optimized settings
worker({
  async init(options) {
    // Create PGLite instance with IndexedDB filesystem
    const pg = new PGlite(options.dataDir || "idb://pglite-csv-processor", {
      debug: process.env.NODE_ENV === 'development' ? 1 : 0,
      // Optimize for CSV processing
      relaxedDurability: true, // Better performance for bulk inserts
    });
    
    // Initialize CSV-specific configurations
    await pg.exec(`
      -- Set optimal configurations for CSV processing
      SET work_mem = '256MB';
      SET shared_preload_libraries = '';
      SET max_wal_size = '1GB';
      SET checkpoint_completion_target = 0.9;
      
      -- Create metadata table if it doesn't exist
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        original_url TEXT NOT NULL,
        file_name TEXT NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        column_count INTEGER NOT NULL DEFAULT 0,
        processing_time_ms INTEGER,
        file_size_bytes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Create index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_table_name ON csv_metadata(table_name);
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_created_at ON csv_metadata(created_at);
    `);
    
    return pg;
  },
});
