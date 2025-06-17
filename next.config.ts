import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure webpack for Web Workers and DuckDB compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Add support for .wasm files
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };

      // Add module resolution for DuckDB to use browser build
      config.resolve.alias = {
        ...config.resolve.alias,
        "@duckdb/duckdb-wasm$": "@duckdb/duckdb-wasm/dist/duckdb-browser.mjs",
      };

      // Suppress specific webpack warnings
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        {
          module: /node_modules\/@duckdb\/duckdb-wasm\/dist\/duckdb-node\.cjs/,
          message:
            /Critical dependency: the request of a dependency is an expression/,
        },
        // Also ignore other potential warnings from DuckDB
        /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
        /Critical dependency: the request of a dependency is an expression/,
      ];
    }

    return config;
  },
};

export default nextConfig;
