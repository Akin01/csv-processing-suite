import Papa from "papaparse";
import { formatBytes } from "./utils";

// Types and Interfaces
export interface ProcessProgress {
  step: ProcessingStep;
  progress: number;
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
  startTime?: number;
  duration?: number;
  memoryUsage?: MemoryUsage;
}

export interface MemoryUsage {
  estimatedMB: number;
  currentRows: number;
  currentColumns: number;
  recommendation: "safe" | "caution" | "warning";
  bufferSizeMB?: number;
}

export interface CsvProcessorResult {
  data: Record<string, unknown>[];
  meta: Papa.ParseMeta;
  errors: Papa.ParseError[];
  processingTime?: number;
}

export interface CsvProcessorOptions {
  /** Maximum download size in bytes (default: 200MB) */
  maxDownloadSize?: number;
  /** Download progress update throttle in milliseconds (default: 200ms) */
  downloadProgressThrottle?: number;
  /** Batch size for streaming processing (default: 1000 lines) */
  batchSize?: number;
  /** Progress update throttle in milliseconds (default: 100ms) */
  progressThrottle?: number;
  /** Timeout for processing in milliseconds (default: 5 minutes) */
  processingTimeout?: number;
}

export type ProcessingStep =
  | "fetch"
  | "download"
  | "stream"
  | "parse"
  | "complete";

// Constants
const DEFAULT_OPTIONS = {
  maxDownloadSize: 200 * 1024 * 1024, // 200MB
  downloadProgressThrottle: 200, // 200ms
  batchSize: 1000, // 1000 lines
  progressThrottle: 100, // 100ms
  processingTimeout: 5 * 60 * 1000, // 5 minutes
} as const;

const MEMORY_THRESHOLDS = {
  SAFE: 100, // MB
  CAUTION: 300, // MB
} as const;

// Custom Error Classes
export class CsvProcessingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "CsvProcessingError";
  }
}

export class MemoryLimitError extends CsvProcessingError {
  constructor(size: number, limit: number) {
    super(
      `File too large (${formatBytes(size)}) exceeds limit of ${formatBytes(
        limit
      )}`
    );
    this.name = "MemoryLimitError";
  }
}

export class TimeoutError extends CsvProcessingError {
  constructor(timeout: number) {
    super(`Processing timed out after ${timeout}ms`);
    this.name = "TimeoutError";
  }
}

// Utility Functions
class ProcessingUtils {
  static calculateMemoryUsage(
    rowCount: number,
    columnCount: number,
    avgFieldSize: number = 20
  ): MemoryUsage {
    const estimatedBytes = rowCount * columnCount * avgFieldSize * 2; // JS object overhead
    const estimatedMB = estimatedBytes / (1024 * 1024);

    let recommendation: MemoryUsage["recommendation"] = "safe";
    if (estimatedMB > MEMORY_THRESHOLDS.SAFE) recommendation = "caution";
    if (estimatedMB > MEMORY_THRESHOLDS.CAUTION) recommendation = "warning";

    return {
      estimatedMB,
      recommendation,
      currentRows: rowCount,
      currentColumns: columnCount,
    };
  }
}

// Streaming Processor
class StreamingProcessor {
  private processedResults: Record<string, unknown>[] = [];
  private allErrors: Papa.ParseError[] = [];
  private finalMeta: Papa.ParseMeta | null = null;
  private rowCount = 0;
  private columnCount = 0;
  private lastProgressUpdate = Date.now();
  private downloadedBytes = 0;
  private totalDataSize = 0;
  private avgRowSize = 100;

  constructor(
    private options: Required<CsvProcessorOptions>,
    private onProgress?: (progress: ProcessProgress) => void
  ) {}

