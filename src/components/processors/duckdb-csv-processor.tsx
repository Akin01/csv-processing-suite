"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useReducer,
  useMemo,
} from "react";
import { useDuckDB } from "@/providers/duckdb-provider";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { start } from "repl";

// --- TYPE DEFINITIONS ---

interface DuckDbCsvProcessorProps {
  className?: string;
  opfsPath?: string;
}

interface CsvData {
  columns: string[];
  rows: Record<string, any>[];
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

// --- CONSTANTS & HELPERS ---

const EXAMPLE_URLS = [
  "https://petadata.s3.ap-southeast-3.amazonaws.com/assets/kmp.csv.gz?response-content-disposition=inline&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEF4aDmFwLXNvdXRoZWFzdC0zIkcwRQIgUVVpGXfawFS4fcQ4V4TsjaC%2FX04wX71A%2FNeDRZGs%2FY4CIQDc9TYehPgyeM8pkFujYCZMP5xWh7NM561f5piG9cemJCrCAwi%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDAxOTY4MzA0NTgzMCIMx%2BWsP5Nl8J89DT%2B8KpYDNIPiabyqcFrc2Ob7mx7Wr1PRwqUqpKDUlg8zpdVOOJa%2B7zxYwrXtmbd8yiGSggNPAQzTQd7XcaPslViUgEdaSut8q6M2BiZH3nPTR%2B1Y%2BTcY7Z044aBx4ZP0NQ7jzf3ppezSRKg8U8LBquY5BtcPfHrfmDVsBsqGnMYW6rjE8wgJte%2BJwOi699zkilniU0j5FBXu3dpCP9PLpuErafZXTjTO%2FuOft%2FskwV6CzxB33tqHXlvc4dh9o6lzqVBYC5mz1%2FH6CHPfvCd%2FUhk0BzWCymu%2FGAB5nkHU%2FSGfQMmXjq1dXktwmom4bFRE1yO%2Fu4kdBKhHlYg5qL7j8mdcLJ8H9Cm73JOm0wg%2FuNndzgUQ8i8QiCAkL%2FSt5JdLwCTh4P1LJQhOnN6ynQU22m8sQZMolDz9LHRRYEngYdp9NfO%2BKq8cMCPysiiROkp5%2B%2FutFivkj00vKA7sWFS3dQpCoIaem2AI7EdgBmHJ05BAneyyUIBXzcGIj351y2dKu6G9v8GwCpgP3LnaBVI3miiyhIxUsvQWJseckjD%2FwtXCBjreAiK9yzC1Smhbtb9lz7pr7W%2BzGzODRHu52J14asDc%2BkuIkRhjE0WFH72qT56XNYUZGxYrocv582hD1NOylEAejSgDSBSikjQIwkZjKgn5j6zgzPp3R9Tnn2QRU8ZCRe%2FzWLKetz9KaZ5hxvdb1B8IIaYgYbgGOhvQN31e78UN3EBCRAUFC%2BLXcgMgRw%2FWX40JpbFBpRICen7Kd6XsdRsoUpurIqbByWTLt9C3jOOcjWFCUK415FfjQIrXfSbQ3wAY0MfGxtu4VrHwy4HDDJoLaRaQyugQj9s2cZw%2FDO3kYXw2mDevfocgJmkc8OgqeuG4AP7iBPHQiuuh1EPYpnyySaK27xKFWQvndqeGe5nDp2hQp8gspsn4PcAoozyJMbbwgGMTWqF0igE%2BmKse3ghdA7cnD%2BOSm9CtTOazAI2ZrsNXi%2FhyHLjW8dlh%2BjQRqWev%2BnNfxgtgg%2FgSqbrFtNaG&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAQJFJTOHDGX6QQAAS%2F20250620%2Fap-southeast-3%2Fs3%2Faws4_request&X-Amz-Date=20250620T132705Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=a3c9fc6b09eb2998a0d4dd654f1e449f6fd957257796276174cb4634f41f6889",
  "https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv.gz",
  "https://github.com/cs109/2014_data/raw/master/countries.csv.gz",
  "/api/test-csv?rows=1000",
];

const INITIAL_TABLE_STATE: TableState = {
  searchTerm: "",
  pageSize: 10,
  currentPage: 1,
  sortColumn: "",
  sortDirection: "asc",
};

async function downloadAndRegisterGzippedFile(
  csvUrl: string,
  dispatch: React.Dispatch<Action>
) {
  dispatch({
    type: "SET_PROGRESS",
    payload: { progress: "Downloading gzipped CSV file..." },
  });

  const response = await fetch(csvUrl, {
    headers: {
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Response body is not available for streaming.");
  }

  const reader = response.body.getReader();
  const contentLength = Number(response.headers.get("Content-Length"));
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedLength += value.length;

    if (contentLength > 0) {
      const percent = Math.round((receivedLength / contentLength) * 100);
      const receivedMb = (receivedLength / 1024 / 1024).toFixed(1);
      const totalMb = (contentLength / 1024 / 1024).toFixed(1);
      dispatch({
        type: "SET_PROGRESS",
        payload: {
          progress: `Decompress... ${percent}% - ${receivedMb}MB (gzip size: ${totalMb}MB)`,
        },
      });
    } else {
      dispatch({
        type: "SET_PROGRESS",
        payload: {
          progress: `Decompress... ${(receivedLength / 1024 / 1024).toFixed(
            1
          )} MB`,
        },
      });
    }
  }

  const gzippedData = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    gzippedData.set(chunk, position);
    position += chunk.length;
  }

  dispatch({
    type: "SET_PROGRESS",
    payload: {
      progress: `Decompressed ${(gzippedData.byteLength / 1024 / 1024).toFixed(
        1
      )} MB. Parsing...`,
    },
  });

  return gzippedData;
}

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const formatProcessingTime = (timeMs: number) => {
  if (timeMs < 1000) return `${timeMs}ms`;
  if (timeMs < 60000) return `${(timeMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const generatePagination = (
  currentPage: number,
  totalPages: number,
  siblingCount = 1
) => {
  const totalPageNumbers = siblingCount + 5;
  if (totalPages <= totalPageNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftDots = leftSiblingIndex > 2;
  const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

  if (!shouldShowLeftDots && shouldShowRightDots) {
    let leftItemCount = 3 + 2 * siblingCount;
    let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, "...", totalPages];
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    let rightItemCount = 3 + 2 * siblingCount;
    let rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1
    );
    return [1, "...", ...rightRange];
  }

  if (shouldShowLeftDots && shouldShowRightDots) {
    let middleRange = Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, i) => leftSiblingIndex + i
    );
    return [1, "...", ...middleRange, "...", totalPages];
  }
  return [];
};

// --- REDUCER FOR PROCESSING STATE ---

type Action =
  | { type: "START_PROCESSING"; payload: { startTime: number } }
  | { type: "SET_PROGRESS"; payload: { progress: string } }
  | {
      type: "COMPLETE";
      payload: {
        data: CsvData;
        processingTime: number;
        csvParsingMethod: string;
        warnings?: string[];
      };
    }
  | { type: "ERROR"; payload: { error: string } }
  | { type: "UPDATE_DATA"; payload: { data: CsvData; processingTime: number } }
  | { type: "CLEAR_TABLE_START"; payload: { tableName: string } }
  | { type: "CLEAR_TABLE_COMPLETE"; payload: { tableName: string } }
  | { type: "CLEAR_DB_START"; payload: { startTime: number } }
  | { type: "CLEAR_DB_COMPLETE"; payload: { processingTime: number } }
  | { type: "RESET" }
  | { type: "SET_CURRENT_TIME"; payload: { time: number } };

const initialState: ProcessingState = {
  status: "idle",
  progress: "",
};

function processingReducer(
  state: ProcessingState,
  action: Action
): ProcessingState {
  switch (action.type) {
    case "START_PROCESSING":
      return {
        ...initialState,
        status: "processing",
        progress: "Starting processing...",
        startTime: action.payload.startTime,
      };
    case "SET_PROGRESS":
      return { ...state, progress: action.payload.progress };
    case "COMPLETE":
      return {
        ...state,
        status: "completed",
        progress: "Processing completed successfully!",
        data: action.payload.data,
        processingTime: action.payload.processingTime,
        csvParsingMethod: action.payload.csvParsingMethod,
        warnings: action.payload.warnings,
        startTime: undefined,
        currentProcessingTime: undefined,
      };
    case "ERROR":
      return {
        ...initialState,
        status: "error",
        error: action.payload.error,
      };
    case "UPDATE_DATA":
      return {
        ...state,
        data: action.payload.data,
        processingTime: action.payload.processingTime,
      };
    case "CLEAR_TABLE_START":
      return {
        ...state,
        status: "processing",
        progress: `Clearing table '${action.payload.tableName}'...`,
        error: undefined,
      };
    case "CLEAR_TABLE_COMPLETE":
      return {
        ...initialState,
        status: "idle",
        progress: `Table '${action.payload.tableName}' cleared.`,
      };
    case "CLEAR_DB_START":
      return {
        ...initialState,
        status: "processing",
        progress: "Clearing database...",
        startTime: action.payload.startTime,
      };
    case "CLEAR_DB_COMPLETE":
      return {
        ...initialState,
        status: "idle",
        progress: "Database cleared successfully!",
        processingTime: action.payload.processingTime,
      };
    case "RESET":
      return initialState;
    case "SET_CURRENT_TIME":
      return { ...state, currentProcessingTime: action.payload.time };
    default:
      return state;
  }
}

// --- MAIN COMPONENT ---

export function DuckDbCsvProcessor({
  className,
  opfsPath = "opfs://petadata_duckdb.db",
}: DuckDbCsvProcessorProps) {
  const { db, isLoading, isReady, removeOpfsFile, reinitializeInstance } =
    useDuckDB(opfsPath);

  const [state, dispatch] = useReducer(processingReducer, initialState);
  const [url, setUrl] = useState("");
  const [tableState, setTableState] = useState<TableState>(INITIAL_TABLE_STATE);
  const debouncedSearchTerm = useDebounce(tableState.searchTerm, 300);

  // Effect for real-time processing time updates
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.status === "processing" && state.startTime) {
      interval = setInterval(() => {
        dispatch({
          type: "SET_CURRENT_TIME",
          payload: { time: Date.now() - (state.startTime || 0) },
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [state.status, state.startTime]);

  // --- DATA FETCHING & MANIPULATION CALLBACKS ---

  const getTableNameFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || "unknown";
      return (
        filename
          .replace(/\.(csv\.gz|csv)$/i, "")
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase() || "csv_data"
      );
    } catch {
      return "csv_data";
    }
  }, []);

  const fetchTableData = useCallback(
    async (
      tableName: string,
      options: Partial<TableState> = {}
    ): Promise<CsvData | null> => {
      if (!db || !isReady) return null;
      const conn = await db.connect();
      try {
        const {
          pageSize = 10,
          currentPage = 1,
          searchTerm = "",
          sortColumn = "",
          sortDirection = "asc",
        } = options;
        const offset = (currentPage - 1) * pageSize;

        const schemaResult = await conn.query(`
          PRAGMA table_info('${tableName}');
        `);

        if (schemaResult.numRows === 0) return null;

        const columns = Array.from(
          { length: schemaResult.numRows },
          (_, i) => schemaResult.getChildAt(1)?.get(i) as string
        );

        let whereClause = "";
        if (searchTerm.trim()) {
          const escapedSearchTerm = searchTerm.replace(/'/g, "''").trim();
          const searchConditions = columns
            .map(
              (col) =>
                `CAST("${col}" AS VARCHAR) ILIKE '%${escapedSearchTerm}%'`
            )
            .join(" OR ");
          whereClause = `WHERE ${searchConditions}`;
        }

        let orderByClause = "";
        if (sortColumn && columns.includes(sortColumn)) {
          orderByClause = `ORDER BY "${sortColumn}" ${
            sortDirection === "desc" ? "DESC" : "ASC"
          }`;
        }

        const countResult = await conn.query(
          `SELECT COUNT(*) FROM "${tableName}" ${whereClause}`
        );
        const totalRows = Number(countResult.getChildAt(0)?.get(0)) || 0;

        const dataResult = await conn.query(`
          SELECT * FROM "${tableName}"
          ${whereClause}
          ${orderByClause}
          LIMIT ${pageSize} OFFSET ${offset}
        `);

        const rows = dataResult.toArray().map((row) => row.toJSON());

        return { columns, rows, totalRows };
      } catch (error) {
        // console.error("Error fetching table data:", error);
        if (
          error instanceof Error &&
          error.message.includes("does not exist")
        ) {
          return null;
        }
        return { columns: [], rows: [], totalRows: 0 };
      } finally {
        await conn.close();
      }
    },
    [db, isReady]
  );

  const processUrl = useCallback(
    async (csvUrl: string) => {
      if (!db || !isReady) {
        dispatch({ type: "ERROR", payload: { error: "Database not ready" } });
        return;
      }

      const startTime = Date.now();
      dispatch({ type: "START_PROCESSING", payload: { startTime } });
      const tableName = getTableNameFromUrl(csvUrl);

      try {
        const conn = await db.connect();
        try {
          dispatch({
            type: "SET_PROGRESS",
            payload: { progress: "Checking for existing table..." },
          });
          const existingData = await fetchTableData(tableName, {
            pageSize: tableState.pageSize,
          });

          if (existingData && existingData.totalRows > 0) {
            dispatch({
              type: "COMPLETE",
              payload: {
                data: existingData,
                processingTime: Date.now() - startTime,
                csvParsingMethod: "existing table",
                warnings: [
                  `Using cached table: ${tableName} (${existingData.totalRows} rows)`,
                ],
              },
            });
            return;
          }

          await db.registerFileURL(
            `temp_${tableName}.csv.gz`,
            csvUrl,
            DuckDBDataProtocol.HTTP,
            true
          );

          dispatch({
            type: "SET_PROGRESS",
            payload: {
              progress: `Creating table '${tableName}' from remote file. This may take a while...`,
            },
          });

          await conn.query(`
            CREATE OR REPLACE TABLE "${tableName}" AS
            SELECT * FROM 'temp_${tableName}.csv.gz';
            `);

          dispatch({
            type: "SET_PROGRESS",
            payload: { progress: "Finalizing table and cleaning up..." },
          });

          await db.dropFile(`temp_${tableName}.csv.gz`);
          await conn.query("CHECKPOINT;");

          dispatch({
            type: "SET_PROGRESS",
            payload: { progress: "Fetching sample data..." },
          });
          const result = await fetchTableData(tableName, {
            pageSize: tableState.pageSize,
          });

          if (result) {
            dispatch({
              type: "COMPLETE",
              payload: {
                data: result,
                processingTime: Date.now() - startTime,
                csvParsingMethod: "gzip-aware auto-detection",
              },
            });
          } else {
            throw new Error("Failed to fetch data after table creation.");
          }
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error("Processing error:", error);
        let errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        if (errorMessage.includes("CORS")) {
          errorMessage =
            "CORS error: The remote server doesn't allow cross-origin requests.";
        } else if (errorMessage.includes("Catalog")) {
          errorMessage =
            "Database catalog error. Please clear the database and reload your data.";
          setTimeout(() => {
            dispatch({ type: "RESET" });
            setUrl("");
          }, 2000);
        }
        dispatch({ type: "ERROR", payload: { error: errorMessage } });
      }
    },
    [db, isReady, getTableNameFromUrl, fetchTableData, tableState.pageSize]
  );

  const clearCurrentTable = useCallback(async () => {
    if (!db || !isReady || !url) return;
    const tableName = getTableNameFromUrl(url);
    dispatch({ type: "CLEAR_TABLE_START", payload: { tableName } });
    const conn = await db.connect();
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tableName}";`);
      dispatch({ type: "CLEAR_TABLE_COMPLETE", payload: { tableName } });
      setTableState(INITIAL_TABLE_STATE);
    } catch (err: any) {
      dispatch({
        type: "ERROR",
        payload: {
          error: `Failed to clear table '${tableName}': ${err.message}`,
        },
      });
    } finally {
      await conn.close();
    }
  }, [db, isReady, url, getTableNameFromUrl]);

  const clearDatabase = useCallback(async () => {
    const startTime = Date.now();
    dispatch({ type: "CLEAR_DB_START", payload: { startTime } });
    try {
      await removeOpfsFile();
      await reinitializeInstance();
      dispatch({
        type: "CLEAR_DB_COMPLETE",
        payload: { processingTime: Date.now() - startTime },
      });
      setUrl("");
      setTableState(INITIAL_TABLE_STATE);
      setTimeout(() => dispatch({ type: "RESET" }), 3000);
    } catch (error) {
      dispatch({
        type: "ERROR",
        payload: {
          error:
            error instanceof Error ? error.message : "Failed to clear database",
        },
      });
    }
  }, [removeOpfsFile, reinitializeInstance]);

  // Effect to refresh table data on state changes (pagination, search, sort)
  useEffect(() => {
    if (state.status !== "completed" || !url) return;

    const tableName = getTableNameFromUrl(url);
    let isMounted = true;

    const updateTableData = async () => {
      const startTime = performance.now();
      const result = await fetchTableData(tableName, {
        ...tableState,
        searchTerm: debouncedSearchTerm,
      });

      if (!isMounted) return;

      if (result) {
        dispatch({
          type: "UPDATE_DATA",
          payload: {
            data: result,
            processingTime: performance.now() - startTime,
          },
        });
      } else {
        console.warn(`Table '${tableName}' not found, resetting state.`);
        dispatch({ type: "RESET" });
        setUrl("");
        setTableState(INITIAL_TABLE_STATE);
      }
    };

    updateTableData();

    return () => {
      isMounted = false;
    };
  }, [
    debouncedSearchTerm,
    tableState,
    state.status,
    url,
    getTableNameFromUrl,
    fetchTableData,
  ]);

  // Effect to reset state if DB becomes unavailable
  useEffect(() => {
    if (!isReady && state.status === "completed") {
      dispatch({ type: "RESET" });
      setUrl("");
    }
  }, [isReady, state.status]);

  return (
    <div className={`space-y-6 ${className || ""}`}>
      <ControlPanel
        url={url}
        setUrl={setUrl}
        state={state}
        isReady={isReady}
        isLoading={isLoading}
        onProcess={processUrl}
        onClearTable={clearCurrentTable}
        onClearDb={clearDatabase}
      />

      <StatusDisplay state={state} />

      {state.status === "completed" && state.data && (
        <DataTable
          data={state.data}
          tableState={tableState}
          setTableState={setTableState}
          summary={{
            processingTime: state.processingTime,
            csvParsingMethod: state.csvParsingMethod,
            warnings: state.warnings,
          }}
        />
      )}
    </div>
  );
}

