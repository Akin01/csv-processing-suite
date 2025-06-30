"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import type * as DuckDBTypes from "@duckdb/duckdb-wasm";

// --- Helper Functions ---

/**
 * Dynamically imports the DuckDB-WASM library.
 * Throws an error if not in a browser environment.
 */
const loadDuckDB = async (): Promise<typeof DuckDBTypes> => {
  if (typeof window === "undefined") {
    throw new Error("DuckDB can only be loaded on the client side");
  }
  return await import("@duckdb/duckdb-wasm");
};

/**
 * Extracts the base name from an OPFS path string.
 * @param opfsPath The full OPFS path (e.g., "opfs://my_db").
 * @returns The base name (e.g., "my_db").
 */
const getOpfsBaseName = (opfsPath: string): string => {
  return opfsPath.startsWith("opfs://")
    ? opfsPath.substring("opfs://".length)
    : opfsPath;
};

/**
 * Creates a DuckDB worker, with a fallback for potential CORS issues.
 * @param bundle The selected DuckDB bundle.
 * @returns A promise that resolves to a new Worker instance.
 */
const createDuckDBWorker = async (
  bundle: DuckDBTypes.DuckDBBundle
): Promise<Worker> => {
  try {
    const workerUrl = URL.createObjectURL(
      await (await fetch(bundle.mainWorker!)).blob()
    );
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    return worker;
  } catch (e) {
    console.warn(
      "Failed to create worker from blob URL, falling back to direct URL. This might be due to CSP restrictions.",
      e
    );
    return new Worker(bundle.mainWorker!);
  }
};

// --- Type Definitions ---

interface ManagedInstance {
  db: DuckDBTypes.AsyncDuckDB | null;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  worker: Worker | null;
}

interface DuckDBContextType {
  instances: ReadonlyMap<string, ManagedInstance>;
  initInstance: (opfsPath: string) => Promise<void>;
  removeOpfsFile: (opfsPath: string) => Promise<boolean>;
  checkOpfsFile: (opfsPath: string) => Promise<boolean>;
  reinitializeInstance: (opfsPath: string) => Promise<void>;
  terminateInstance: (opfsPath: string) => Promise<void>;
}

// --- React Context and Hook ---

const DuckDBContext = createContext<DuckDBContextType | undefined>(undefined);

export const useDuckDB = (opfsPath: string) => {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error("useDuckDB must be used within a DuckDBProvider");
  }

  const { instances, initInstance, ...actions } = context;
  const instance = instances.get(opfsPath);

  useEffect(() => {
    if (opfsPath && (!instance || (!instance.isReady && !instance.isLoading))) {
      // console.log(`useDuckDB effect: Initializing ${opfsPath}`);
      initInstance(opfsPath);
    }
  }, [opfsPath, instance, initInstance]);

  const defaultLoadingInstance: ManagedInstance = {
    db: null,
    isLoading: true,
    error: null,
    isReady: false,
    worker: null,
  };

  return {
    ...(instance || defaultLoadingInstance),
    removeOpfsFile: () => actions.removeOpfsFile(opfsPath),
    checkOpfsFile: () => actions.checkOpfsFile(opfsPath),
    reinitializeInstance: () => actions.reinitializeInstance(opfsPath),
    terminateInstance: () => actions.terminateInstance(opfsPath),
  };
};

// --- Provider Component ---

interface DuckDBProviderWrapperProps {
  children: React.ReactNode;
}

