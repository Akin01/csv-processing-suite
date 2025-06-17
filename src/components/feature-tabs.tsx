"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const features = [
  {
    id: "csv-streaming",
    name: "Advanced Streaming",
    description:
      "High-performance streaming CSV processor with advanced configuration and real-time monitoring",
    href: "/csv-streaming",
    icon: "⚡",
  },
  {
    id: "duckdb",
    name: "DuckDB Processing",
    description:
      "Process CSV files using DuckDB for blazing-fast analytics and SQL queries",
    href: "/duckdb",
    icon: "🦆",
  },
  {
    id: "pglite-csv",
    name: "PGLite Processing",
    description:
      "Process CSV files using PGLite (PostgreSQL in browser) with IndexedDB persistence and multi-tab support",
    href: "/pglite-csv",
    icon: "🐘",
  },
];

export function FeatureTabs() {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          CSV Processing Suite
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Professional CSV processing with advanced streaming technology and
          high-performance analytics. Choose the right tool for your data
          processing needs.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8 max-w-6xl mx-auto">
        {features.map((feature) => {
          const isActive = pathname === feature.href;
          return (
            <Link
              key={feature.id}
              href={feature.href}
              className={cn(
                "block p-6 rounded-lg border transition-all duration-200 hover:shadow-lg",
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-md"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              )}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {feature.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {feature.description}
              </p>
              {isActive && (
                <div className="mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium">
                  Currently Active
                </div>
              )}
            </Link>
          );
        })}
      </div>
      <div className="border-b border-gray-200 dark:border-gray-700" />
    </div>
  );
}