  async processTextStream(
    textStream: ReadableStream<string>,
    response: Response,
    startTime?: number
  ): Promise<CsvProcessorResult> {
    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    this.onProgress?.({
      step: "stream",
      progress: 20,
      message: "Setting up streaming pipeline...",
    });

    try {
      await this.processStreamChunks(textStream, totalBytes);
      return this.buildResult(startTime);
    } catch (error) {
      throw new CsvProcessingError(
        `Stream processing failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async processStreamChunks(
    textStream: ReadableStream<string>,
    totalBytes: number
  ): Promise<void> {
    const reader = textStream.getReader();
    let partialLine = "";
    let headerProcessed = false;
    let csvFields: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (partialLine.trim()) {
            this.processCSVLines([partialLine], headerProcessed, csvFields);
          }
          break;
        }

        this.updateDownloadProgress(value, totalBytes);

        const lines = this.splitTextIntoLines(partialLine + value);
        partialLine = lines.partial;

        if (lines.complete.length > 0) {
          const result = this.processCSVLines(
            lines.complete,
            headerProcessed,
            csvFields
          );
          if (!headerProcessed && result.headerProcessed) {
            headerProcessed = true;
            csvFields = result.fields;
            this.columnCount = csvFields.length;
            this.reportHeadersDetected();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private splitTextIntoLines(text: string): {
    complete: string[];
    partial: string;
  } {
    const lines = text.split("\n");
    const partial = lines.pop() || "";
    return { complete: lines, partial };
  }

  private updateDownloadProgress(value: string, totalBytes: number): void {
    this.downloadedBytes += new Blob([value]).size;

    if (
      Date.now() - this.lastProgressUpdate >
        this.options.downloadProgressThrottle &&
      totalBytes > 0
    ) {
      const downloadProgress = Math.min(
        50,
        30 + (this.downloadedBytes / totalBytes) * 20
      );

      this.onProgress?.({
        step: "download",
        progress: downloadProgress,
        message: `Streaming... ${formatBytes(this.downloadedBytes)}${
          totalBytes ? ` of ${formatBytes(totalBytes)}` : ""
        }`,
        downloadedBytes: this.downloadedBytes,
        totalBytes,
      });
      this.lastProgressUpdate = Date.now();
    }
  }

  private processCSVLines(
    lines: string[],
    headerProcessed: boolean,
    fields: string[]
  ): { headerProcessed: boolean; fields: string[] } {
    const csvText = lines.join("\n");
    let currentHeaderProcessed = headerProcessed;
    let currentFields = fields;

    try {
      Papa.parse<Record<string, unknown>>(csvText, {
        header: headerProcessed,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header: string) => header.trim(),
        worker: false,
        complete: (results) => {
          const processed = this.handleParseResults(results, headerProcessed);
          if (processed.headerProcessed) {
            currentHeaderProcessed = true;
            currentFields = processed.fields;
          }
        },
        error: (error: Error) => {
          this.handleParseError(error);
        },
      });
    } catch (error) {
      console.warn("Error setting up PapaParse for chunk:", error);
    }

    return { headerProcessed: currentHeaderProcessed, fields: currentFields };
  }

  private handleParseResults(
    results: Papa.ParseResult<Record<string, unknown>>,
    headerProcessed: boolean
  ): { headerProcessed: boolean; fields: string[] } {
    let currentHeaderProcessed = headerProcessed;
    let currentFields: string[] = [];

    try {
      if (!headerProcessed && results.meta?.fields) {
        currentHeaderProcessed = true;
        currentFields = results.meta.fields;
        this.finalMeta = results.meta;
      }

      if (results.data?.length) {
        const validRows = this.filterValidRows(results.data);
        if (validRows.length > 0) {
          this.addProcessedRows(validRows);
        }
      }

      if (results.errors?.length) {
        this.allErrors.push(...results.errors);
      }

      if (results.meta) {
        this.finalMeta = results.meta;
      }
    } catch (error) {
      console.warn("Error processing CSV chunk:", error);
    }

    return { headerProcessed: currentHeaderProcessed, fields: currentFields };
  }

  private filterValidRows(
    rows: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    return rows.filter(
      (row) => row && typeof row === "object" && Object.keys(row).length > 0
    );
  }

  private addProcessedRows(validRows: Record<string, unknown>[]): void {
    this.processedResults.push(...validRows);
    this.rowCount += validRows.length;

    this.totalDataSize += JSON.stringify(validRows).length;
    this.avgRowSize = this.totalDataSize / this.rowCount;

    this.updateProcessingProgress();
  }

  private updateProcessingProgress(): void {
    const now = Date.now();
    if (now - this.lastProgressUpdate > this.options.progressThrottle) {
      const progress = Math.min(
        95,
        60 + Math.min(35, Math.log10(this.rowCount + 1) * 5)
      );
      const memoryUsage = this.calculateMemoryUsage();

      const message =
        memoryUsage.recommendation === "warning"
          ? `⚠️ High memory usage! ${this.rowCount.toLocaleString()} rows (${memoryUsage.estimatedMB.toFixed(
              1
            )}MB)`
          : `Processing... ${this.rowCount.toLocaleString()} rows (${memoryUsage.estimatedMB.toFixed(
              1
            )}MB)`;

      this.onProgress?.({
        step: "parse",
        progress,
        message,
        memoryUsage,
      });
      this.lastProgressUpdate = now;
    }
  }

  private handleParseError(error: Papa.ParseError | Error): void {
    const parseError: Papa.ParseError =
      error instanceof Error
        ? {
            type: "Quotes",
            code: "UndetectableDelimiter",
            message: error.message,
            row: 0,
          }
        : error;

    this.allErrors.push(parseError);
  }

  private reportHeadersDetected(): void {
    this.onProgress?.({
      step: "parse",
      progress: 55,
      message: `Headers detected: ${this.columnCount} columns`,
    });
  }

  private calculateMemoryUsage(): MemoryUsage {
    return ProcessingUtils.calculateMemoryUsage(
      this.processedResults.length,
      this.columnCount,
      this.avgRowSize
    );
  }

  private buildResult(startTime?: number): CsvProcessorResult {
    const processingTime = startTime ? Date.now() - startTime : 0;
    const finalMemoryUsage = this.calculateMemoryUsage();

    this.onProgress?.({
      step: "complete",
      progress: 100,
      message: `Completed! ${this.processedResults.length.toLocaleString()} rows processed in ${(
        processingTime / 1000
      ).toFixed(1)}s`,
      startTime,
      duration: processingTime,
      memoryUsage: finalMemoryUsage,
    });

    return {
      data: this.processedResults,
      meta: this.finalMeta || {
        fields: [],
        delimiter: ",",
        linebreak: "\n",
        aborted: false,
        truncated: false,
        cursor: 0,
      },
      errors: this.allErrors,
      processingTime,
    };
  }
}

// Main CsvProcessor Class
export class CsvProcessor {
  private abortController: AbortController | null = null;
  private readonly options: Required<CsvProcessorOptions>;

  constructor(options: CsvProcessorOptions = {}) {
    this.options = {
      maxDownloadSize:
        options.maxDownloadSize ?? DEFAULT_OPTIONS.maxDownloadSize,
      downloadProgressThrottle:
        options.downloadProgressThrottle ??
        DEFAULT_OPTIONS.downloadProgressThrottle,
      batchSize: options.batchSize ?? DEFAULT_OPTIONS.batchSize,
      progressThrottle:
        options.progressThrottle ?? DEFAULT_OPTIONS.progressThrottle,
      processingTimeout:
        options.processingTimeout ?? DEFAULT_OPTIONS.processingTimeout,
    };
  }

  /**
   * Processes a gzipped CSV from a URL with streaming
   */
  async processGzippedCsvFromUrl(
    url: string,
    onProgress?: (progress: ProcessProgress) => void
  ): Promise<CsvProcessorResult> {
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      const response = await this.fetchGzippedFile(url, onProgress, startTime);
      const textStream = this.createTextStream(response);
      const processor = new StreamingProcessor(this.options, onProgress);

      return await processor.processTextStream(textStream, response, startTime);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new CsvProcessingError("Processing was cancelled");
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancels the current processing operation
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Estimates memory usage for a CSV file
   */
  estimateMemoryUsage(
    rowCount: number,
    columnCount: number,
    avgFieldSize: number = 20
  ): MemoryUsage {
    return ProcessingUtils.calculateMemoryUsage(
      rowCount,
      columnCount,
      avgFieldSize
    );
  }

  private async fetchGzippedFile(
    url: string,
    onProgress?: (progress: ProcessProgress) => void,
    startTime?: number
  ): Promise<Response> {
    onProgress?.({
      step: "fetch",
      progress: 0,
      message: "Starting download...",
      startTime,
    });

    if (!this.abortController) {
      throw new CsvProcessingError("Abort controller not initialized");
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new CsvProcessingError(
        `HTTP error! status: ${response.status} - ${response.statusText}`
      );
    }

    if (!response.body) {
      throw new CsvProcessingError("Response body is empty");
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    onProgress?.({
      step: "fetch",
      progress: 10,
      message: "Download started...",
      totalBytes,
    });

    return response;
  }

  private createTextStream(response: Response): ReadableStream<string> {
    try {
      const contentEncoding = response.headers.get("content-encoding");
      const isGzipEncoded = contentEncoding?.includes("gzip");

      if (isGzipEncoded && "DecompressionStream" in window) {
        // Use native DecompressionStream for better performance
        const DecompressionStream = (
          window as typeof window & {
            DecompressionStream: new (format: string) => TransformStream;
          }
        ).DecompressionStream;

        return response
          .body!.pipeThrough(new DecompressionStream("gzip"))
          .pipeThrough(new TextDecoderStream());
      }

      return response.body!.pipeThrough(new TextDecoderStream());
    } catch {
      return response.body!.pipeThrough(new TextDecoderStream());
    }
  }
}
