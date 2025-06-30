"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
// Switch to official PGlite hook
import { usePGlite, useLiveQuery, sql } from "@electric-sql/pglite-react"; // Added useLiveQuery and sql
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
  const [totalRowsInTable, setTotalRowsInTable] = useState(0); // For pagination

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

  // fetchTableData is removed, replaced by useLiveQuery and manual total count fetching.

  const processCSV = useCallback(
    async (csvUrl: string) => {
      if (!db || !drizzleDb) {
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

            // Data will be updated by useLiveQuery.
            // We might need to trigger a refresh or update parameters for useLiveQuery here,
            // or ensure it naturally picks up the new table.
            // For now, setting the tableName in state should trigger useLiveQuery re-evaluation.
            setState(prev => ({
              ...prev,
              status: "completed",
              progress: `Successfully processed ${totalRows} rows into table '${tableName}'`,
              processingTime,
              tableName: tableName, // Ensure tableName is set to trigger live query
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
    // Removed fetchTableData, added getTableNameFromUrlUtil
    [db, drizzleDb, tableState.pageSize, state.tableName, state.rowsProcessed]
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

  // useEffect for fetching data manually is removed. useLiveQuery handles reactivity.

  // State for columns, as useLiveQuery returns rows as objects, not arrays of arrays.
  const [currentColumns, setCurrentColumns] = useState<string[]>([]);

  // Live query for the data
  const { results: liveQueryRows, error: liveQueryError } = useLiveQuery<{ [key: string]: any }>(() => {
    if (!db || !state.tableName) return null; // Don't run query if no table or db

    const offset = (tableState.currentPage - 1) * tableState.pageSize;

    // Base query
    let query = sql`SELECT * FROM ${sql.ident(state.tableName)}`;
    const params: any[] = [];

    // Search term
    // This part is tricky with sql tagged template if columns are dynamic.
    // For simplicity, we might need to fetch columns first, then build this.
    // Or, if columns are known/stable for a table, they can be hardcoded in search.
    // For now, let's assume we have `currentColumns` populated.
    if (debouncedSearchTerm && currentColumns.length > 0) {
      const searchConditions = currentColumns
        .map(colName => sql`${sql.ident(colName)}::text ILIKE ${`%${debouncedSearchTerm}%`}`)
        .reduce((acc, curr, idx) => idx === 0 ? curr : sql`${acc} OR ${curr}`, sql``);
      query = sql`${query} WHERE (${searchConditions})`;
    }

    // Sorting
    if (tableState.sortColumn && currentColumns.includes(tableState.sortColumn)) {
      const direction = tableState.sortDirection === 'desc' ? sql`DESC` : sql`ASC`;
      query = sql`${query} ORDER BY ${sql.ident(tableState.sortColumn)} ${direction}`;
    }

    // Pagination
    query = sql`${query} LIMIT ${tableState.pageSize} OFFSET ${offset}`;

    return query;
  }, [db, state.tableName, tableState, debouncedSearchTerm, currentColumns]);


  // Effect to update local data state from live query results
  useEffect(() => {
    if (liveQueryError) {
      console.error("Live query error:", liveQueryError);
      setState(prev => ({ ...prev, status: "error", error: liveQueryError.message }));
      return;
    }
    if (liveQueryRows && state.tableName) {
      if (liveQueryRows.length > 0 && currentColumns.length === 0) {
        // Infer columns from the first row if not already set
        setCurrentColumns(Object.keys(liveQueryRows[0]));
      }
      // Transform rows from objects to arrays for CsvDataTable if needed, or update CsvDataTable
      // For now, assuming CsvDataTable can handle array of objects if columns are provided.
      // The original CsvData interface expected rows as (string | number | boolean | null)[][]
      // This needs careful handling.
      const transformedRows = liveQueryRows.map(row => currentColumns.map(col => row[col]));

      setState(prev => ({
        ...prev,
        // status should ideally be 'completed' or 'idle' here if data is successfully fetched
        // but let's not override processing status if it's e.g. 'inserting'
        data: {
          columns: currentColumns,
          rows: transformedRows,
          totalRows: totalRowsInTable, // This needs to be updated by another query
        },
        error: undefined, // Clear previous errors if data is fetched
      }));
    } else if (!state.tableName && state.data) {
      // Clear data if table name is removed
       setState(prev => ({...prev, data: undefined}));
       setCurrentColumns([]);
    }
  }, [liveQueryRows, liveQueryError, state.tableName, currentColumns, totalRowsInTable]);


  // Effect to fetch total row count and columns when table name or search term changes
  useEffect(() => {
    if (!db || !state.tableName) {
      setTotalRowsInTable(0);
      setCurrentColumns([]);
      return;
    }

    const fetchMeta = async () => {
      try {
        // Fetch columns for the current table
        const colsResult = await db.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
          [state.tableName]
        );
        const newColumns = colsResult.rows.map((r: any) => r.column_name);
        if (JSON.stringify(newColumns) !== JSON.stringify(currentColumns)) {
           setCurrentColumns(newColumns);
        }

        // Fetch total rows
        let countQuery = sql`SELECT COUNT(*) as total_count FROM ${sql.ident(state.tableName)}`;
        if (debouncedSearchTerm && newColumns.length > 0) {
          const searchConditions = newColumns
            .map(colName => sql`${sql.ident(colName)}::text ILIKE ${`%${debouncedSearchTerm}%`}`)
            .reduce((acc, curr, idx) => idx === 0 ? curr : sql`${acc} OR ${curr}`, sql``);
          countQuery = sql`${countQuery} WHERE (${searchConditions})`;
        }

        const countResult = await db.query(countQuery.sql, countQuery.params);
        setTotalRowsInTable(Number((countResult.rows[0] as any)?.total_count) || 0);

      } catch (err) {
        console.error("Error fetching table metadata (count/columns):", err);
        setTotalRowsInTable(0);
        setCurrentColumns([]);
        // Optionally set an error state here for the user
      }
    };

    fetchMeta();
  }, [db, state.tableName, debouncedSearchTerm, currentColumns]); // currentColumns is a dependency to re-run if it changes


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
