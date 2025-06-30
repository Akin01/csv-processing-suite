"use client";

import React from "react";

// Define a more generic CsvData structure for the table
export interface CsvDisplayData {
  columns: string[];
  rows: (string | number | boolean | null)[][]; // Array of arrays for rows
  totalRows: number; // Total rows in the dataset for pagination
}

export interface TableState {
  searchTerm: string;
  pageSize: number;
  currentPage: number;
  sortColumn: string;
  sortDirection: "asc" | "desc";
}

interface CsvDataTableProps {
  data?: CsvDisplayData; // Make data optional to handle loading/empty states
  tableState: TableState;
  onTableStateChange: (newState: Partial<TableState>) => void;
  tableName?: string; // Optional, for display
  // Removed result and processingTime props, parent will handle these if needed
}

export function CsvDataTable({
  data,
  tableState,
  onTableStateChange,
  tableName,
}: CsvDataTableProps) {
  const {
    currentPage,
    pageSize,
    // sortColumn, // Sorting display handled by parent for now
    // sortDirection,
  } = tableState;

  const columns = data?.columns || [];
  const currentRows = data?.rows || []; // These are already the rows for the current page
  const totalRows = data?.totalRows || 0;
  const totalPages = Math.ceil(totalRows / pageSize);
  const startIndex = (currentPage - 1) * pageSize;

  const handlePageChange = (page: number) => {
    onTableStateChange({ currentPage: page });
  };

  const handleRowsPerPageChange = (newSize: number) => {
    onTableStateChange({ pageSize: newSize, currentPage: 1 });
  };

  if (!data || columns.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p className="text-lg mb-2">No data to display</p>
        {tableName && <p className="text-sm">Table: {tableName}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header - Simplified, as parent component (PgliteCsvProcessor) shows overall status */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {tableName ? `Data for: ${tableName}` : "CSV Data"} ({totalRows.toLocaleString()} total rows)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Rows per page:
            </span>
            <select
              value={pageSize}
              onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  // onClick={() => onTableStateChange({sortColumn: column, sortDirection: tableState.sortColumn === column && tableState.sortDirection === 'asc' ? 'desc' : 'asc'})} // Example if adding sort here
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                >
                  {column}
                  {/* Add sort indicator if sortColumn === column */}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {currentRows.map((rowArray, rowIndex) => (
              <tr
                key={rowIndex} // Key should be more stable if possible, e.g. an ID from the row
                className="hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {rowArray.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate"
                    title={String(cell ?? "")}
                  >
                    {cell !== null && cell !== undefined ? String(cell) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {Math.min(startIndex + 1, totalRows)} to {Math.min(startIndex + pageSize, totalRows)} of{" "}
              {totalRows.toLocaleString()} results
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <div className="flex items-center gap-1">
                 {/* Simplified pagination display for brevity, can be expanded */}
                <span className="px-3 py-1 text-sm">Page {currentPage} of {totalPages}</span>
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Errors display removed, parent component (PgliteCsvProcessor) handles this with ErrorDisplay component */}
    </div>
  );
}
