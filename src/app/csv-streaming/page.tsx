"use client";

import { CsvAdvancedProcessor } from "@/components/processors/csv-advanced-processor";
import { FeatureTabs } from "@/components/feature-tabs";

export default function CsvStreamingAdvancedPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <FeatureTabs />
        
        <div className="mt-8">
          {/* Feature Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Advanced Streaming CSV Processor
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Process CSV files with high-performance streaming technology and advanced 
              configuration options. Real-time metrics monitoring for optimal performance tuning.
            </p>
          </div>

          <CsvAdvancedProcessor />
        </div>
      </div>
    </div>
  );
}
