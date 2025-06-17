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

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

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
          try {
            const { PGliteWorker } = await import("@electric-sql/pglite/worker");
            const worker = new Worker(new URL('../workers/pglite-worker.ts', import.meta.url));
            db = new PGliteWorker(worker, {
              dataDir,
              debug: process.env.NODE_ENV === 'development' ? 1 : 0,
            }) as any; // Type assertion for compatibility
          } catch (workerError) {
            console.warn("Worker mode failed, falling back to direct mode:", workerError);
            db = new PGlite(dataDir, {
              debug: process.env.NODE_ENV === 'development' ? 1 : 0,
              // Enable extensions for better CSV handling
              extensions: {
                // Add any needed extensions here
              }
            });
          }
        } else {
          // Direct mode with IndexedDB persistence
          db = new PGlite(dataDir, {
            debug: process.env.NODE_ENV === 'development' ? 1 : 0,
            // Enable extensions for better CSV handling
            extensions: {
              // Add any needed extensions here
            }
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
    [updateInstanceState]
  );

  const removeInstance = useCallback(
    async (dataDir: string) => {
      const instance = instancesRef.current.get(dataDir);
      if (instance?.db) {
        try {
          await instance.db.close();
        } catch (error) {
          console.error(`Error closing database instance for ${dataDir}:`, error);
        }
      }
      setInstances((prev) => {
        const newInstances = new Map(prev);
        newInstances.delete(dataDir);
        return newInstances;
      });
    },
    []
  );

  const reinitializeInstance = useCallback(
    async (dataDir: string, useWorker: boolean = false) => {
      await removeInstance(dataDir);
      await initInstance(dataDir, useWorker);
    },
    [removeInstance, initInstance]
  );

  const terminateInstance = useCallback(
    async (dataDir: string) => {
      await removeInstance(dataDir);
    },
    [removeInstance]
  );

  const contextValue: PGliteContextType = {
    instances,
    initInstance,
    removeInstance,
    reinitializeInstance,
    terminateInstance,
  };

  return (
    <PGliteContext.Provider value={contextValue}>
      {children}
    </PGliteContext.Provider>
  );
}
