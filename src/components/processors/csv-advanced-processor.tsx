/**
 * Advanced streaming CSV processor with configurable options and real-time monitoring
 * Supports only streaming processing for optimal performance
 */

"use client";

import React, { useState } from "react";
import { useCsvProcessor } from "@/hooks/use-csv-processor";
import { CsvProcessorOptions } from "@/lib/csv-processor";
import { CsvDataTable } from "../ui/csv-data-table";
import { MemoryMonitor } from "../ui/memory-monitor";
import { ProgressDisplay } from "../ui/progress-display";
import { ErrorDisplay } from "../ui/error-display";

type ConfigPreset = {
  name: string;
  icon: string;
  description: string;
  options: CsvProcessorOptions;
};

const CONFIG_PRESETS: ConfigPreset[] = [
  {
    name: "Conservative",
    icon: "🐌",
    description: "Small files, stable processing",
    options: {
      maxDownloadSize: 50 * 1024 * 1024, // 50MB
      downloadProgressThrottle: 500,
      batchSize: 500,
      progressThrottle: 200,
    },
  },
  {
    name: "Balanced",
    icon: "⚡",
    description: "Default recommended settings",
    options: {
      maxDownloadSize: 200 * 1024 * 1024, // 200MB
      downloadProgressThrottle: 200,
      batchSize: 1000,
      progressThrottle: 100,
    },
  },
  {
    name: "Aggressive",
    icon: "🚀",
    description: "Large files, maximum speed",
    options: {
      maxDownloadSize: 500 * 1024 * 1024, // 500MB
      downloadProgressThrottle: 100,
      batchSize: 2000,
      progressThrottle: 50,
    },
  },
];

