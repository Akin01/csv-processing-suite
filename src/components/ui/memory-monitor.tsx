"use client";

import React from "react";
import { ProcessProgress } from "@/lib/csv-processor";

interface MemoryMonitorProps {
  progress: ProcessProgress | null;
  isEnabled?: boolean;
  isProcessing?: boolean;
  useStreaming?: boolean;
}

export function MemoryMonitor({
  progress,
  isEnabled = true,
  isProcessing = false,
  useStreaming = false,
}: MemoryMonitorProps) {
  // Only show when enabled and processing
  if (!isEnabled || !isProcessing) {
    return null;
  }

  // Use default values when memory data is not available
  const memoryUsage = progress?.memoryUsage;
  const {
    estimatedMB = 0,
    currentRows = 0,
    currentColumns = 0,
    recommendation = "safe",
    bufferSizeMB = undefined,
  } = memoryUsage || {};

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "safe":
        return "bg-green-100 border-green-300 text-green-800";
      case "caution":
        return "bg-orange-100 border-orange-300 text-orange-800";
      case "warning":
        return "bg-red-100 border-red-300 text-red-800";
      default:
        return "bg-gray-100 border-gray-300 text-gray-800";
    }
  };

  const getRecommendationIcon = (rec: string) => {
    switch (rec) {
      case "safe":
        return "✅";
      case "caution":
        return "⚠️";
      case "warning":
        return "🚨";
      default:
        return "ℹ️";
    }
  };

  const formatMB = (mb: number) => {
    if (mb < 1) {
      return `${(mb * 1024).toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div
      className={`border rounded-lg p-4 mb-4 transition-all duration-300 ${getRecommendationColor(
        recommendation
      )}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold flex items-center space-x-2">
          <span>🧠 Real-time Memory Monitor</span>
          <span className="text-xs bg-gray-200 px-2 py-1 rounded">
            {useStreaming ? "STREAMING" : "BUFFERED"}
          </span>
          <span className="text-sm">
            {!memoryUsage ? (
              <span className="text-gray-500">⏳ LOADING</span>
            ) : (
              <span>
                {getRecommendationIcon(recommendation)}{" "}
                {recommendation.toUpperCase()}
              </span>
            )}
          </span>
        </h4>
        <div className="text-sm font-mono">{formatMB(estimatedMB)}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs opacity-75">Data Memory</span>
          <span className="font-semibold">
            {memoryUsage ? formatMB(estimatedMB - (bufferSizeMB || 0)) : "—"}
          </span>
        </div>

        {(bufferSizeMB !== undefined || !memoryUsage) && (
          <div className="flex flex-col">
            <span className="text-xs opacity-75">Buffer Memory</span>
            <span className="font-semibold">
              {memoryUsage && bufferSizeMB !== undefined
                ? formatMB(bufferSizeMB)
                : "—"}
            </span>
          </div>
        )}

        <div className="flex flex-col">
          <span className="text-xs opacity-75">Rows Processed</span>
          <span className="font-semibold">
            {memoryUsage ? currentRows.toLocaleString() : "—"}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs opacity-75">Columns</span>
          <span className="font-semibold">
            {memoryUsage ? currentColumns || "—" : "—"}
          </span>
        </div>
      </div>

      {/* Memory usage bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span>Memory Usage</span>
          <span>{formatMB(estimatedMB)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              !memoryUsage
                ? "bg-gray-400"
                : recommendation === "safe"
                ? "bg-green-500"
                : recommendation === "caution"
                ? "bg-orange-500"
                : "bg-red-500"
            }`}
            style={{
              width: memoryUsage
                ? `${Math.min(100, (estimatedMB / 500) * 100)}%`
                : "0%",
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1 opacity-75">
          <span>0 MB</span>
          <span>100 MB</span>
          <span>300 MB</span>
          <span>500 MB</span>
        </div>
      </div>

      {/* Recommendation message */}
      <div className="mt-3 text-xs">
        {!memoryUsage && <p>⏳ Waiting for memory usage data...</p>}
        {memoryUsage && recommendation === "safe" && (
          <p>
            ✅ Memory usage is safe. Processing can continue without issues.
          </p>
        )}
        {memoryUsage && recommendation === "caution" && (
          <p>⚠️ Memory usage is elevated. Monitor for potential slowdowns.</p>
        )}
        {memoryUsage && recommendation === "warning" && (
          <p>🚨 High memory usage detected! Browser may slow down or crash.</p>
        )}
      </div>
    </div>
  );
}
