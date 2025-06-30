/**
 * Utility functions for the application
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats bytes to human readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Delays execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats a duration in milliseconds to a human-readable string (e.g., "123ms", "1.2s", "1m 5s").
 * @param timeMs Duration in milliseconds.
 * @returns Human-readable string representation of the duration.
 */
export function formatProcessingTime(timeMs: number): string {
  if (timeMs < 1000) return `${timeMs}ms`;
  if (timeMs < 60000) return `${(timeMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Generates a safe table name from a CSV URL.
 * @param csvUrl The URL of the CSV file.
 * @returns A sanitized string suitable for use as a table name.
 */
export function getTableNameFromUrl(csvUrl: string): string {
  try {
    // Use a base URL if csvUrl is relative (e.g. /api/test-csv)
    // Assuming window.location.origin is available in the context this util is used.
    // If used in a worker without window, this might need adjustment or a base explicitly passed.
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const urlObj = new URL(csvUrl, base);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || "unknown_csv";
    // Remove .csv and .gz extensions, then sanitize
    const nameWithoutGz = filename.replace(/\.csv\.gz$/i, "");
    const nameWithoutCsv = nameWithoutGz.replace(/\.csv$/i, "");
    // Replace non-alphanumeric characters (except underscore) with underscore
    // Ensure it starts with a letter or underscore, and is not excessively long.
    let safeName = nameWithoutCsv.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

    // Ensure it doesn't start with a number (common SQL restriction)
    if (safeName.match(/^\d/)) {
      safeName = "_" + safeName;
    }
    // Truncate to a reasonable length for table names (e.g., 63 chars for PostgreSQL)
    safeName = safeName.substring(0, 60); // Leave room for potential suffixes if needed

    return safeName || "csv_data"; // Fallback if all else fails
  } catch (e) {
    // Fallback for invalid URLs or other errors
    console.error("Error generating table name from URL:", e);
    // Generate a generic name if URL parsing fails for any reason
    const timestamp = Date.now();
    return `csv_data_${timestamp % 10000}`; // Basic fallback
  }
}
