import { DuckDbCsvProcessor } from "@/components/processors/duckdb-csv-processor";
import { OpfsManager } from "@/components/ui/opfs-manager";
import { FeatureTabs } from "@/components/feature-tabs";

export default function DuckDBPage() {
  const opfsPath = "opfs://petadata_duckdb.db"; // Define a common OPFS path

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <FeatureTabs />
        
        <div className="mt-8">
          {/* Feature Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              DuckDB Analytics Engine
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Ultra-fast CSV processing using DuckDB-Wasm. Experience blazing-fast analytics, 
              automatic gzip decompression, and persistent browser storage with SQL capabilities.
            </p>
          </div>
          
          <div className="space-y-8">
            <DuckDbCsvProcessor opfsPath={opfsPath} />
            
            <OpfsManager opfsPath={opfsPath} />
          </div>
        </div>
      </div>
    </div>
  );
}
