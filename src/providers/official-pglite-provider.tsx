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
    // let workerInstance: AppPGliteInstance | undefined; // Not needed here due to direct setPgInstance
    let isMounted = true;

    async function initializePGlite() {
      try {
        setIsLoading(true);
        setError(null);

        const actualWorkerUrl = workerUrl || new URL('../workers/pglite-worker.ts', import.meta.url);

        const worker = new Worker(actualWorkerUrl, { type: 'module' });

        const instance = await PGliteWorker.create(
          worker,
          {
            dataDir: dataDir,
            debug: process.env.NODE_ENV === 'development' ? 1 : 0,
            extensions: { live },
          }
        ) as AppPGliteInstance;

        if (isMounted) {
          setPgInstance(instance);
          setIsLoading(false);
        } else {
          // If component unmounted before worker was ready, terminate the worker
          // PGliteWorker doesn't have a direct .close() or .terminate() on the proxy
          // The actual worker instance needs to be terminated.
          worker.terminate();
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
      // If pgInstance (PGliteWorker proxy) is available and has a way to terminate its worker, call it.
      // Typically, the worker itself is terminated when the PGliteWorker instance is no longer needed
      // or when the leader changes. For this provider, if it unmounts and init was in progress,
      // the worker `worker.terminate()` in the catch or after !isMounted handles it.
      // If pgInstance was successfully created, its underlying worker is managed by PGliteWorker's lifecycle.
      // No explicit global "close all PGliteWorkers" seems to be standard.
      // The line `worker.terminate()` above handles early unmount during init.
    };
  }, [dataDir, workerUrl]);

  if (isLoading) {
    return <div>Loading PGlite Database...</div>;
  }

  if (error) {
    return <div>Error initializing PGlite: {error.message}</div>;
  }

  if (!pgInstance) {
    return <div>PGlite instance not available. This should not normally be reached if loading/error states are correct.</div>;
  }

  return (
    <OfficialPGliteReactProvider db={pgInstance}>
      {children}
    </OfficialPGliteReactProvider>
  );
}
