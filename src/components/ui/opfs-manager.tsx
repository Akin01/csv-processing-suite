"use client";

import React, { useState } from "react";
import { useDuckDB } from "@/providers/duckdb-provider";

interface OpfsManagerProps {
  className?: string;
  opfsPath?: string; // Add opfsPath prop
}

export function OpfsManager({
  className,
  opfsPath = "opfs://petadata_duckdb.db", // Default OPFS path
}: OpfsManagerProps) {
  const {
    removeOpfsFile,
    checkOpfsFile,
    isReady,
    reinitializeInstance, // Changed from reinitializeDatabase
  } = useDuckDB(opfsPath); // Pass opfsPath to the hook

  const [isRemoving, setIsRemoving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isReinitializing, setIsReinitializing] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [lastAction, setLastAction] = useState<string>("");

  const handleCheckFile = async () => {
    setIsChecking(true);
    setLastAction("");
    try {
      const exists = await checkOpfsFile();
      setFileExists(exists);
      setLastAction(
        exists
          ? "✅ OPFS database file exists"
          : "❌ OPFS database file does not exist"
      );
    } catch (error) {
      setLastAction("❌ Error checking OPFS file");
      console.error("Error checking OPFS file:", error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleRemoveFile = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to remove the persistent database file? This will delete all stored data and cannot be undone."
    );

    if (!confirmed) return;

    setIsRemoving(true);
    setLastAction("");
    try {
      const removed = await removeOpfsFile();
      if (removed) {
        setLastAction(
          "✅ OPFS database file removed successfully. You can reinitialize the database to start fresh."
        );
        setFileExists(false);

        // Ask if user wants to reinitialize the database
        setTimeout(() => {
          const reinitialize = window.confirm(
            "Database file removed successfully. Would you like to reinitialize the database now?"
          );
          if (reinitialize) {
            handleReinitializeDatabase();
          }
        }, 1000);
      } else {
        setLastAction(
          "⚠️ OPFS database file was not found or could not be removed"
        );
        setFileExists(false);
      }
    } catch (error) {
      console.error("Error removing OPFS file:", error);

      // Provide specific error messages for common issues
      if (error instanceof Error) {
        if (
          error.message.includes("modify") ||
          error.message.includes("in use")
        ) {
          setLastAction(
            "❌ Database file is in use. Please refresh the page and try again."
          );
        } else if (error.message.includes("refresh")) {
          setLastAction(`❌ ${error.message}`);
        } else {
          setLastAction(`❌ Error removing OPFS file: ${error.message}`);
        }
      } else {
        setLastAction("❌ Unknown error occurred while removing OPFS file");
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReinitializeDatabase = async () => {
    setIsReinitializing(true);
    setLastAction("");
    try {
      await reinitializeInstance(); // Changed from reinitializeDatabase
      setLastAction("✅ Database reinitialized successfully");
      // Check file status after reinitialization
      setTimeout(() => handleCheckFile(), 1000);
    } catch (error) {
      console.error("Error reinitializing database:", error);
      setLastAction("❌ Error reinitializing database");
    } finally {
      setIsReinitializing(false);
    }
  };

  if (!isReady) {
    return (
      <div className={`p-4 border rounded-lg bg-gray-50 ${className || ""}`}>
        <h3 className="text-lg font-semibold mb-2">OPFS Database Manager</h3>
        <p className="text-gray-600">Waiting for DuckDB to initialize...</p>
      </div>
    );
  }

  return (
    <div
      className={`p-4 border rounded-lg bg-white shadow-sm ${className || ""}`}
    >
      <h3 className="text-lg font-semibold mb-4">OPFS Database Manager</h3>

      <p className="text-sm text-gray-600 mb-4">
        Manage the persistent database file stored in Origin Private File System
        (OPFS). This file contains all your imported data and persists between
        browser sessions.
      </p>

      <div className="space-y-3">
        <div className="flex gap-3">
          <button
            onClick={handleCheckFile}
            disabled={isChecking}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isChecking ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Checking...
              </>
            ) : (
              <>🔍 Check File Status</>
            )}
          </button>

          <button
            onClick={handleRemoveFile}
            disabled={isRemoving || fileExists === false}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRemoving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Removing...
              </>
            ) : (
              <>🗑️ Remove Database File</>
            )}
          </button>

          <button
            onClick={handleReinitializeDatabase}
            disabled={isReinitializing || !isReady}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isReinitializing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Reinitializing...
              </>
            ) : (
              <>🔄 Reinitialize Database</>
            )}
          </button>
        </div>

        {lastAction && (
          <div className="p-3 rounded-lg bg-gray-50 border">
            <p className="text-sm font-medium">{lastAction}</p>
          </div>
        )}

        {fileExists !== null && (
          <div className="p-3 rounded-lg border">
            <p className="text-sm">
              <strong>File Status:</strong>{" "}
              <span
                className={
                  fileExists ? "text-green-600 font-medium" : "text-gray-500"
                }
              >
                {fileExists ? "File exists" : "File does not exist"}
              </span>
            </p>
            {fileExists && (
              <p className="text-xs text-gray-500 mt-1">
                File path: {opfsPath} {/* Display dynamic opfsPath */}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
