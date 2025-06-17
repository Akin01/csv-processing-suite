"use client";

import { FeatureTabs } from "@/components/feature-tabs";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <FeatureTabs />
        
        {/* Welcome Section */}
        <div className="mt-12 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Welcome to CSV Processing Suite
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              Professional CSV processing with advanced streaming technology and high-performance analytics. 
              Select a feature above to get started with your data processing needs.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm max-w-3xl mx-auto">
              <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-blue-600 dark:text-blue-400 font-medium mb-2 text-lg">
                  ⚡ Advanced Streaming
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  High-performance streaming CSV processor with configurable options, 
                  real-time monitoring, and memory optimization for large files
                </div>
              </div>
              
              <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-green-600 dark:text-green-400 font-medium mb-2 text-lg">
                  🦆 DuckDB Analytics
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  Blazing-fast CSV processing using DuckDB for advanced analytics, 
                  SQL queries, and persistent data storage in the browser
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
