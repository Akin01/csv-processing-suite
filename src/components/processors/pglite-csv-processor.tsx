"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
// Switch to official PGlite hook
import { usePGlite } from "@electric-sql/pglite-react";
// Import getTableNameFromUrl from utils
import { getTableNameFromUrl as getTableNameFromUrlUtil, formatProcessingTime } from "@/lib/utils";
import { CsvStreamProcessor } from "@/lib/csv-stream-processor";
import { createCsvTableSchema, createInsertSql, csvMetadata } from "@/lib/drizzle-schema";
import { eq } from "drizzle-orm";
import { drizzle, PGliteDrizzle } from "drizzle-orm/pglite"; // Import drizzle
// Import useDebounce hook
import { useDebounce } from "@/hooks/useDebounce";
import { UrlInput } from "@/components/ui/url-input";
import { ExampleUrls } from "@/components/ui/example-urls";
import { ProgressDisplay } from "@/components/ui/progress-display";
import { CsvDataTable } from "@/components/ui/csv-data-table";
import { ErrorDisplay } from "@/components/ui/error-display";
import { MemoryMonitor } from "@/components/ui/memory-monitor";
// Removed unused ProcessProgress import comment

interface PgliteCsvProcessorProps {
  className?: string;
  // dataDir and useWorker props are removed as they are handled by the OfficialPGliteProviderWrapper
}

interface CsvData {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  totalRows: number;
}

interface TableState {
  searchTerm: string;
  pageSize: number;
  currentPage: number;
  sortColumn: string;
  sortDirection: "asc" | "desc";
}

interface ProcessingState {
  status: "idle" | "loading" | "fetching" | "parsing" | "inserting" | "completed" | "error";
  progress: string;
  error?: string;
  data?: CsvData;
  processingTime?: number;
  currentProcessingTime?: number;
  startTime?: number;
  warnings?: string[];
  rowsProcessed?: number;
  tableName?: string;
}

const EXAMPLE_URLS = [
  "https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv.gz",
  "https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv.gz",
  "https://github.com/cs109/2014_data/raw/master/countries.csv.gz",
  "/api/test-csv?rows=5000",
];

// useDebounce is now imported from "@/hooks/useDebounce"
// getTableNameFromUrl is now imported from "@/lib/utils"
// formatProcessingTime is now imported from "@/lib/utils"

