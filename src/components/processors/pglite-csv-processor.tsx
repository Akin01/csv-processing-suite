"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { usePGlite } from "@/providers/pglite-provider";
import { CsvStreamProcessor } from "@/lib/csv-stream-processor";
import { createCsvTableSchema, createInsertSql } from "@/lib/drizzle-schema";

interface PgliteCsvProcessorProps {
  className?: string;
  dataDir?: string;
  useWorker?: boolean;
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
  status: "idle" | "loading" | "fetching" | "parsing" | "inserting" | "completed" | "error" | "processing";
  progress: string;
  error?: string;
  data?: CsvData;
  processingTime?: number;
  currentProcessingTime?: number;
  startTime?: number;
  warnings?: string[];
}

const EXAMPLE_URLS = [
  "https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv.gz",
  "https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv.gz",
  "https://github.com/cs109/2014_data/raw/master/countries.csv.gz",
  "/api/test-csv?rows=1000",
];

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function PgliteCsvProcessor({
  className,
  dataDir = "idb://pglite_csv_processor_db",
  useWorker = true,
}: PgliteCsvProcessorProps) {
  const {
    db,
    isLoading: isDbLoading,
    isReady: isDbReady,
    reinitializeInstance,
  } = usePGlite(dataDir, useWorker);

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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((state.status === "fetching" || state.status === "parsing" || state.status === "inserting") && state.startTime) {
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

  const getTableNameFromUrl = useCallback((csvUrl: string): string => {
    try {
      const urlObj = new URL(csvUrl, window.location.origin);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || "unknown_csv";
      const nameWithoutGz = filename.replace(/\.csv\.gz$/i, "");
      const nameWithoutCsv = nameWithoutGz.replace(/\.csv$/i, "");
      const safeName = nameWithoutCsv.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      return safeName || "csv_data";
    } catch {
      return "csv_data";
    }
  }, []);

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
      if (!db || !isDbReady) {
        console.warn("fetchTableData: DB not ready.");
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
        const tableExistsResult = await db.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          );`,
          [tableName]
        );

        if (!(tableExistsResult.rows[0] as { exists: boolean })?.exists) {
          console.warn(`Table '${tableName}' does not exist in PGLite.`);
          return null;
        }

        const columnsResult = await db.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
          [tableName]
        );
        const columns: string[] = columnsResult.rows.map((col: unknown) => (col as { column_name: string }).column_name);

        if (columns.length === 0) {
          console.warn(`No columns found for table '${tableName}'.`);
          return { columns: [], rows: [], totalRows: 0 };
        }

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

        const countSql = `SELECT COUNT(*) as total_count FROM "${tableName}" ${whereClause};`;
        const countResult = await db.query(countSql, queryParams);
        const totalRows = Number((countResult.rows[0] as { total_count: number })?.total_count) || 0;

        let orderByClause = "";
        if (sortColumn && columns.includes(sortColumn)) {
          orderByClause = `ORDER BY "${sortColumn}" ${sortDirection.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
        }
        
        const finalQueryParams = [...queryParams]; // Parameters for the main data query

        const limitParamName = `$${paramIndex++}`;
        finalQueryParams.push(limit);
        const offsetParamName = `$${paramIndex++}`;
        finalQueryParams.push(offset);

        const dataSql = `
          SELECT ${columns.map(c => `"${c}"`).join(", ")}
          FROM "${tableName}"
          ${whereClause}
          ${orderByClause}
          LIMIT ${limitParamName} OFFSET ${offsetParamName};
        `;
        
        const dataResult = await db.query(dataSql, finalQueryParams);
        const rows = dataResult.rows.map((row: unknown) => 
          columns.map(col => {
            const value = (row as Record<string, unknown>)[col];
            // Type guard to ensure the value is the expected type
            return value as string | number | boolean | null;
          })
        );

        return { columns, rows, totalRows };
      } catch (error) {
        console.error("Error fetching table data from PGLite:", error);
        setState(prev => ({...prev, status: "error", error: `Failed to fetch data: ${(error as Error).message}`}));
        return null;
      }
    },
    [db, isDbReady]
  );

  const processUrl = useCallback(
    async (csvUrl: string) => {
      if (!db || !isDbReady) {
        setState({ status: "error", progress: "", error: "PGLite database not ready." });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const startTime = Date.now();
      setState({ 
        status: "fetching", 
        progress: "Initiating streaming CSV processing...", 
        startTime, 
        error: undefined, 
        data: undefined, 
        warnings: [] 
      });

      const tableName = getTableNameFromUrl(csvUrl);

      try {
        // Check if table already exists with data
        const tableExistsRes = await db.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1);`,
          [tableName]
        );
        
        if ((tableExistsRes.rows[0] as { exists: boolean })?.exists) {
          const rowCountRes = await db.query(`SELECT COUNT(*) as count FROM "${tableName}";`);
          if (Number((rowCountRes.rows[0] as { count: number })?.count) > 0) {
            setState(prev => ({ 
              ...prev, 
              status: "completed", 
              progress: `Using existing table '${tableName}'.`, 
              processingTime: Date.now() - startTime, 
              warnings: [`Using existing table: ${tableName}`]
            }));
            const initialData = await fetchTableData(tableName, { limit: tableState.pageSize });
            if (initialData) setState(prev => ({ ...prev, data: initialData }));
            return;
          } else {
            await db.query(`DROP TABLE IF EXISTS "${tableName}";`);
          }
        }

        // Use the enhanced streaming processor
        const processor = new CsvStreamProcessor({
          url: csvUrl,
          tableName,
          batchSize: 500,
          signal,
          onProgress: (progress) => {
            setState(prev => ({ ...prev, progress, status: "processing" }));
          },
          onBatch: async (batch, headers) => {
            // Create table on first batch if it doesn't exist
            const tableCheckRes = await db.query(
              `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1);`,
              [tableName]
            );
            
            if (!(tableCheckRes.rows[0] as { exists: boolean })?.exists) {
              // Infer column types from the first batch
              const columnTypes = CsvStreamProcessor.inferColumnTypes(batch.slice(0, 10), headers);
              const createTableSql = createCsvTableSchema(tableName, columnTypes);
              await db.query(createTableSql);
            }

            // Prepare batch insert
            const insertSql = createInsertSql(tableName, headers);
            
            // Use transaction for better performance
            await db.transaction(async (tx) => {
              for (const record of batch) {
                const values = headers.map(header => record[header] ?? null);
                await tx.query(insertSql, values);
              }
            });
          },
          onComplete: async (totalRows) => {
            // Update metadata table
            await db.query(`
              INSERT INTO csv_metadata (table_name, original_url, file_name, total_rows, column_count, processing_time_ms, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
              ON CONFLICT (table_name) 
              DO UPDATE SET 
                total_rows = EXCLUDED.total_rows,
                processing_time_ms = EXCLUDED.processing_time_ms,
                updated_at = CURRENT_TIMESTAMP;
            `, [
              tableName,
              csvUrl,
              tableName + '.csv',
              totalRows,
              0, // Will be updated after we get the actual column count
              Date.now() - startTime
            ]);

            const processingTime = Date.now() - startTime;
            setState(prev => ({ 
              ...prev, 
              status: "completed", 
              progress: `Successfully processed and loaded ${totalRows} rows into '${tableName}'.`, 
              processingTime 
            }));

            // Load initial data for display
            const initialData = await fetchTableData(tableName, { limit: tableState.pageSize });
            if (initialData) {
              setState(prev => ({ ...prev, data: initialData }));
              
              // Update column count in metadata
              await db.query(`
                UPDATE csv_metadata 
                SET column_count = $2 
                WHERE table_name = $1;
              `, [tableName, initialData.columns.length]);
            }
          },
          onError: (error) => {
            console.error("Streaming processor error:", error);
            setState(prev => ({ 
              ...prev, 
              status: "error", 
              error: error.message, 
              progress: "",
              currentProcessingTime: undefined, 
              startTime: undefined 
            }));
          }
        });

        await processor.process();

      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log("Processing was aborted.");
          setState(prev => ({ 
            ...prev, 
            status: "idle", 
            progress: "Processing aborted.", 
            error: undefined, 
            currentProcessingTime: undefined, 
            startTime: undefined 
          }));
        } else {
          console.error("Error processing CSV with PGLite:", error);
          setState(prev => ({ 
            ...prev, 
            status: "error", 
            error: (error as Error).message, 
            progress: "", 
            currentProcessingTime: undefined, 
            startTime: undefined 
          }));
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [db, isDbReady, getTableNameFromUrl, fetchTableData, tableState.pageSize]
  );

  const clearCurrentTable = useCallback(async () => {
    if (!db || !isDbReady || !url) return;
    const tableName = getTableNameFromUrl(url);
    setState(prev => ({ ...prev, status: "processing", progress: `Clearing table '${tableName}'...`, error: undefined, data: undefined }));
    try {
      await db.query(`DROP TABLE IF EXISTS "${tableName}";`);
      setState(prev => ({ ...prev, status: "idle", progress: `Table '${tableName}' cleared.`, data: undefined, processingTime: undefined, currentProcessingTime: undefined, startTime: undefined }));
    } catch (err: unknown) {
      setState(prev => ({ ...prev, status: "error", error: `Failed to clear table: ${(err as Error).message}` }));
    }
  }, [db, isDbReady, url, getTableNameFromUrl]);

  const clearDatabaseAndReinitialize = useCallback(async () => {
    setState(prev => ({ ...prev, status: "processing", progress: "Reinitializing database instance...", error: undefined, data: undefined }));
    try {
      await reinitializeInstance();
      setState(prev => ({ ...prev, status: "idle", progress: "Database instance reinitialized.", data: undefined, processingTime: undefined, currentProcessingTime: undefined, startTime: undefined }));
      setUrl("");
    } catch (err: unknown) {
      setState(prev => ({ ...prev, status: "error", error: `Failed to reinitialize database: ${(err as Error).message}` }));
    }
  }, [reinitializeInstance]);


  useEffect(() => {
    if (state.status === "completed" && url.trim()) {
      const tableName = getTableNameFromUrl(url);
      if (!tableName) return;

      const offset = (tableState.currentPage - 1) * tableState.pageSize;
      fetchTableData(tableName, {
        limit: tableState.pageSize,
        offset,
        searchTerm: debouncedSearchTerm,
        sortColumn: tableState.sortColumn,
        sortDirection: tableState.sortDirection,
      }).then(newData => {
        if (newData) {
            setState(prev => ({ ...prev, data: newData }));
        } else if (state.data) { 
            setState(prev => ({ ...prev, data: undefined, status: "idle", progress: `Table data for '${tableName}' became unavailable.`}));
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearchTerm,
    tableState.currentPage,
    tableState.pageSize,
    tableState.sortColumn,
    tableState.sortDirection,
    state.status, 
    url, 
    // getTableNameFromUrl and fetchTableData are stable due to useCallback
  ]);

  const formatProcessingTime = (timeMs: number) => {
    if (timeMs < 1000) return `${timeMs}ms`;
    if (timeMs < 60000) return `${(timeMs / 1000).toFixed(1)}s`;
    const minutes = Math.floor(timeMs / 60000);
    const seconds = Math.floor((timeMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className={`space-y-6 ${className || ""}`}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          PGLite CSV Processor
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Load gzipped CSV from remote URLs into PGLite (PostgreSQL in browser) via streaming. Uses IndexedDB for persistence.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="csv-url-pglite" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              CSV URL (gzipped or plain)
            </label>
            <input
              type="url"
              id="csv-url-pglite"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/data.csv.gz or /data.csv"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Example URLs:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLE_URLS.map((exampleUrl, index) => (
                <button
                  key={index}
                  onClick={() => setUrl(exampleUrl)}
                  className="text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md border text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                  {exampleUrl.length > 50 ? `${exampleUrl.substring(0, 50)}...` : exampleUrl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { if (url.trim()) processUrl(url); }}
              disabled={isDbLoading || !isDbReady || state.status === "fetching" || state.status === "parsing" || state.status === "inserting" || !url.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state.status === "fetching" || state.status === "parsing" || state.status === "inserting" ? "Processing..." : "Process CSV with PGLite"}
            </button>
            <button
              onClick={clearCurrentTable}
              disabled={isDbLoading || !isDbReady || state.status === "fetching" || state.status === "parsing" || state.status === "inserting" || !url.trim() || (state.status !== "completed" && state.status !== "error" && state.status !== "idle") }
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear the table associated with the current CSV URL from PGLite"
            >
              Clear Current Table
            </button>
            <button
              onClick={clearDatabaseAndReinitialize}
              disabled={isDbLoading || !isDbReady || state.status === "fetching" || state.status === "parsing" || state.status === "inserting"}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Reinitialize PGLite instance (clears all tables for this dataDir)"
            >
              Reinitialize DB
            </button>
          </div>
        </div>

        {(state.status === "fetching" || state.status === "parsing" || state.status === "inserting" || state.status === "error" || state.status === "loading") && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {(state.status === "fetching" || state.status === "parsing" || state.status === "inserting" || state.status === "loading") && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {state.status === "error" ? "Error" : (state.status === "loading" ? "DB Loading..." : "Processing")}
                </span>
              </div>
              {(state.status === "fetching" || state.status === "parsing" || state.status === "inserting") && state.currentProcessingTime != null && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatProcessingTime(state.currentProcessingTime)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-all">
              {state.error || state.progress}
            </p>
          </div>
        )}

        {state.warnings && state.warnings.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-200 mb-1">Warnings:</p>
            <ul className="list-disc list-inside text-xs text-yellow-600 dark:text-yellow-300 space-y-0.5">
              {state.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {state.status === "idle" && state.progress && !state.data && state.processingTime == null && (
          <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300">{state.progress}</p>
          </div>
        )}
      </div>

      {state.status === "completed" && state.processingTime != null && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mt-6">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Processing Complete
            </span>
          </div>
          <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
            <p><strong>Total Time:</strong> {formatProcessingTime(state.processingTime)}</p>
            <p><strong>Table Name:</strong> {url ? getTableNameFromUrl(url) : "N/A"}</p>
            {state.data && <p><strong>Total Rows Loaded:</strong> {state.data.totalRows.toLocaleString()}</p>}
            {state.progress && !state.warnings?.some(w => w.includes(getTableNameFromUrl(url))) && <p>{state.progress}</p>}
          </div>
        </div>
      )}

      {state.data && (state.status === "completed" || state.status === "idle" || state.status === "error") && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mt-6">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Data for: {getTableNameFromUrl(url)} ({state.data.totalRows.toLocaleString()} total rows)
              </h3>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={tableState.searchTerm}
                  onChange={(e) => setTableState(prev => ({ ...prev, searchTerm: e.target.value, currentPage: 1 }))}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <select
                  value={tableState.pageSize}
                  onChange={(e) => setTableState(prev => ({ ...prev, pageSize: Number(e.target.value), currentPage: 1 }))}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>
            </div>
          </div>
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {state.data.columns.map((column) => (
                    <th
                      key={column}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => {
                        const newDirection = tableState.sortColumn === column && tableState.sortDirection === "asc" ? "desc" : "asc";
                        setTableState(prev => ({ ...prev, sortColumn: column, sortDirection: newDirection, currentPage: 1 }));
                      }}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column}</span>
                        {tableState.sortColumn === column && (
                          <span className="text-indigo-600 dark:text-indigo-400">
                            {tableState.sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {state.data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={String(cell ?? "")}>
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.data && state.data.totalRows > tableState.pageSize && (
             <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {Math.min((tableState.currentPage - 1) * tableState.pageSize + 1, state.data.totalRows)}
                  {" to "}
                  {Math.min(tableState.currentPage * tableState.pageSize, state.data.totalRows)}
                  {" of "} {state.data.totalRows.toLocaleString()} results
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setTableState(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                    disabled={tableState.currentPage === 1}
                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                    Page {tableState.currentPage} of {Math.ceil(state.data.totalRows / tableState.pageSize)}
                  </span>
                  <button
                    onClick={() => setTableState(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                    disabled={tableState.currentPage >= Math.ceil(state.data.totalRows / tableState.pageSize)}
                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

PgliteCsvProcessor.displayName = "PgliteCsvProcessor";
