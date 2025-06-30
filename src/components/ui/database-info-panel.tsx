"use client";

import React from 'react';

interface DatabaseInfoPanelProps {
  dataDir: string;
  className?: string;
}

export function DatabaseInfoPanel({ dataDir, className }: DatabaseInfoPanelProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Database Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Storage Type:</span>
            <span className="text-gray-900 dark:text-white font-medium">IndexedDB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Database Path:</span>
            <span className="text-gray-900 dark:text-white font-mono text-xs">{dataDir}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Worker Mode:</span>
            <span className="text-green-600 dark:text-green-400 font-medium">Enabled</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Multi-tab Support:</span>
            <span className="text-green-600 dark:text-green-400 font-medium">Yes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Streaming:</span>
            <span className="text-green-600 dark:text-green-400 font-medium">Enabled</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Gzip Support:</span>
            <span className="text-green-600 dark:text-green-400 font-medium">Automatic</span>
          </div>
        </div>
      </div>
    </div>
  );
}