export function CsvAdvancedProcessor() {
  const [url, setUrl] = useState("");
  const [showRealTimeMemory, setShowRealTimeMemory] = useState(true);

  // Streaming configuration options
  const [options, setOptions] = useState<CsvProcessorOptions>({
    maxDownloadSize: 200 * 1024 * 1024, // 200MB
    downloadProgressThrottle: 200, // 200ms
    batchSize: 1000, // 1000 lines
    progressThrottle: 100, // 100ms
  });

  const { isProcessing, progress, result, error, processUrl, cancel, reset } =
    useCsvProcessor(options);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      await processUrl(url.trim());
    } catch (err) {
      console.error("Streaming processing failed:", err);
    }
  };

  const updateOption = (key: keyof CsvProcessorOptions, value: number) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: ConfigPreset) => {
    setOptions(preset.options);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Performance Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Advanced Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Max Download Size (MB)
            </label>
            <input
              type="number"
              value={Math.round(
                (options.maxDownloadSize || 200 * 1024 * 1024) / 1024 / 1024
              )}
              onChange={(e) =>
                updateOption(
                  "maxDownloadSize",
                  parseInt(e.target.value) * 1024 * 1024
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="50"
              max="1000"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Maximum compressed file size to download
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Batch Size (lines)
            </label>
            <input
              type="number"
              value={options.batchSize || 1000}
              onChange={(e) =>
                updateOption("batchSize", parseInt(e.target.value))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="100"
              max="10000"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Number of lines to process in each batch
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Progress Throttle (ms)
            </label>
            <input
              type="number"
              value={options.progressThrottle || 100}
              onChange={(e) =>
                updateOption("progressThrottle", parseInt(e.target.value))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="50"
              max="1000"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              How often to update parsing progress
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Download Progress Throttle (ms)
            </label>
            <input
              type="number"
              value={options.downloadProgressThrottle || 200}
              onChange={(e) =>
                updateOption(
                  "downloadProgressThrottle",
                  parseInt(e.target.value)
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="100"
              max="2000"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              How often to update download progress
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Presets */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Quick Configuration Presets
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CONFIG_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200 text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{preset.icon}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {preset.name}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* URL Input and Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              CSV File URL (gzipped)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/data.csv.gz"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isProcessing}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Streaming Processing Mode
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRealTimeMemory}
                  onChange={(e) => setShowRealTimeMemory(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  🧠 Real-time Memory Monitor
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isProcessing || !url.trim()}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {isProcessing ? "Processing..." : "🚀 Start Streaming"}
            </button>

            {isProcessing && (
              <button
                type="button"
                onClick={cancel}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={reset}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Sample URLs for quick testing */}
      {!isProcessing && !result && !url && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-700">
          <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔗</span>
            Quick Start - Sample URLs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                name: "Small Dataset (Flight Data)",
                url: "https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv.gz",
                description: "Historical air travel data, ~15KB compressed",
                icon: "✈️",
              },
              {
                name: "Medium Dataset (US Agriculture)",
                url: "https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv.gz",
                description: "US agricultural exports data, ~35KB compressed",
                icon: "🌾",
              },
              {
                name: "Large Dataset (Countries)",
                url: "https://github.com/cs109/2014_data/raw/master/countries.csv.gz",
                description: "Global countries dataset, ~85KB compressed",
                icon: "🌍",
              },
              {
                name: "Test Dataset (Local)",
                url: "/api/test-csv?rows=1000",
                description: "Generated test data with 1000 rows",
                icon: "🧪",
              },
            ].map((sample) => (
              <button
                key={sample.name}
                onClick={() => setUrl(sample.url)}
                className="p-4 text-left bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{sample.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium text-purple-900 dark:text-purple-100 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                      {sample.name}
                    </div>
                    <div className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                      {sample.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress Display */}
      {progress && <ProgressDisplay progress={progress} onCancel={cancel} />}

      {/* Real-time Memory Monitor */}
      <MemoryMonitor
        progress={progress}
        isEnabled={showRealTimeMemory}
        isProcessing={isProcessing}
        useStreaming={true}
      />

      {/* Error Display */}
      {error && <ErrorDisplay error={error} onReset={reset} />}

      {/* Results Display */}
      {result && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-xl p-6">
          <h3 className="text-green-800 dark:text-green-200 font-semibold mb-4 flex items-center gap-2">
            <span className="text-2xl">✅</span>
            Streaming Processing Complete
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="flex flex-col space-y-1">
              <span className="font-medium text-green-700 dark:text-green-300">
                Rows Processed:
              </span>
              <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                {result.data.length.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="font-medium text-green-700 dark:text-green-300">
                Columns:
              </span>
              <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                {result.meta.fields?.length || 0}
              </span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="font-medium text-green-700 dark:text-green-300">
                Processing Time:
              </span>
              <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                {result.processingTime
                  ? `${(result.processingTime / 1000).toFixed(1)}s`
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CSV Data Table */}
      {result && <CsvDataTable result={result} />}

      {/* Configuration Tips */}
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-4 flex items-center gap-2">
          <span className="text-2xl">💡</span>
          Performance Optimization Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-yellow-800 dark:text-yellow-200">
          <div className="space-y-3">
            <div>
              <strong className="block text-yellow-900 dark:text-yellow-100">
                Batch Size:
              </strong>
              Larger batches process faster but use more memory. Use 500-1000
              for balanced performance, 2000+ for large files.
            </div>
            <div>
              <strong className="block text-yellow-900 dark:text-yellow-100">
                Progress Throttling:
              </strong>
              Lower values (50-100ms) give smoother progress updates. Higher
              values (200-500ms) reduce CPU overhead.
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <strong className="block text-yellow-900 dark:text-yellow-100">
                Max Download Size:
              </strong>
              Set based on available memory. 200MB is safe for most devices,
              500MB+ for high-memory systems.
            </div>
            <div>
              <strong className="block text-yellow-900 dark:text-yellow-100">
                Download Throttle:
              </strong>
              Controls network progress frequency. 200ms is optimal for most
              connections.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
