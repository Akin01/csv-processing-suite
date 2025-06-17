"use client";

interface ErrorDisplayProps {
  error: string;
  onReset: () => void;
}

export function ErrorDisplay({ error, onReset }: ErrorDisplayProps) {
  // Check if this is a size-related error
  const isSizeError =
    error.includes("too large") ||
    error.includes("Invalid array length") ||
    error.includes("Buffer concatenation failed");

  return (
    <div className="w-full max-w-2xl mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-600 dark:text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
            Processing Error
          </h3>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>

          {isSizeError && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-800/30 rounded-md">
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>💡 Tip:</strong> Try using a smaller file or one of our
                test datasets:
              </p>
              <ul className="mt-1 text-xs text-red-600 dark:text-red-400 ml-4 list-disc">
                <li>Use files smaller than 500MB compressed</li>
                <li>Try our &ldquo;Local Test Data (Small)&rdquo; example</li>
                <li>Consider splitting large datasets into smaller files</li>
              </ul>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={onReset}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
