"use client";

interface ExampleUrlsProps {
  onSelectUrl: (url: string) => void;
  isProcessing: boolean;
}

const EXAMPLE_URLS = [
  {
    name: "Local Test Data (Small)",
    url: "/api/test-csv?rows=50",
    description: "Generated employee data with 50 rows",
    size: "~3KB",
    isLocal: true,
  },
  {
    name: "Local Test Data (Medium)",
    url: "/api/test-csv?rows=500",
    description: "Generated employee data with 500 rows",
    size: "~30KB",
    isLocal: true,
  },
  {
    name: "Local Test Data (Large)",
    url: "/api/test-csv?rows=5000",
    description: "Generated employee data with 5,000 rows (max)",
    size: "~300KB",
    isLocal: true,
  },
  {
    name: "EMP Polri",
    url: "https://petadata.s3.ap-southeast-3.amazonaws.com/assets/kmp.csv.gz",
    description: "The data of EMP Polri that contains ~1,5 millions rows",
    size: "~26MB",
    isLocal: false,
  },
];

export function ExampleUrls({ onSelectUrl, isProcessing }: ExampleUrlsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
          📋 Try with example URLs
        </summary>

        <div className="mt-4 space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Click any example below to test the CSV processor:
          </p>

          {EXAMPLE_URLS.map((example, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {example.name}
                    </h4>
                    {example.isLocal && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Local
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {example.description}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Size: {example.size}
                  </p>
                </div>

                <button
                  onClick={() => onSelectUrl(example.url)}
                  disabled={isProcessing}
                  className="flex-shrink-0 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
                >
                  Try This
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-500 dark:text-gray-500 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded break-all">
                {example.url}
              </div>
            </div>
          ))}

          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>Performance Limits:</strong> Files are limited to 50MB
              compressed / 100MB decompressed. Large datasets are automatically
              truncated to 50,000 rows for optimal performance.
            </p>
          </div>

          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Some external URLs might be temporarily
              unavailable. Use local test data for guaranteed functionality.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