export function PgliteCsvProcessor({
  className,
}: PgliteCsvProcessorProps) {
  const db = usePGlite(); // Official hook, returns PGlite instance or null

  // Memoize Drizzle instance
  const drizzleDb = useMemo(() => {
    if (db) {
      return drizzle(db);
    }
    return null;
  }, [db]);

  // isLoading, isReady, dbError, isWorkerMode, reinitializeInstance are not available from the official hook.
  // The OfficialPGliteProviderWrapper handles initial loading and error UI.

  const [state, setState] = useState<ProcessingState>({
    status: "idle",
    progress: "",
  });
  const [url, setUrl] = useState("");
  const [tableState, setTableState] = useState<TableState>({
    searchTerm: "",
    pageSize: 10,
    currentPage: 1,
    sortColumn: "",
    sortDirection: "asc",
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Real-time processing timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (["fetching", "parsing", "inserting"].includes(state.status) && state.startTime) {
      interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          currentProcessingTime: Date.now() - (prev.startTime || 0),
        }));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.status, state.startTime]);

  const debouncedSearchTerm = useDebounce(tableState.searchTerm, 300);

  const fetchTableData = useCallback(
    async (
      tableName: string,
      options: {
        limit?: number;
        offset?: number;
        searchTerm?: string;
        sortColumn?: string;
        sortDirection?: "asc" | "desc";
      } = {}
    ): Promise<CsvData | null> => {
      if (!db) { // Check if db instance is available
        console.warn("fetchTableData: DB instance not available.");
        return null;
      }

      const {
        limit = 10,
        offset = 0,
        searchTerm = "",
        sortColumn = "",
        sortDirection = "asc",
      } = options;

      try {
        // Check if table exists
        const tableExistsResult = await db.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          );`,
          [tableName]
        );

        if (!(tableExistsResult.rows[0] as any)?.exists) {
          console.warn(`Table '${tableName}' does not exist.`);
          return null;
        }

        // Get columns
        const columnsResult = await db.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = $1 ORDER BY ordinal_position;`,
          [tableName]
        );
        const columns: string[] = columnsResult.rows.map((col: any) => col.column_name);

        if (columns.length === 0) {
          return { columns: [], rows: [], totalRows: 0 };
        }

        // Build WHERE clause for search
        let whereClause = "";
        const queryParams: any[] = [];
        let paramIndex = 1;

        if (searchTerm.trim()) {
          const searchConditions = columns
            .map((col) => `CAST("${col}" AS TEXT) ILIKE $${paramIndex++}`)
            .join(" OR ");
          whereClause = `WHERE (${searchConditions})`;
          columns.forEach(() => queryParams.push(`%${searchTerm.trim()}%`));
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total_count FROM "${tableName}" ${whereClause};`;
        const countResult = await db.query(countSql, queryParams);
        const totalRows = Number((countResult.rows[0] as any)?.total_count) || 0;

        // Build ORDER BY clause
        let orderByClause = "";
        if (sortColumn && columns.includes(sortColumn)) {
          orderByClause = `ORDER BY "${sortColumn}" ${sortDirection.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
        }

        // Get data
        const finalQueryParams = [...queryParams, limit, offset];
        const dataSql = `
          SELECT ${columns.map(c => `"${c}"`).join(", ")}
          FROM "${tableName}"
          ${whereClause}
          ${orderByClause}
          LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;
        
        const dataResult = await db.query(dataSql, finalQueryParams);
        const rows = dataResult.rows.map((row: any) => columns.map(col => row[col]));

        return { columns, rows, totalRows };
      } catch (error) {
        console.error("Error fetching table data:", error);
        return null;
      }
    },
    [db] // Removed isDbReady
  );

  const processCSV = useCallback(
    async (csvUrl: string) => {
      if (!db || !drizzleDb) { // Check for drizzleDb as well
        setState(prev => ({ ...prev, status: "error", error: "Database not ready or Drizzle not initialized." }));
        return;
      }

      // Cancel any existing processing
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const tableName = getTableNameFromUrlUtil(csvUrl); // Use imported utility
      const startTime = Date.now();

      setState({
        status: "fetching",
        progress: "Initializing...",
        error: undefined,
        startTime,
        currentProcessingTime: 0,
        rowsProcessed: 0,
        tableName,
      });

      try {
        const processor = new CsvStreamProcessor({
          url: csvUrl,
          tableName,
          batchSize: 1000,
          signal: abortController.signal,
          onProgress: (progress) => {
            setState(prev => ({ ...prev, progress }));
          },
          onBatch: async (batch, headers) => {
            setState(prev => ({
              ...prev,
              status: "inserting",
              rowsProcessed: (prev.rowsProcessed || 0) + batch.length
            }));

            // Create table on first batch
            if (!state.tableName || state.rowsProcessed === 0) {
              await db.query(`DROP TABLE IF EXISTS "${tableName}";`);

              // Infer column types from first batch
              const columnTypes = headers.map(header => ({ name: header, type: 'text' }));
              const createTableSql = createCsvTableSchema(tableName, columnTypes);
              await db.query(createTableSql);
            }

            // Insert batch data
            const insertSql = createInsertSql(tableName, headers);
            await db.transaction(async (tx) => {
              for (const record of batch) {
                const values = headers.map(header => record[header]);
                await tx.query(insertSql, values);
              }
            });
          },
          onComplete: async (totalRows) => {
            const processingTime = Date.now() - startTime;

            // Save metadata
            if (drizzleDb) { // drizzleDb should be available if db is
              try {
                const columnsResult = await db.query(
                  `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
                  [tableName]
                );
                const columnCount = columnsResult.rows.length;

                await drizzleDb.insert(csvMetadata).values({
                  tableName,
                  originalUrl: csvUrl,
                  fileName: csvUrl.split('/').pop() || 'unknown',
                  totalRows,
                  columnCount: columnCount, // Set actual column count
                  processingTimeMs: processingTime, // Ensure field name matches schema
                }).onConflictDoUpdate({
                  target: csvMetadata.tableName,
                  set: {
                    totalRows,
                    columnCount: columnCount,
                    processingTimeMs: processingTime,
                    updatedAt: new Date(),
                  },
                });
              } catch (metaError) {
                console.warn("Failed to save metadata:", metaError);
              }
            }

            // Fetch initial data for display
            const initialData = await fetchTableData(tableName, {
              limit: tableState.pageSize
            });

            setState(prev => ({
              ...prev,
              status: "completed",
              progress: `Successfully processed ${totalRows} rows`,
              processingTime,
              data: initialData || undefined,
              currentProcessingTime: undefined,
            }));
          },
          onError: (error) => {
            setState(prev => ({
              ...prev,
              status: "error",
              error: error.message,
              currentProcessingTime: undefined,
            }));
          },
        });

        await processor.process();

      } catch (error: any) {
        if (error.name === 'AbortError') {
          setState(prev => ({
            ...prev,
            status: "idle",
            progress: "Processing cancelled",
            currentProcessingTime: undefined,
          }));
        } else {
          setState(prev => ({
            ...prev,
            status: "error",
            error: error.message,
            currentProcessingTime: undefined,
          }));
        }
      }
    },
    // Removed isDbReady from dependencies
    [db, drizzleDb, fetchTableData, tableState.pageSize, state.tableName, state.rowsProcessed]
  );

  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clearTable = useCallback(async () => {
    if (!db || !drizzleDb || !state.tableName) return; // Check drizzleDb

    try {
      await db.query(`DROP TABLE IF EXISTS "${state.tableName}";`);

      // Remove from metadata
      if (drizzleDb) { // drizzleDb should be available
        await drizzleDb.delete(csvMetadata).where(
          eq(csvMetadata.tableName, state.tableName)
        );
      }

      setState(prev => ({
        ...prev,
        status: "idle",
        progress: "",
        data: undefined,
        error: undefined,
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: `Failed to clear table: ${error.message}`,
      }));
    }
  }, [db, drizzleDb, state.tableName]); // Removed isDbReady

  // Update data when search/pagination changes
  useEffect(() => {
    if (state.tableName && state.status === "completed") {
      fetchTableData(state.tableName, {
        limit: tableState.pageSize,
        offset: (tableState.currentPage - 1) * tableState.pageSize,
        searchTerm: debouncedSearchTerm,
        sortColumn: tableState.sortColumn,
        sortDirection: tableState.sortDirection,
      }).then(data => {
        if (data) {
          setState(prev => ({ ...prev, data }));
        }
      });
    }
  }, [
    state.tableName,
    state.status,
    tableState.pageSize,
    tableState.currentPage,
    debouncedSearchTerm,
    tableState.sortColumn,
    tableState.sortDirection,
    fetchTableData,
  ]);

  // dbError and isDbLoading are not available from the official hook.
  // The OfficialPGliteProviderWrapper handles initial loading and error UI.
  // We should ensure db is available before rendering the main content.
  if (!db) {
    // This case should ideally be handled by the OfficialPGliteProviderWrapper
    // by not rendering this component until db is ready.
    // However, as a safeguard or if provider logic changes:
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Initializing PGLite Database...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          PGLite CSV Processing
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Process CSV files with PostgreSQL in the browser (Worker Mode)
        </p>
      </div>

      {/* URL Input */}
      <UrlInput
        url={url}
        onChange={setUrl}
        onProcess={processCSV}
        isProcessing={["fetching", "parsing", "inserting"].includes(state.status)}
        onCancel={cancelProcessing}
      />

      {/* Example URLs */}
      <ExampleUrls urls={EXAMPLE_URLS} onSelect={setUrl} />

      {/* Progress Display */}
      {state.status !== "idle" && (
        <ProgressDisplay
          status={state.status}
          progress={state.progress}
          processingTime={state.currentProcessingTime || state.processingTime}
          error={state.error}
          rowsProcessed={state.rowsProcessed}
          onRetry={() => url && processCSV(url)}
          onClear={clearTable}
        />
      )}

      {/* Data Table */}
      {state.data && (
        <CsvDataTable
          data={state.data}
          tableState={tableState}
          onTableStateChange={setTableState}
          tableName={state.tableName}
        />
      )}

      {/* Memory Monitor */}
      <MemoryMonitor />
    </div>
  );
}
