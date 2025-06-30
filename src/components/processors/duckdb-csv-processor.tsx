"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useDuckDB } from "@/providers/duckdb-provider";

interface DuckDbCsvProcessorProps {
  className?: string;
  opfsPath?: string; // Allow opfsPath to be passed as a prop
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
  status: "idle" | "loading" | "processing" | "completed" | "error";
  progress: string;
  error?: string;
  data?: CsvData;
  processingTime?: number;
  currentProcessingTime?: number;
  startTime?: number;
  csvParsingMethod?: string;
  warnings?: string[];
}

const EXAMPLE_URLS = [
  "https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv.gz",
  "https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv.gz",
  "https://github.com/cs109/2014_data/raw/master/countries.csv.gz",
  "/api/test-csv?rows=1000",
];

// Debounce hook for search
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function DuckDbCsvProcessor({
  className,
  opfsPath = "opfs://petadata_duckdb.db", // Default OPFS path for this processor
}: DuckDbCsvProcessorProps) {
  const {
    db,
    isLoading,
    isReady,
    removeOpfsFile,
    reinitializeInstance, // Renamed from reinitializeDatabase
    // terminateInstance, // Available if needed
    // checkOpfsFile, // Available if needed
  } = useDuckDB(opfsPath); // Pass the opfsPath to the hook

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

  // Real-time processing time update
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (state.status === "processing" && state.startTime) {
      interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          currentProcessingTime: Date.now() - (prev.startTime || 0),
        }));
      }, 100); // Update every 100ms
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.status, state.startTime]);

  // Debounce search term to avoid excessive database queries
  const debouncedSearchTerm = useDebounce(tableState.searchTerm, 100);

  // Function to generate a safe table name from URL
  const getTableNameFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || "unknown";
      const nameWithoutExtension = filename.replace(/\.(csv.gz)$/gi, "");
      const safeName = nameWithoutExtension
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase();
      return safeName || "csv_data";
    } catch {
      return "csv_data";
    }
  }, []);

  // Function to clear table based on the current URL state
  const clearCurrentTable = useCallback(async () => {
    if (!db || !isReady || !url) {
      console.warn("Cannot clear table: DB not ready or no URL set.");
      return;
    }

    const tableName = getTableNameFromUrl(url);
    if (!tableName) {
      console.warn("Could not derive table name from current URL:", url);
      return;
    }

    setState((prev) => ({
      ...prev,
      status: "processing",
      progress: `Clearing table \'${tableName}\' ...`,
      error: undefined,
    }));

    const conn = await db.connect();
    try {
      await conn.query(`DROP TABLE IF EXISTS \"${tableName}\";`);
      console.log(`Table \'${tableName}\' cleared successfully.`);
      setState((prev) => ({
        ...prev,
        status: "idle",
        progress: `Table \'${tableName}\' cleared.`,
        data: undefined,
        processingTime: undefined,
        currentProcessingTime: undefined,
        startTime: undefined,
        warnings: [],
      }));
      setTableState({
        searchTerm: "",
        pageSize: 10,
        currentPage: 1,
        sortColumn: "",
        sortDirection: "asc",
      });
      // Optionally, clear the URL input after clearing its table
      // setUrl(\"\");
    } catch (err: unknown) { // Changed from any to unknown
      console.error(`Error clearing table \'${tableName}\':`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: `Failed to clear table \'${tableName}\': ${errorMessage}`,
        progress: "",
      }));
    } finally {
      await conn.close();
    }
  }, [db, isReady, url, getTableNameFromUrl]);

  // Function to fetch table data with pagination, search, and sorting
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
      if (!db || !isReady) return null;

      const conn = await db.connect();

      try {
        const {
          limit = 50,
          offset = 0,
          searchTerm = "",
          sortColumn = "",
          sortDirection = "asc",
        } = options;

        // First check if the table exists
        const tableExistsResult = await conn.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_name = '${tableName}'
        `);

        const tableExists = Number(tableExistsResult.getChildAt(0)?.get(0)) > 0;

        if (!tableExists) {
          console.warn(`Table '${tableName}' does not exist`);
          return null;
        }

        // Get column information
        const schemaResult = await conn.query(`
          SELECT column_name, data_type
          FROM information_schema.columns 
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position
        `);

        if (schemaResult.numRows === 0) {
          console.warn(`No columns found for table '${tableName}'`);
          return null;
        }

        // Merge columns and data types into a single array for efficiency
        const columnInfo = Array.from(
          { length: schemaResult.numRows },
          (_, i) => ({
            name: schemaResult.getChildAt(0)?.get(i) as string,
            type:
              (schemaResult.getChildAt(1)?.get(i) as string)?.toLowerCase() ||
              "",
          })
        );

        const columns = columnInfo.map((col) => col.name);

        // Build optimized SELECT clause with type-aware casting
        const selectClause = columnInfo
          .map(({ name, type }) => {
            const quotedCol = `"${name}"`;

            // Date/timestamp handling
            if (type.includes("date") || type.includes("timestamp")) {
              return `strftime(${quotedCol}, '%Y-%m-%d') as ${quotedCol}`;
            }

            // Numeric types
            if (
              type.includes("decimal") ||
              type.includes("numeric") ||
              type.includes("float") ||
              type.includes("double")
            ) {
              return `CAST(${quotedCol} AS DOUBLE) as ${quotedCol}`;
            }

            if (
              type.includes("integer") ||
              type.includes("bigint") ||
              type.includes("int")
            ) {
              return `CAST(${quotedCol} AS BIGINT) as ${quotedCol}`;
            }

            // Boolean handling
            if (type.includes("boolean") || type.includes("bool")) {
              return `CAST(${quotedCol} AS BOOLEAN) as ${quotedCol}`;
            }

            // Default to VARCHAR for text and unknown types
            return `CAST(${quotedCol} AS VARCHAR) as ${quotedCol}`;
          })
          .join(", ");

        // Build search WHERE clause with SQL injection protection
        let whereClause = "";
        if (searchTerm.trim()) {
          const escapedSearchTerm = searchTerm.replace(/'/g, "''").trim();
          const searchConditions = columns
            .map(
              (col) =>
                `CAST("${col}" AS VARCHAR) ILIKE '%${escapedSearchTerm}%'`
            )
            .join(" OR ");
          whereClause = `WHERE (${searchConditions})`;
        }

        // Build ORDER BY clause with validation
        let orderByClause = "";
        if (sortColumn && columns.includes(sortColumn)) {
          const direction =
            sortDirection.toUpperCase() === "DESC" ? "DESC" : "ASC";
          orderByClause = `ORDER BY "${sortColumn}" ${direction}`;
        }

        // Get total count for pagination
        const countQuery = `
          SELECT COUNT(*) as total_count 
          FROM ${tableName} 
          ${whereClause}
        `;

        const countResult = await conn.query(countQuery);
        const totalRows = Number(countResult.getChildAt(0)?.get(0)) || 0;

        // Execute main data query with proper limits
        const dataQuery = `
          SELECT ${selectClause}
          FROM ${tableName} 
          ${whereClause}
          ${orderByClause}
          LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
        `;

        const dataResult = await conn.query(dataQuery);

        // Extract and process rows
        const rows = Array.from({ length: dataResult.numRows }, (_, rowIndex) =>
          columns.map((_, colIndex) => {
            const value = dataResult.getChildAt(colIndex)?.get(rowIndex);

            // Handle null/undefined values consistently
            if (value === null || value === undefined) return null;

            // Return the value as-is since casting is handled in SQL
            return value;
          })
        );

        return { columns, rows, totalRows };
      } catch (error) {
        console.error("Error fetching table data:", error);
        return { columns: [], rows: [], totalRows: 0 };
      } finally {
        await conn.close();
      }
    },
    [db, isReady]
  );

  // Function to process URL and load CSV data
  const processUrl = useCallback(
    async (csvUrl: string) => {
      if (!db || !isReady) {
        setState({
          status: "error",
          progress: "",
          error: "Database not ready",
        });
        return;
      }

      const startTime = Date.now();

      setState({
        status: "processing",
        progress: "Starting processing...",
        startTime: startTime,
      });

      const tableName = getTableNameFromUrl(csvUrl);
      try {
        setState((prev) => ({
          ...prev,
          status: "processing",
          progress: "Connecting to database...",
        }));

        const conn = await db.connect();

        try {
          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Checking if table already exists...",
          }));

          // Check if table already exists
          const tableExistsResult = await conn.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = '${tableName}'
          `);

          const tableExists =
            Number(tableExistsResult.getChildAt(0)?.get(0)) > 0;

          if (tableExists) {
            setState((prev) => ({
              ...prev,
              status: "processing",
              progress: "Validating existing table data...",
            }));

            try {
              // Verify the table is actually accessible and has data
              const testQuery = await conn.query(
                `SELECT COUNT(*) as count FROM ${tableName}`
              );
              const rowCount = Number(testQuery.getChildAt(0)?.get(0));

              if (rowCount === 0) {
                console.warn(
                  `Table '${tableName}' exists but is empty, will recreate`
                );
                await conn.query(`DROP TABLE ${tableName}`);
                throw new Error("Table is empty, recreating...");
              }

              setState((prev) => ({
                ...prev,
                status: "processing",
                progress: "Using existing table data...",
              }));

              // Fetch the data for display
              const result = await fetchTableData(tableName, { limit: 50 });

              const processingTime = Date.now() - startTime;

              setState({
                status: "completed",
                progress: "Data retrieved from existing table!",
                data: result || undefined,
                processingTime,
                csvParsingMethod: "existing table",
                warnings: [
                  `Using existing table: ${tableName} with ${rowCount} rows`,
                ],
              });
              return; // Exit early since we're using existing table
            } catch (validationError) {
              console.warn(
                "Existing table validation failed, recreating:",
                validationError
              );

              // Drop potentially corrupted table and recreate
              try {
                await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
              } catch (dropError) {
                console.warn("Could not drop corrupted table:", dropError);
                // Continue anyway, the CREATE TABLE will handle conflicts
              }

              setState((prev) => ({
                ...prev,
                status: "processing",
                progress: "Recreating table due to validation failure...",
              }));
            }
          }

          // Create new table from CSV
          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Downloading gzipped CSV file...",
          }));

          // Download the gzipped CSV file
          const response = await fetch(csvUrl, {
            method: "GET",
            headers: {
              "Accept-Encoding": "gzip, deflate, br",
              "Cache-Control": "no-cache",
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          if (!response.body) {
            throw new Error("Response body is empty");
          }

          // Process the response stream using pipeThrough and collect chunks immediately
          const chunks: Uint8Array[] = [];
          let totalSize = 0;

          const reader = response.body.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              if (value) {
                totalSize += value.length;
                chunks.push(value);
                setState((prev) => ({
                  ...prev,
                  status: "processing",
                  progress: `Downloaded ${(totalSize / 1024 / 1024).toFixed(
                    1
                  )} MB...`,
                }));
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Combine chunks efficiently
          const gzippedData = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            gzippedData.set(chunk, offset);
            offset += chunk.length;
          }

          // Register the gzipped CSV file directly in DuckDB
          await db.registerFileBuffer(`temp_${tableName}.csv`, gzippedData);

          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Parsing gzipped CSV data...",
          }));

          // Create table with automatic CSV detection from the gzipped file
          await conn.query(`
            CREATE TABLE ${tableName} AS 
            SELECT * FROM read_csv_auto('temp_${tableName}.csv')
          `);

          // Verify the table was created successfully
          const verifyResult = await conn.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = '${tableName}'
          `);

          const tableWasCreated =
            Number(verifyResult.getChildAt(0)?.get(0)) > 0;

          if (!tableWasCreated) {
            throw new Error(
              `Failed to create table '${tableName}'. Table creation did not complete successfully.`
            );
          }

          // Clean up the temporary file *before* checkpointing
          // This ensures file system operations are done before the commit
          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Cleaning up temporary data...",
          }));
          await db.dropFile(`temp_${tableName}.csv`);

          // Checkpoint to ensure data is persisted to OPFS
          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Persisting data to storage...",
          }));
          await conn.query("CHECKPOINT;");

          setState((prev) => ({
            ...prev,
            status: "processing",
            progress: "Fetching sample data...",
          }));

          // Fetch the data for display
          const result = await fetchTableData(tableName, { limit: 50 });

          const processingTime = Date.now() - startTime;

          setState({
            status: "completed",
            progress: "Processing completed successfully!",
            data: result || undefined,
            processingTime,
            csvParsingMethod: "gzip-aware auto-detection",
          });
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error("Processing error:", error);

        let errorMessage = "An unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;

          // Provide more helpful error messages for common issues
          if (errorMessage.includes("CORS")) {
            errorMessage =
              "CORS error: The remote server doesn't allow cross-origin requests. Try using a CORS proxy or a different URL.";
          } else if (errorMessage.includes("HTTP error")) {
            errorMessage = `Network error: ${errorMessage}. Please check the URL and try again.`;
          } else if (errorMessage.includes("Binder")) { // Binder errors often mean OPFS is in a bad state or file handles are bad
            errorMessage =
              "Database access error (Binder): The database operation could not be completed. This might be due to an issue with the underlying file system access or database state. Try clearing the database and starting over.";
          } else if (
            errorMessage.includes("Catalog") || // Catalog errors mean table/schema not found
            errorMessage.includes("does not exist")
          ) {
            errorMessage =
              "Database catalog error: A required table or schema was not found. This can happen if the table was not created correctly or was deleted. Please try processing the CSV again or clearing the database.";
            // Clear the state since the table reference is invalid
            setTimeout(() => {
              setState({
                status: "idle",
                progress: "",
                data: undefined,
              });
              setUrl(""); // Clear URL as it might be causing issues or table is gone
            }, 2000);
          }
        } else {
           errorMessage = String(error); // Handle non-Error objects
        }

        setState({
          status: "error",
          progress: "",
          error: errorMessage,
        });
      }
    },
    [db, isReady, fetchTableData, getTableNameFromUrl]
  );

  // Function to clear the database completely
  const clearDatabase = useCallback(async () => {
    const startTime = Date.now();

    setState({
      status: "processing",
      progress: "Clearing database...",
      startTime: startTime,
    });

    try {
      // Remove the OPFS database file
      const success = await removeOpfsFile();

      if (success) {
        setState((prev) => ({
          ...prev,
          status: "processing",
          progress: "Reinitializing database...",
        }));

        // Reinitialize the database
        await reinitializeInstance();

        const processingTime = Date.now() - startTime;

        // Clear all state data when database is reinitialized
        setState({
          status: "idle",
          progress: "Database cleared successfully!",
          processingTime,
          data: undefined, // Clear the data to prevent stale table references
        });

        // Clear the URL as well since the table no longer exists
        setUrl("");

        // Clear the UI state
        setTimeout(() => {
          setState({
            status: "idle",
            progress: "",
            data: undefined,
          });
        }, 3000);
      } else {
        setState({
          status: "error",
          progress: "",
          error:
            "Failed to clear database. Please refresh the page and try again.",
        });
      }
    } catch (error) {
      console.error("Error clearing database:", error);
      setState({
        status: "error",
        progress: "",
        error:
          error instanceof Error ? error.message : "Failed to clear database",
      });
    }
  }, [removeOpfsFile, reinitializeInstance]);

  // Effect to refresh table data when table state changes
  useEffect(
    () => {
      if (state.status === "completed" && state.data && url.trim()) {
        const tableName = getTableNameFromUrl(url);

        const updateTableData = async () => {
          const offset = (tableState.currentPage - 1) * tableState.pageSize;

          const startTime = Date.now();

          const result = await fetchTableData(tableName, {
            limit: tableState.pageSize,
            offset,
            searchTerm: debouncedSearchTerm,
            sortColumn: tableState.sortColumn,
            sortDirection: tableState.sortDirection,
          });

          const refreshTime = Date.now() - startTime;

          if (result) {
            setState((prev) => ({
              ...prev,
              data: result,
              processingTime: refreshTime,
            }));
          } else {
            // Table doesn't exist anymore, reset state
            console.warn(
              `Table '${tableName}' no longer exists, resetting state`
            );
            setState({
              status: "idle",
              progress: "",
              data: undefined,
            });
            setUrl("");
          }
        };

        updateTableData().catch((error) => {
          console.error("Error updating table data:", error);
          // If there's an error (like table not found), reset the state
          if (error.message && error.message.includes("does not exist")) {
            console.warn("Table no longer exists, resetting state");
            setState({
              status: "idle",
              progress: "",
              data: undefined,
            });
            setUrl("");
          }
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      debouncedSearchTerm,
      tableState.pageSize,
      tableState.currentPage,
      tableState.sortColumn,
      tableState.sortDirection,
      // Only include these dependencies to avoid infinite loops
      state.status,
      url,
      getTableNameFromUrl,
      fetchTableData,
    ]
  );

  // Effect to handle database reinitialization
  useEffect(() => {
    // If the database becomes not ready and we had data before, clear the state
    if (!isReady && state.status === "completed" && state.data) {
      console.log("Database is no longer ready, clearing component state");
      setState({
        status: "idle",
        progress: "",
        data: undefined,
      });
      setUrl("");
    }
  }, [isReady, state.status, state.data]);

  // Helper function to format processing time
  const formatProcessingTime = (timeMs: number) => {
    if (timeMs < 1000) {
      return `${timeMs}ms`;
    } else if (timeMs < 60000) {
      return `${(timeMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(timeMs / 60000);
      const seconds = Math.floor((timeMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  return (
    <div className={`space-y-6 ${className || ""}`}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          DuckDB CSV Processor
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Load and process gzipped CSV files directly from remote URLs using
          DuckDB.
        </p>

        {/* URL Input */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="csv-url"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              CSV URL (gzipped)
            </label>
            <input
              type="url"
              id="csv-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/data.csv.gz"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Example URLs */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Example URLs:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLE_URLS.map((exampleUrl, index) => (
                <button
                  key={index}
                  onClick={() => setUrl(exampleUrl)}
                  className="text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md border text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                >
                  {exampleUrl.length > 50
                    ? `${exampleUrl.substring(0, 50)}...`
                    : exampleUrl}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (url.trim()) {
                  processUrl(url);
                }
              }}
              disabled={
                isLoading ||
                !isReady ||
                state.status === "processing" ||
                !url.trim()
              }
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state.status === "processing" ? "Processing..." : "Process CSV"}
            </button>

            <button
              onClick={clearCurrentTable} // Use the new function here
              disabled={
                isLoading ||
                !isReady ||
                state.status === "processing" ||
                !url.trim() || // Also disable if no URL is set
                (state.status === "completed" && !state.data) // Disable if table for URL doesn't exist or was just cleared
              }
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear the table associated with the current CSV URL"
            >
              Clear Current Table
            </button>

            <button
              onClick={clearDatabase}
              disabled={isLoading || !isReady || state.status === "processing"}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear entire database - removes all tables and data"
            >
              Clear DB
            </button>
          </div>
        </div>

        {/* Status and Progress */}
        {(state.status === "processing" || state.status === "error") && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {state.status === "processing" && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {state.status === "error" ? "Error" : "Processing"}
                </span>
              </div>
              {state.status === "processing" && state.currentProcessingTime && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatProcessingTime(state.currentProcessingTime)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {state.error || state.progress}
            </p>
          </div>
        )}

        {/* Temporary Success Messages */}
        {state.status === "idle" && state.progress && state.processingTime && (
          <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Operation Complete
                </span>
              </div>
              <span className="text-xs text-green-600 dark:text-green-400">
                {formatProcessingTime(state.processingTime)}
              </span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              {state.progress}
            </p>
          </div>
        )}
      </div>

      {/* Processing Summary */}
      {state.status === "completed" && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Processing Complete
            </span>
          </div>
          <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
            <p>
              <strong>Processing Time:</strong>{" "}
              {state.processingTime
                ? formatProcessingTime(state.processingTime)
                : "N/A"}
            </p>
            <p>
              <strong>Parsing Method:</strong> {state.csvParsingMethod || "N/A"}
            </p>
            {state.warnings && state.warnings.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">Warnings:</p>
                <ul className="list-disc list-inside ml-2">
                  {state.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Table */}
      {state.status === "completed" && state.data && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  CSV Data ({state.data.totalRows.toLocaleString()} total rows)
                </h3>
              </div>

              {/* Search and Controls */}
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={tableState.searchTerm}
                  onChange={(e) => {
                    setTableState((prev) => ({
                      ...prev,
                      searchTerm: e.target.value,
                      currentPage: 1,
                    }));
                  }}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <select
                  value={tableState.pageSize}
                  onChange={(e) => {
                    setTableState((prev) => ({
                      ...prev,
                      pageSize: Number(e.target.value),
                      currentPage: 1,
                    }));
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {state.data.columns.map((column, index) => (
                    <th
                      key={index}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => {
                        const newDirection =
                          tableState.sortColumn === column &&
                          tableState.sortDirection === "asc"
                            ? "desc"
                            : "asc";
                        setTableState((prev) => ({
                          ...prev,
                          sortColumn: column,
                          sortDirection: newDirection,
                          currentPage: 1,
                        }));
                      }}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column}</span>
                        {tableState.sortColumn === column && (
                          <span className="text-blue-600 dark:text-blue-400">
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
                  <tr
                    key={rowIndex}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate"
                        title={String(cell || "")}
                      >
                        {cell !== null && cell !== undefined
                          ? String(cell)
                          : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {state.data && state.data.totalRows > tableState.pageSize && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing{" "}
                  {Math.min(
                    (tableState.currentPage - 1) * tableState.pageSize + 1,
                    state.data?.totalRows || 0
                  )}{" "}
                  to{" "}
                  {Math.min(
                    tableState.currentPage * tableState.pageSize,
                    state.data?.totalRows || 0
                  )}{" "}
                  of {(state.data?.totalRows || 0).toLocaleString()} results
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => {
                      setTableState((prev) => ({
                        ...prev,
                        currentPage: prev.currentPage - 1,
                      }));
                    }}
                    disabled={tableState.currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    Previous
                  </button>
                  {Array.from(
                    {
                      length: Math.min(
                        5,
                        Math.ceil(
                          (state.data?.totalRows || 0) / tableState.pageSize
                        )
                      ),
                    },
                    (_, i) => {
                      const totalPages = Math.ceil(
                        (state.data?.totalRows || 0) / tableState.pageSize
                      );
                      const startPage = Math.max(
                        1,
                        Math.min(tableState.currentPage - 2, totalPages - 4)
                      );
                      const pageNum = startPage + i;
                      return pageNum <= totalPages ? (
                        <button
                          key={pageNum}
                          onClick={() => {
                            setTableState((prev) => ({
                              ...prev,
                              currentPage: pageNum,
                            }));
                          }}
                          className={`px-3 py-1 text-sm border rounded-md ${
                            tableState.currentPage === pageNum
                              ? "bg-blue-600 text-white border-blue-600"
                              : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          }`}
                        >
                          {pageNum}
                        </button>
                      ) : null;
                    }
                  )}
                  <button
                    onClick={() => {
                      setTableState((prev) => ({
                        ...prev,
                        currentPage: prev.currentPage + 1,
                      }));
                    }}
                    disabled={
                      tableState.currentPage >=
                      Math.ceil(
                        (state.data?.totalRows || 0) / tableState.pageSize
                      )
                    }
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
