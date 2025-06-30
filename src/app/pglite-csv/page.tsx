"use client";

import { FeatureTabs } from "@/components";
import { PgliteCsvProcessor } from "@/components/processors/pglite-csv-processor";
// Import the new official provider wrapper
import { OfficialPGliteProviderWrapper } from "@/providers/official-pglite-provider";
import { PGliteOpfsManager } from "@/components/ui/pglite-opfs-manager";

export default function PgliteCsvPage() {
  // dataDir is now primarily managed by the OfficialPGliteProviderWrapper,
  // but we can define it here if we want to override its default or for other components like PGliteOpfsManager.
  const pageDataDir = "idb://pglite_csv_demo_db_official"; // Align with new provider's default or make it distinct

  return (
    // Use the new OfficialPGliteProviderWrapper
    // Pass the dataDir if you want to ensure PGliteOpfsManager and the provider use the exact same path.
    // The OfficialPGliteProviderWrapper defaults to 'idb://pglite_csv_demo_db_official'
    <OfficialPGliteProviderWrapper dataDir={pageDataDir}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <FeatureTabs />
          
          <div className="mt-8">
            {/* Feature Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                PGLite CSV Processing (Official Provider)
              </h2>
              <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Lightning-fast CSV processing using PGLite (PostgreSQL in browser). Features 
                streaming processing, IndexedDB persistence, multi-tab worker support, and 
                automatic gzip decompression for efficient data handling.
                Powered by the official @electric-sql/pglite-react provider.
              </p>
            </div>
            
            <div className="space-y-8">
              {/* PgliteCsvProcessor no longer needs dataDir or useWorker props */}
              <PgliteCsvProcessor />
              
              {/* PGliteOpfsManager might still need dataDir if it operates independently */}
              <PGliteOpfsManager dataDir={pageDataDir} />
              
              {/* Database Information Panel */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
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
                      {/* Display the dataDir used by the provider/page */}
                      <span className="text-gray-900 dark:text-white font-mono text-xs">{pageDataDir}</span>
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
            </div>
          </div>
        </div>
      </div>
    </PGliteProviderWrapper>
  );
}
