"use client";

import React, { useState, useCallback, useEffect } from "react";
// Updated import for the official PGlite React hook
import { usePGlite } from "@electric-sql/pglite-react";

interface PGliteOpfsManagerProps {
  dataDir: string;
  className?: string;
}

interface TableInfo {
  tableName: string;
  rowCount: number;
  columnCount: number;
  createdAt: string;
  fileSize?: number;
}

export function PGliteOpfsManager({ dataDir, className }: PGliteOpfsManagerProps) {
  // Use the official PGlite hook. It returns the db instance or null.
  const db = usePGlite();
  // isLoading, isReady, dbError, reinitializeInstance are no longer available from this hook.
  // The OfficialPGliteProviderWrapper handles initial loading.

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null); // Local error state for this component's operations

  const refreshTables = useCallback(async () => {
    if (!db) { // Check if db instance is available
      setError("Database not available for refreshing tables.");
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      // Get all user tables (excluding system tables)
      const tablesResult = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'csv_metadata'
        ORDER BY table_name;
      `);

      const tableInfos: TableInfo[] = [];

      for (const row of tablesResult.rows) {
        const tableName = (row as { table_name: string }).table_name;
        
        try {
          // Get row count
          const countResult = await db.query(`SELECT COUNT(*) as count FROM "${tableName}";`);
          const rowCount = Number((countResult.rows[0] as { count: number })?.count) || 0;

          // Get column count
          const columnsResult = await db.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.columns 
            WHERE table_name = $1;
          `, [tableName]);
          const columnCount = Number((columnsResult.rows[0] as { count: number })?.count) || 0;

          // Try to get metadata if available
          let createdAt = 'Unknown';
          let fileSize = undefined;
          
          try {
            const metadataResult = await db.query(`
              SELECT created_at, file_size_bytes 
              FROM csv_metadata 
              WHERE table_name = $1;
            `, [tableName]);
            
            if (metadataResult.rows.length > 0) {
              const metadata = metadataResult.rows[0] as { created_at: string; file_size_bytes?: number };
              createdAt = new Date(metadata.created_at).toLocaleString();
              fileSize = metadata.file_size_bytes;
            }
          } catch {
            // Metadata table might not exist or table might not be in metadata
          }

          tableInfos.push({
            tableName,
            rowCount,
            columnCount,
            createdAt,
            fileSize
          });
        } catch (tableError) {
          console.warn(`Error getting info for table ${tableName}:`, tableError);
        }
      }

      setTables(tableInfos);
    } catch (err) {
      console.error("Error refreshing tables:", err);
      setError(`Failed to refresh tables: ${(err as Error).message}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [db]); // Removed isReady from dependencies

  const deleteTable = useCallback(async (tableName: string) => {
    if (!db) { // Check if db instance is available
      setError("Database not available for deleting table.");
      return;
    }

    if (!confirm(`Are you sure you want to delete table "${tableName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      
      // Delete from metadata table first (if exists)
      try {
        await db.query(`DELETE FROM csv_metadata WHERE table_name = $1;`, [tableName]);
      } catch {
        // Metadata table might not exist
      }
      
      // Drop the actual table
      await db.query(`DROP TABLE IF EXISTS "${tableName}";`);
      
      // Refresh the table list
      await refreshTables();
    } catch (err) {
      console.error(`Error deleting table ${tableName}:`, err);
      setError(`Failed to delete table: ${(err as Error).message}`);
    }
  }, [db, refreshTables]); // Removed isReady from dependencies

  const clearAllTables = useCallback(async () => {
    if (!db) { // Check if db instance is available
      setError("Database not available for clearing tables.");
      return;
    }

    if (!confirm("Are you sure you want to delete ALL tables? This action cannot be undone.")) {
      return;
    }

    try {
      setError(null);
      
      // Get all user tables
      const tablesResult = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'csv_metadata';
      `);

      // Drop each table in a transaction
      await db.transaction(async (tx) => {
        for (const row of tablesResult.rows) {
          const tableName = (row as { table_name: string }).table_name;
          await tx.query(`DROP TABLE IF EXISTS "${tableName}";`);
        }
        
        // Clear metadata table
        try {
          await tx.query(`TRUNCATE TABLE csv_metadata;`);
        } catch {
          // Metadata table might not exist
        }
      });

      await refreshTables();
    } catch (err) {
      console.error("Error clearing all tables:", err);
      setError(`Failed to clear all tables: ${(err as Error).message}`);
    }
  }, [db, refreshTables]); // Removed isReady from dependencies

  // reinitializeDatabase functionality is removed as reinitializeInstance is not available.

  // Auto-refresh tables when database instance becomes available or on mount
  useEffect(() => {
    if (db && !isRefreshing) { // Check if db is available
      refreshTables();
    }
  }, [db, refreshTables, isRefreshing]); // Added db to dependencies

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700 ${className || ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            PGLite Database Manager
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage tables in your PGLite database stored in IndexedDB
          </p>
        </div>
        <button
          onClick={refreshTables}
          disabled={!db || isRefreshing} // Check !db instead of isLoading/!isReady
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
        >
          {isRefreshing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <span>🔄</span>
          )}
          <span>Refresh</span>
        </button>
      </div>

      {/* Database Status */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            {/* Simplified status based on `db` instance availability */}
            <span className={`font-medium ${db ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
              {db ? 'Ready' : 'Initializing...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Storage:</span>
            <span className="text-gray-900 dark:text-white font-medium">IndexedDB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Tables:</span>
            <span className="text-gray-900 dark:text-white font-medium">{tables.length}</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
          {dataDir}
        </div>
      </div>

      {/* Error Display */}
      {(error || dbError) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">
            {error} {/* Display only local errors; dbError is not available from the hook */}
          </p>
        </div>
      )}

      {/* Tables List */}
      {tables.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">No tables found</p>
          <p className="text-sm">Process some CSV files to see tables here</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Table Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Columns
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {tables.map((table) => (
                  <tr key={table.tableName} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {table.tableName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {table.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {table.columnCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {table.createdAt}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatFileSize(table.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => deleteTable(table.tableName)}
                      disabled={!db} // Check !db
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title={`Delete table ${table.tableName}`}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bulk Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={clearAllTables}
              disabled={!isReady || tables.length === 0}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clear All Tables
            </button>
            <button
              onClick={reinitializeDatabase}
              disabled={!isReady}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reinitialize Database
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
