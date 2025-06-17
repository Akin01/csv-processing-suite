"use client";

import React, { useState } from "react";

interface UrlInputProps {
  onProcess: (url: string) => void;
  isProcessing: boolean;
  onReset: () => void;
  initialUrl?: string;
}

export function UrlInput({
  onProcess,
  isProcessing,
  onReset,
  initialUrl = "",
}: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl);
  const [urlError, setUrlError] = useState("");

  // Update URL when initialUrl changes
  React.useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setUrlError("Please enter a URL");
      return;
    }

    // if (!isValidUrl(url)) {
    //   setUrlError('Please enter a valid URL');
    //   return;
    // }

    setUrlError("");
    onProcess(url);
  };

  const handleReset = () => {
    setUrl("");
    setUrlError("");
    onReset();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="csv-url"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Gzipped CSV URL
          </label>
          <input
            id="csv-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/data.csv.gz"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            disabled={isProcessing}
          />
          {urlError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {urlError}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isProcessing || !url.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isProcessing ? "Processing..." : "Process CSV"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
