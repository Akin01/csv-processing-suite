"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { PGlite } from "@electric-sql/pglite";
import { PGliteWithLive } from "@electric-sql/pglite/live";
import { drizzle } from "drizzle-orm/pglite";

interface ManagedInstance {
  db: PGlite | null;
  drizzleDb: ReturnType<typeof drizzle> | null;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  isWorkerMode: boolean;
}

interface PGliteContextType {
  instances: ReadonlyMap<string, ManagedInstance>;
  initInstance: (dataDir: string, useWorker?: boolean) => Promise<void>;
  removeInstance: (dataDir: string) => Promise<void>;
  reinitializeInstance: (dataDir: string, useWorker?: boolean) => Promise<void>;
  terminateInstance: (dataDir: string) => Promise<void>;
}

const PGliteContext = createContext<PGliteContextType | undefined>(undefined);

export const usePGlite = (dataDir: string, useWorker: boolean = false) => {
  const context = useContext(PGliteContext);
  if (!context) {
    throw new Error("usePGlite must be used within a PGliteProvider");
  }

  const { instances, initInstance, ...actions } = context;
  const instance = instances.get(dataDir);

  useEffect(() => {
    if (!instance || (!instance.isReady && !instance.isLoading)) {
      initInstance(dataDir, useWorker);
    }
  }, [dataDir, instance, initInstance, useWorker]);

  const defaultLoadingInstance: ManagedInstance = {
    db: null,
    drizzleDb: null,
    isLoading: true,
    error: null,
    isReady: false,
    isWorkerMode: useWorker,
  };

  const currentDisplayInstance = instance || defaultLoadingInstance;

  return {
    ...currentDisplayInstance,
    removeInstance: () => actions.removeInstance(dataDir),
    reinitializeInstance: () => actions.reinitializeInstance(dataDir, useWorker),
    terminateInstance: () => actions.terminateInstance(dataDir),
  };
};

interface PGliteProviderWrapperProps {
  children: React.ReactNode;
}

