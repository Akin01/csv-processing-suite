import Papa from 'papaparse';

export interface CsvStreamProcessorOptions {
  url: string;
  tableName: string;
  batchSize?: number;
  onProgress?: (progress: string) => void;
  onBatch?: (batch: Record<string, unknown>[], headers: string[]) => Promise<void>;
  onComplete?: (rowCount: number) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export interface CsvColumn {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date';
}

export class CsvStreamProcessor {
  private batchSize: number;
  private batch: Record<string, unknown>[] = [];
  private headers: string[] = [];
  private originalHeaders: string[] = [];
  private rowCount = 0;
  private aborted = false;

  constructor(private options: CsvStreamProcessorOptions) {
    this.batchSize = options.batchSize || 1000;
    
    // Listen for abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.aborted = true;
      });
    }
  }

  async process(): Promise<void> {
    try {
      this.options.onProgress?.(`Fetching ${this.options.url}...`);
      
      // Fetch with gzip support and streaming
      const response = await fetch(this.options.url, {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/csv, application/octet-stream, */*',
        },
        signal: this.options.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      this.options.onProgress?.('Processing stream with automatic decompression...');

      // Process stream directly without loading all into memory
      await this.processStream(response.body);

    } catch (error) {
      this.options.onError?.(error as Error);
      throw error;
    }
  }

  private async processStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let headersParsed = false;

    try {
      while (true) {
        if (this.aborted) {
          throw new Error('Processing aborted');
        }

        const { done, value } = await reader.read();
        
        if (done) {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            await this.processChunk(buffer);
          }
          break;
        }

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the incomplete line in buffer

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim()) {
            await this.processLine(line, !headersParsed);
            if (!headersParsed) {
              headersParsed = true;
            }
          }
        }
      }

      // Process final batch
      await this.processFinalBatch();
      this.options.onComplete?.(this.rowCount);

    } finally {
      reader.releaseLock();
    }
  }

  private async processLine(line: string, isHeader: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse(line, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: !isHeader, // Don't type headers
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
              console.warn('CSV parsing warnings:', results.errors);
            }

            const data = results.data[0] as string[] | Record<string, unknown>;
            
            if (isHeader && Array.isArray(data)) {
              // Initialize headers
              this.originalHeaders = data as string[];
              this.headers = this.sanitizeHeaders(this.originalHeaders);
              this.options.onProgress?.(`Initialized with ${this.headers.length} columns`);
            } else if (this.headers.length > 0 && Array.isArray(data)) {
              // Convert array to object using headers
              const rowData: Record<string, unknown> = {};
              this.headers.forEach((header, index) => {
                rowData[header] = data[index] || null;
              });

              this.batch.push(rowData);
              this.rowCount++;

              if (this.batch.length >= this.batchSize) {
                await this.processBatch();
              }
            }

            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: (error: Error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        }
      });
    });
  }

  private async processChunk(chunk: string): Promise<void> {
    // This method handles any remaining processing logic for chunks
    if (chunk.trim() && this.headers.length > 0) {
      await this.processLine(chunk, false);
    }
  }

  private async processBatch() {
    if (this.batch.length === 0) return;

    this.options.onProgress?.(`Processing batch: rows ${this.rowCount - this.batch.length + 1}-${this.rowCount}`);
    
    try {
      await this.options.onBatch?.(this.batch, this.headers);
      this.batch = [];
    } catch (error) {
      throw new Error(`Batch processing failed: ${(error as Error).message}`);
    }
  }

  private async processFinalBatch() {
    if (this.batch.length > 0) {
      await this.processBatch();
    }
  }

  private sanitizeHeaders(originalHeaders: string[]): string[] {
    const sanitized = originalHeaders.map((header, index) => {
      if (!header || header.trim() === '') {
        return `col_${index}`;
      }
      
      return header
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^[^a-zA-Z_]+|[^a-zA-Z0-9_]+$/g, '')
        .substring(0, 63) // PostgreSQL identifier limit
        .toLowerCase();
    });

    // Ensure uniqueness
    const headerCounts: Record<string, number> = {};
    return sanitized.map((header, index) => {
      let finalHeader = header || `col_${index}`;
      headerCounts[finalHeader] = (headerCounts[finalHeader] || 0) + 1;
      
      if (headerCounts[finalHeader] > 1) {
        finalHeader = `${finalHeader}_${headerCounts[finalHeader] - 1}`;
      }
      
      return finalHeader;
    });
  }

  // Infer column types from sample data
  static inferColumnTypes(sampleRows: Record<string, unknown>[], headers: string[]): CsvColumn[] {
    return headers.map(header => {
      const values = sampleRows.map(row => row[header]).filter(val => val != null && val !== '');
      
      if (values.length === 0) {
        return { name: header, type: 'text' };
      }

      // Check if all values are numbers
      const isNumber = values.every(val => !isNaN(Number(val)));
      if (isNumber) {
        return { name: header, type: 'number' };
      }

      // Check if all values are booleans
      const isBoolean = values.every(val => 
        typeof val === 'boolean' || 
        (typeof val === 'string' && ['true', 'false', '1', '0'].includes(val.toLowerCase()))
      );
      if (isBoolean) {
        return { name: header, type: 'boolean' };
      }

      // Check if values look like dates
      const isDate = values.some(val => {
        const dateVal = new Date(val as string);
        return !isNaN(dateVal.getTime()) && String(val).length > 8;
      });
      if (isDate) {
        return { name: header, type: 'date' };
      }

      return { name: header, type: 'text' };
    });
  }
}

// Utility to get table name from URL
export function getTableNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'unknown_csv';
    const nameWithoutGz = filename.replace(/\.csv\.gz$/i, '');
    const nameWithoutCsv = nameWithoutGz.replace(/\.csv$/i, '');
    const safeName = nameWithoutCsv.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return safeName || 'csv_data';
  } catch {
    return 'csv_data';
  }
}