// --- UI SUB-COMPONENTS ---

const ControlPanel = React.memo(function ControlPanel({
  url,
  setUrl,
  state,
  isReady,
  isLoading,
  onProcess,
  onClearTable,
  onClearDb,
}: {
  url: string;
  setUrl: (url: string) => void;
  state: ProcessingState;
  isReady: boolean;
  isLoading: boolean;
  onProcess: (url: string) => void;
  onClearTable: () => void;
  onClearDb: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        DuckDB CSV Processor
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Load and process gzipped CSV files directly from remote URLs using
        DuckDB.
      </p>
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Example URLs:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLE_URLS.map((exampleUrl) => (
              <button
                key={exampleUrl}
                onClick={() => setUrl(exampleUrl)}
                className="text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md border text-blue-600 dark:text-blue-400 truncate"
              >
                {exampleUrl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => url.trim() && onProcess(url)}
            disabled={
              isLoading ||
              !isReady ||
              state.status === "processing" ||
              !url.trim()
            }
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state.status === "processing" ? "Processing..." : "Process CSV"}
          </button>
          <button
            onClick={onClearTable}
            disabled={
              isLoading ||
              !isReady ||
              state.status === "processing" ||
              !url.trim() ||
              !state.data
            }
            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear the table for the current URL"
          >
            Clear Current Table
          </button>
          <button
            onClick={onClearDb}
            disabled={isLoading || !isReady || state.status === "processing"}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear entire database"
          >
            Clear DB
          </button>
        </div>
      </div>
    </div>
  );
});

const StatusDisplay = React.memo(function StatusDisplay({
  state,
}: {
  state: ProcessingState;
}) {
  if (state.status === "idle" && state.progress && state.processingTime) {
    return (
      <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {state.progress}
          </p>
          <span className="text-xs text-green-600 dark:text-green-400">
            {formatProcessingTime(state.processingTime)}
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "processing" || state.status === "error") {
    return (
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
    );
  }

  return null;
});

const DataTable = React.memo(function DataTable({
  data,
  tableState,
  setTableState,
  summary,
}: {
  data: CsvData;
  tableState: TableState;
  setTableState: React.Dispatch<React.SetStateAction<TableState>>;
  summary: Pick<
    ProcessingState,
    "processingTime" | "csvParsingMethod" | "warnings"
  >;
}) {
  const totalPages = Math.ceil(data.totalRows / tableState.pageSize);
  const paginationRange = useMemo(
    () => generatePagination(tableState.currentPage, totalPages),
    [tableState.currentPage, totalPages]
  );

  const handleSort = (column: string) => {
    const isAsc =
      tableState.sortColumn === column && tableState.sortDirection === "asc";
    setTableState((prev) => ({
      ...prev,
      sortColumn: column,
      sortDirection: isAsc ? "desc" : "asc",
      currentPage: 1,
    }));
  };

  return (
    <>
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
          <p>
            <strong>Time to display:</strong>{" "}
            {summary.processingTime
              ? formatProcessingTime(summary.processingTime)
              : "N/A"}
          </p>
          <p>
            <strong>Parsing Method:</strong> {summary.csvParsingMethod || "N/A"}
          </p>
          {summary.warnings?.map((warning, i) => (
            <p key={i} className="text-yellow-600 dark:text-yellow-400">
              <strong>Warning:</strong> {warning}
            </p>
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Data ({data.totalRows.toLocaleString()} rows)
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={tableState.searchTerm}
              onChange={(e) =>
                setTableState((prev) => ({
                  ...prev,
                  searchTerm: e.target.value,
                  currentPage: 1,
                }))
              }
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <select
              value={tableState.pageSize}
              onChange={(e) =>
                setTableState((prev) => ({
                  ...prev,
                  pageSize: Number(e.target.value),
                  currentPage: 1,
                }))
              }
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {data.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{col}</span>
                      {tableState.sortColumn === col && (
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
              {data.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {Object.keys(row).map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate"
                      title={String(row[cell] ?? "")}
                    >
                      {String(row[cell] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Page {tableState.currentPage} of {totalPages}
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() =>
                  setTableState((p) => ({
                    ...p,
                    currentPage: p.currentPage - 1,
                  }))
                }
                disabled={tableState.currentPage === 1}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
              >
                Prev
              </button>
              {paginationRange.map((page, index) =>
                page === "..." ? (
                  <span key={index} className="px-3 py-1">
                    ...
                  </span>
                ) : (
                  <button
                    key={index}
                    onClick={() =>
                      setTableState((p) => ({
                        ...p,
                        currentPage: page as number,
                      }))
                    }
                    className={`px-3 py-1 text-sm border rounded-md ${
                      tableState.currentPage === page
                        ? "bg-blue-600 text-white border-blue-600"
                        : ""
                    }`}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                onClick={() =>
                  setTableState((p) => ({
                    ...p,
                    currentPage: p.currentPage + 1,
                  }))
                }
                disabled={tableState.currentPage >= totalPages}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
});