export function PGliteProviderWrapper({
  children,
}: PGliteProviderWrapperProps) {
  const [instances, setInstances] = useState<Map<string, ManagedInstance>>(
    () => new Map()
  );
  const mounted = useRef(true);
  const instancesRef = useRef(instances);
  const initLocksRef = useRef(new Set<string>());

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  const updateInstanceState = useCallback(
    (dataDir: string, newState: Partial<ManagedInstance>) => {
      setInstances((prevInstances) => {
        const newInstances = new Map(prevInstances);
        const current = newInstances.get(dataDir) || {
          db: null,
          drizzleDb: null,
          isLoading: true,
          error: null,
          isReady: false,
          isWorkerMode: false,
        };
        newInstances.set(dataDir, { 
          ...current, 
          ...newState,
          drizzleDb: newState.drizzleDb !== undefined ? newState.drizzleDb : current.drizzleDb,
          isWorkerMode: newState.isWorkerMode !== undefined ? newState.isWorkerMode : current.isWorkerMode,
        });
        return newInstances;
      });
    },
    []
  );

  const initInstance = useCallback(
    async (dataDir: string, useWorker: boolean = false) => {
      if (initLocksRef.current.has(dataDir) || instancesRef.current.get(dataDir)?.isReady) {
        return;
      }

      initLocksRef.current.add(dataDir);
      
      try {
        updateInstanceState(dataDir, { 
          isLoading: true, 
          error: null, 
          isWorkerMode: useWorker 
        });

        let db: PGlite;
        
        if (useWorker) {
          // Use worker mode for multi-tab support
          const { PGliteWorker } = await import("@electric-sql/pglite/worker");
          const worker = new Worker(new URL('../workers/pglite-worker.ts', import.meta.url));
          db = new PGliteWorker(worker, {
            dataDir,
          });
        } else {
          // Direct mode
          db = new PGlite(dataDir, {
            debug: process.env.NODE_ENV === 'development' ? 1 : 0,
          });
        }

        await db.waitReady;
        
        // Initialize Drizzle
        const drizzleDb = drizzle(db);

        // Create metadata table if it doesn't exist
        await db.exec(`
          CREATE TABLE IF NOT EXISTS csv_metadata (
            id SERIAL PRIMARY KEY,
            table_name TEXT NOT NULL UNIQUE,
            original_url TEXT NOT NULL,
            file_name TEXT NOT NULL,
            total_rows INTEGER NOT NULL DEFAULT 0,
            column_count INTEGER NOT NULL DEFAULT 0,
            processing_time_ms INTEGER,
            file_size_bytes INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        if (mounted.current) {
          updateInstanceState(dataDir, {
            db,
            drizzleDb,
            isLoading: false,
            isReady: true,
            error: null,
          });
        }

      } catch (error: any) {
        console.error(`Failed to initialize PGLite instance for ${dataDir}:`, error);
        if (mounted.current) {
          updateInstanceState(dataDir, {
            db: null,
            drizzleDb: null,
            isLoading: false,
            isReady: false,
            error: error.message || "Failed to initialize database",
          });
        }
      } finally {
        initLocksRef.current.delete(dataDir);
      }
    },
    [updateInstanceState, mounted]
  );
        return;
      }
      initLocksRef.current.add(dataDir);

      updateInstanceState(dataDir, { isLoading: true, error: null });

      try {
        console.log(`Initializing PGlite instance for ${dataDir}...`);
        // PGLite uses a string for the data directory, which can be an IndexedDB path
        const db = new PGlite({ dataDir: dataDir });
        await db.waitReady;

        if (mounted.current) {
          updateInstanceState(dataDir, {
            db,
            isLoading: false,
            isReady: true,
            error: null,
            // worker: db.worker, // Access worker if needed, PGlite handles it internally
          });
          console.log(`PGlite instance for ${dataDir} ready.`);
        } else {
          await db.close();
        }
      } catch (err: any) {
        console.error(`Error initializing PGlite instance for ${dataDir}:`, err);
        if (mounted.current) {
          updateInstanceState(dataDir, {
            isLoading: false,
            error: err.message,
            isReady: false,
          });
        }
      } finally {
        initLocksRef.current.delete(dataDir);
      }
    },
    [updateInstanceState]
  );
  
  const removeInstance = useCallback(
    async (dataDir: string) => {
      const instance = instancesRef.current.get(dataDir);
      if (instance?.db) {
        await instance.db.close(); // Close the database connection
        // PGlite doesn't have a direct equivalent to DuckDB's drop_fs, 
        // but closing and re-initializing with a new/empty datadir or managing via IndexedDB directly is an option.
        // For simplicity, we'll just close and remove the instance state.
        // To truly clear IndexedDB, manual browser API usage would be needed.
        console.log(`PGlite instance for ${dataDir} closed.`);
      }
      setInstances((prevInstances) => {
        const newInstances = new Map(prevInstances);
        newInstances.delete(dataDir);
        return newInstances;
      });
      // Re-initialize a fresh instance if needed, or leave it cleared.
      // For now, we'll just remove it. A new call to usePGlite will re-init.
    },
    [updateInstanceState]
  );

  const reinitializeInstance = useCallback(
    async (dataDir: string) => {
      await removeInstance(dataDir);
      await initInstance(dataDir); // This will create a new instance
      console.log(`PGlite instance for ${dataDir} reinitialized.`);
    },
    [removeInstance, initInstance]
  );

  const terminateInstance = useCallback(
    async (dataDir: string) => {
      const instance = instancesRef.current.get(dataDir);
      if (instance?.db) {
        await instance.db.close();
        console.log(`PGlite instance for ${dataDir} terminated.`);
      }
      setInstances((prevInstances) => {
        const newInstances = new Map(prevInstances);
        newInstances.delete(dataDir);
        return newInstances;
      });
    },
    []
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Terminate all instances on unmount
      instancesRef.current.forEach(async (instance, dataDir) => {
        if (instance.db) {
          await instance.db.close();
          console.log(`PGlite instance for ${dataDir} closed on provider unmount.`);
        }
      });
    };
  }, []);

  return (
    <PGliteContext.Provider
      value={{
        instances,
        initInstance,
        removeInstance,
        reinitializeInstance,
        terminateInstance,
      }}
    >
      {children}
    </PGliteContext.Provider>
  );
}
