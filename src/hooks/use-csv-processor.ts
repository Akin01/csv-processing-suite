"use client";

import { useState, useCallback } from "react";
import {
  CsvProcessor,
  CsvProcessorOptions,
  ProcessProgress,
  CsvProcessorResult,
} from "@/lib/csv-processor";

export interface UseCsvProcessorReturn {
  isProcessing: boolean;
  progress: ProcessProgress | null;
  result: CsvProcessorResult | null;
  error: string | null;
  processingTime: number | null;
  processUrl: (url: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  estimateMemoryUsage: (
    rowCount: number,
    columnCount: number,
    avgFieldSize?: number
  ) => {
    estimatedMB: number;
    recommendation: "safe" | "caution" | "warning";
  };
}

export function useCsvProcessor(
  options?: CsvProcessorOptions
): UseCsvProcessorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [result, setResult] = useState<CsvProcessorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [processor, setProcessor] = useState<CsvProcessor | null>(null);

  const processUrl = useCallback(
    async (url: string) => {
      try {
        setIsProcessing(true);
        setError(null);
        setResult(null);
        setProgress(null);
        setProcessingTime(null);

        const csvProcessor = new CsvProcessor(options);
        setProcessor(csvProcessor);

        // Always use streaming processing
        const result = await csvProcessor.processGzippedCsvFromUrl(
          url,
          (progressUpdate) => {
            setProgress(progressUpdate);
          }
        );

        setResult(result);
        if (result.processingTime) {
          setProcessingTime(result.processingTime);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setIsProcessing(false);
        setProcessor(null);
      }
    },
    [options]
  );

  const cancel = useCallback(() => {
    if (processor) {
      processor.cancel();
      setIsProcessing(false);
      setProcessor(null);
      setResult(null);
      setProcessingTime(null);
      setError("Processing was cancelled");
    }
  }, [processor]);

  const reset = useCallback(() => {
    if (processor) {
      processor.cancel();
    }
    setIsProcessing(false);
    setProgress(null);
    setResult(null);
    setError(null);
    setProcessingTime(null);
    setProcessor(null);
  }, [processor]);

  const estimateMemoryUsage = useCallback(
    (rowCount: number, columnCount: number, avgFieldSize: number = 20) => {
      const csvProcessor = new CsvProcessor(options);
      return csvProcessor.estimateMemoryUsage(
        rowCount,
        columnCount,
        avgFieldSize
      );
    },
    [options]
  );

  return {
    isProcessing,
    progress,
    result,
    error,
    processingTime,
    processUrl,
    cancel,
    reset,
    estimateMemoryUsage,
  };
}
