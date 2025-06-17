"use client";

import { ProcessProgress } from "@/lib/csv-processor";

interface ProgressDisplayProps {
  progress: ProcessProgress;
  onCancel: () => void;
}

export function ProgressDisplay({ progress, onCancel }: ProgressDisplayProps) {
  const getStepLabel = (step: string) => {
    switch (step) {
      case "fetch":
        return "Fetching";
      case "stream":
        return "Streaming";
      case "download":
        return "Downloading";
      case "decompress":
        return "Decompressing";
      case "parse":
        return "Parsing";
      case "complete":
        return "Complete";
      default:
        return "Processing";
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress < 30) return "bg-red-500";
    if (progress < 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Processing CSV Data
        </h3>
        {progress.step !== "complete" && (
          <button
            onClick={onCancel}
            className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {getStepLabel(progress.step)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Math.round(progress.progress)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                progress.progress
              )}`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>

        {/* Progress Message */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {progress.message}
        </div>

        {/* Step Indicators */}
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600">
          {["fetch", "download", "decompress", "parse", "complete"].map(
            (step, index) => (
              <div
                key={step}
                className={`flex flex-col items-center ${
                  progress.step === step
                    ? "text-blue-600 dark:text-blue-400"
                    : index <
                      [
                        "fetch",
                        "download",
                        "decompress",
                        "parse",
                        "complete",
                      ].indexOf(progress.step)
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-400 dark:text-gray-600"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full mb-1 ${
                    progress.step === step
                      ? "bg-blue-600"
                      : index <
                        [
                          "fetch",
                          "download",
                          "decompress",
                          "parse",
                          "complete",
                        ].indexOf(progress.step)
                      ? "bg-green-600"
                      : "bg-gray-300 dark:bg-gray-700"
                  }`}
                />
                <span className="capitalize">{getStepLabel(step)}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
