"use client";

import React, { useEffect, useState, ReactNode } from "react";
import { PGliteWorker, PGliteInterfaceExtensions } from "@electric-sql/pglite/worker";
import { PGliteProvider as OfficialPGliteReactProvider } from "@electric-sql/pglite-react";
import { PGlite } from "@electric-sql/pglite";
import { live, LiveNamespace } from "@electric-sql/pglite/live"; // Import live and its namespace type

// Define a type for our PGlite instance if we add extensions later that affect the main thread proxy
type AppPGliteInstance = PGlite & PGliteInterfaceExtensions<{
  live: LiveNamespace; // Add live extension type
}>;

interface OfficialPGliteProviderWrapperProps {
  children: ReactNode;
  dataDir?: string; // Allow dataDir to be configurable, defaulting otherwise
  workerUrl?: URL; // Allow worker URL to be configurable for flexibility
}

export function OfficialPGliteProviderWrapper({
  children,
  dataDir = "idb://pglite_csv_demo_db_official", // Default dataDir
  workerUrl,
}: OfficialPGliteProviderWrapperProps) {
  const [pgInstance, setPgInstance] = useState<AppPGliteInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let workerInstance: AppPGliteInstance | undefined;
    let isMounted = true;

    async function initializePGlite() {
      try {
        setIsLoading(true);
        setError(null);

        const actualWorkerUrl = workerUrl || new URL('../workers/pglite-worker.ts', import.meta.url);

        // PGliteWorker.create is useful if you have extensions that modify the PGliteWorker's interface
        // For basic usage, new PGliteWorker() is also fine.
        // Using .create() for good measure and future extension typing.
        workerInstance = await PGliteWorker.create(
          new Worker(actualWorkerUrl, { type: 'module' }),
          {
            dataDir: dataDir,
            debug: process.env.NODE_ENV === 'development' ? 1 : 0,
            extensions: { live }, // Add live extension for the main thread proxy
          }
        ) as AppPGliteInstance; // Cast to AppPGliteInstance

        // No explicit db.waitReady is needed here as PGliteWorker.create resolves when ready.
        // The worker's init() function handles its internal PGlite instance's waitReady.

        if (isMounted) {
          setPgInstance(workerInstance);
          setIsLoading(false);
        }
      } catch (e) {
        console.error("Failed to initialize PGlite worker:", e);
        if (isMounted) {
          setError(e instanceof Error ? e : new Error("Failed to initialize PGlite worker"));
          setIsLoading(false);
        }
      }
    }

    initializePGlite();

    return () => {
      isMounted = false;
      // The PGliteWorker docs don't explicitly show a close/terminate method on the PGliteWorker instance itself
      // for the client-side proxy. The leader election and worker lifecycle are managed internally.
      // If direct PGlite instances were used, pgInstance?.close() would be here.
      // For workers, browser typically handles worker termination when tabs/windows close.
      // PGliteWorker itself handles leader changes and re-initialization if a leader tab closes.
    };
  }, [dataDir, workerUrl]);

  if (isLoading) {
    return <div>Loading PGlite Database...</div>;
  }

  if (error) {
    return <div>Error initializing PGlite: {error.message}</div>;
  }

  if (!pgInstance) {
    // Should not happen if not loading and no error, but as a safeguard
    return <div>PGlite instance not available.</div>;
  }

  return (
    <OfficialPGliteReactProvider db={pgInstance}>
      {children}
    </OfficialPGliteReactProvider>
  );
}