export function DuckDBProviderWrapper({
  children,
}: DuckDBProviderWrapperProps) {
  const [instances, setInstances] = useState<Map<string, ManagedInstance>>(
    new Map()
  );
  const mounted = useRef(true);
  const instancesRef = useRef(instances);
  const initLocksRef = useRef(new Set<string>());

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // console.log("DuckDBProviderWrapper unmounting. Terminating all instances.");
      instancesRef.current.forEach((_instance, opfsPath) => {
        terminateInstanceInternal(opfsPath);
      });
      setInstances(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateInstanceState = useCallback(
    (opfsPath: string, newState: Partial<ManagedInstance>) => {
      if (!mounted.current) return;
      setInstances((prev) => {
        const newInstances = new Map(prev);
        const current = newInstances.get(opfsPath) || {
          db: null,
          isLoading: true,
          error: null,
          isReady: false,
          worker: null,
        };
        newInstances.set(opfsPath, { ...current, ...newState });
        return newInstances;
      });
    },
    []
  );

  const terminateInstanceInternal = useCallback(
    async (opfsPath: string) => {
      const instance = instancesRef.current.get(opfsPath);
      if (!instance) return;

      // console.log(`Terminating instance for ${opfsPath}`);
      if (instance.db) {
        try {
          await instance.db.terminate();
        } catch (e) {
          console.warn(`Error terminating DB for ${opfsPath}`, e);
        }
      }
      if (instance.worker) {
        instance.worker.terminate();
      }

      updateInstanceState(opfsPath, {
        db: null,
        worker: null,
        isReady: false,
        isLoading: false,
        error: null,
      });
    },
    [updateInstanceState]
  );

  const removeOpfsFilesInternal = useCallback(async (opfsPath: string) => {
    if (!navigator.storage?.getDirectory) return;
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const baseName = getOpfsBaseName(opfsPath);
      const dbFiles = [baseName, `${baseName}.wal`, `${baseName}.tmp`];
      for (const fileName of dbFiles) {
        try {
          await opfsRoot.removeEntry(fileName);
        } catch (e) {
          if (!(e instanceof Error && e.name === "NotFoundError")) {
            console.warn(`Could not remove OPFS file: ${fileName}`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Error accessing OPFS root directory for ${opfsPath}`, e);
    }
  }, []);

  const initInstance = useCallback(
    async (opfsPath: string) => {
      if (!opfsPath) {
        console.error("initInstance called with invalid opfsPath.");
        return;
      }

      if (initLocksRef.current.has(opfsPath)) {
        // console.warn(`Initialization for ${opfsPath} already in progress.`);
        return;
      }

      const currentInstance = instancesRef.current.get(opfsPath);
      if (currentInstance?.isLoading || currentInstance?.isReady) {
        // console.log(`Instance ${opfsPath} is already loading or ready. Skipping.`);
        return;
      }

      initLocksRef.current.add(opfsPath);
      // console.log(`Lock acquired for ${opfsPath}`);

      try {
        await terminateInstanceInternal(opfsPath); // Clean up any previous failed state

        updateInstanceState(opfsPath, {
          isLoading: true,
          error: null,
          isReady: false,
        });

        const duckdb = await loadDuckDB();
        const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

        const attemptOpen = async (
          isRecovery = false
        ): Promise<DuckDBTypes.AsyncDuckDB> => {
          if (isRecovery) {
            // console.log(`Attempting recovery for ${opfsPath}...`);
            await removeOpfsFilesInternal(opfsPath);
          }

          const worker = await createDuckDBWorker(bundle);
          if (!mounted.current) {
            worker.terminate();
            throw new Error("Component unmounted");
          }
          updateInstanceState(opfsPath, { worker });

          const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
          const db = new duckdb.AsyncDuckDB(logger, worker);

          await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
          await db.open({
            path: opfsPath,
            accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
            query: { castTimestampToDate: true },
          });

          if (!mounted.current) {
            await db.terminate();
            throw new Error("Component unmounted");
          }
          return db;
        };

        try {
          const db = await attemptOpen(false);
          // console.log(`Successfully initialized DB for ${opfsPath}`);
          updateInstanceState(opfsPath, {
            db,
            isReady: true,
            isLoading: false,
            error: null,
          });
        } catch (initialError) {
          const isRecoverable =
            initialError instanceof Error &&
            (initialError.message.includes("WAL file") ||
              initialError.message.includes("createSyncAccessHandle"));

          if (isRecoverable) {
            console.warn(
              `Initial open failed for ${opfsPath}, attempting recovery.`,
              initialError
            );
            try {
              const db = await attemptOpen(true); // Recovery attempt
              // console.log(`Successfully recovered and initialized DB for ${opfsPath}`);
              updateInstanceState(opfsPath, {
                db,
                isReady: true,
                isLoading: false,
                error: null,
              });
            } catch (recoveryError) {
              console.error(
                `Recovery attempt failed for ${opfsPath}.`,
                recoveryError
              );
              throw recoveryError; // Propagate to the outer catch block
            }
          } else {
            throw initialError; // Not a recoverable error
          }
        }
      } catch (err) {
        console.error(`Failed to initialize DuckDB for ${opfsPath}:`, err);
        const instance = instancesRef.current.get(opfsPath);
        if (instance?.worker) {
          instance.worker.terminate();
        }
        updateInstanceState(opfsPath, {
          error: err instanceof Error ? err.message : String(err),
          isLoading: false,
          isReady: false,
          db: null,
          worker: null,
        });
      } finally {
        initLocksRef.current.delete(opfsPath);
        // console.log(`Lock released for ${opfsPath}`);
      }
    },
    [updateInstanceState, terminateInstanceInternal, removeOpfsFilesInternal]
  );

  const removeOpfsFile = useCallback(
    async (opfsPath: string): Promise<boolean> => {
      if (!opfsPath) {
        console.error("removeOpfsFile: opfsPath is invalid.");
        return false;
      }
      await terminateInstanceInternal(opfsPath);
      await removeOpfsFilesInternal(opfsPath);
      return true; // Assume success, errors are logged internally
    },
    [terminateInstanceInternal, removeOpfsFilesInternal]
  );

  const checkOpfsFile = useCallback(
    async (opfsPath: string): Promise<boolean> => {
      if (!opfsPath || !navigator.storage?.getDirectory) {
        return false;
      }
      try {
        const opfsRoot = await navigator.storage.getDirectory();
        const baseName = getOpfsBaseName(opfsPath);
        await opfsRoot.getFileHandle(baseName);
        return true;
      } catch (error) {
        if (!(error instanceof Error && error.name === "NotFoundError")) {
          console.warn(`Error checking OPFS file ${opfsPath}:`, error);
        }
        return false;
      }
    },
    []
  );

  const reinitializeInstance = useCallback(
    async (opfsPath: string) => {
      if (!opfsPath) {
        console.error("reinitializeInstance: opfsPath is invalid.");
        return;
      }
      await removeOpfsFile(opfsPath);
      await initInstance(opfsPath);
    },
    [removeOpfsFile, initInstance]
  );

  const terminateInstance = useCallback(
    async (opfsPath: string) => {
      if (!opfsPath) {
        console.error("terminateInstance: opfsPath is invalid.");
        return;
      }
      await terminateInstanceInternal(opfsPath);
    },
    [terminateInstanceInternal]
  );

  const contextValue: DuckDBContextType = {
    instances,
    initInstance,
    removeOpfsFile,
    checkOpfsFile,
    reinitializeInstance,
    terminateInstance,
  };

  return (
    <DuckDBContext.Provider value={contextValue}>
      {children}
    </DuckDBContext.Provider>
  );
}

export const DuckDBProvider = ({ children }: { children: React.ReactNode }) => (
  <DuckDBProviderWrapper>{children}</DuckDBProviderWrapper>
);
