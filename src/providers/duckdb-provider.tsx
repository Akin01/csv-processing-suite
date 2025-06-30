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

const loadDuckDB = async (): Promise<typeof DuckDBTypes> => {
  if (typeof window !== "undefined") {
    return await import("@duckdb/duckdb-wasm");
  }
  throw new Error("DuckDB can only be loaded on the client side");
};

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

const DuckDBContext = createContext<DuckDBContextType | undefined>(undefined);

export const useDuckDB = (opfsPath: string) => {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error("useDuckDB must be used within a DuckDBProvider");
  }

  const { instances, initInstance, ...actions } = context;
  const instance = instances.get(opfsPath);

  useEffect(() => {
    if (!instance || (!instance.isReady && !instance.isLoading)) {
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

  const currentDisplayInstance = instance || defaultLoadingInstance;

  return {
    ...currentDisplayInstance,
    removeOpfsFile: () => actions.removeOpfsFile(opfsPath),
    checkOpfsFile: () => actions.checkOpfsFile(opfsPath),
    reinitializeInstance: () => actions.reinitializeInstance(opfsPath),
    terminateInstance: () => actions.terminateInstance(opfsPath),
  };
};

interface DuckDBProviderWrapperProps {
  children: React.ReactNode;
}

export function DuckDBProviderWrapper({
  children,
}: DuckDBProviderWrapperProps) {
  const [instances, setInstances] = useState<Map<string, ManagedInstance>>(
    () => new Map()
  );
  const mounted = useRef(true);
  const instancesRef = useRef(instances);
  const initLocksRef = useRef(new Set<string>()); // Added lock ref

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  const updateInstanceState = useCallback(
    (opfsPath: string, newState: Partial<ManagedInstance>) => {
      setInstances((prevInstances) => {
        const newInstances = new Map(prevInstances);
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
      if (typeof opfsPath !== "string" || !opfsPath) {
        return;
      }
      // console.log(`terminateInstanceInternal: Terminating instance for ${opfsPath}`);
      const instance = instancesRef.current.get(opfsPath);

      if (instance?.db) {
        // console.log(`terminateInstanceInternal: Calling db.terminate() for ${opfsPath}`);
        try {
          await instance.db.terminate();
          // console.log(`terminateInstanceInternal: db.terminate() completed for ${opfsPath}`);
        } catch (e) {
          console.warn(`Error terminating DB for ${opfsPath}`, e);
        }
      }
      if (instance?.worker) {
        // console.log(`terminateInstanceInternal: Terminating worker for ${opfsPath}`);
        instance.worker.terminate();
      }
      // console.log(`terminateInstanceInternal: Updating state for ${opfsPath} post-termination.`);
      updateInstanceState(opfsPath, {
        db: null,
        worker: null,
        isReady: false,
        isLoading: false, // Ensure isLoading is false after termination
        error: null, // Clear any previous error
      });
    },
    [updateInstanceState]
  );

  const initInstance = useCallback(
    async (opfsPath: string) => {
      if (typeof opfsPath !== "string" || !opfsPath) {
        updateInstanceState(opfsPath || "undefined_path", {
          isLoading: false,
          error: "Invalid OPFS Path provided for initialization",
          db: null,
          worker: null,
          isReady: false,
        });
        return;
      }

      // Check instance state *before* acquiring the lock to quickly bail out
      const currentInstanceFromState = instancesRef.current.get(opfsPath);
      if (
        currentInstanceFromState &&
        (currentInstanceFromState.isLoading || currentInstanceFromState.isReady)
      ) {
        // console.log(`initInstance: Instance ${opfsPath} is already loading or ready (checked before lock). Skipping.`);
        return;
      }

      if (initLocksRef.current.has(opfsPath)) {
        console.warn(
          `Initialization for ${opfsPath} is already in progress (lock held). Skipping.`
        );
        return;
      }

      try {
        initLocksRef.current.add(opfsPath);
        // console.log(`initInstance: Lock acquired for ${opfsPath}`);

        if (!mounted.current) {
          // console.log(`initInstance: Component unmounted for ${opfsPath}. Aborting.`);
          return;
        }

        const existingInstance = instancesRef.current.get(opfsPath); // Changed to const

        // This check might seem redundant given the pre-lock check, but handles potential state changes
        // or ensures consistency if the pre-lock check saw slightly stale state.
        if (
          existingInstance &&
          (existingInstance.isLoading || existingInstance.isReady)
        ) {
          // console.log(`initInstance: Instance ${opfsPath} became loading or ready after lock acquired. Skipping.`);
          return;
        }

        if (existingInstance) {
          // console.log(`initInstance: Terminating existing non-ready/non-loading instance for ${opfsPath} (after lock).`);
          await terminateInstanceInternal(opfsPath);
        }

        // console.log(`initInstance: Proceeding with initialization for ${opfsPath} (lock acquired).`);
        updateInstanceState(opfsPath, {
          isLoading: true,
          error: null,
          isReady: false,
          db: null,
          worker: null,
        });

        // Original try/catch for DuckDB initialization starts here
        try {
          const duckdb = await loadDuckDB();
          let bundle;
          let worker: Worker;

          try {
            const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
            bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
            if (!mounted.current) return;
            const workerResponse = await fetch(bundle.mainWorker!);
            const workerBlob = await workerResponse.blob();
            const workerUrl = URL.createObjectURL(workerBlob);
            worker = new Worker(workerUrl);
            URL.revokeObjectURL(workerUrl);
          } catch (corsError) {
            console.warn(
              `CDN worker loading failed for ${opfsPath}, trying direct:`,
              corsError
            );
            const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
            bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
            if (!mounted.current) return;
            worker = new Worker(bundle.mainWorker!);
          }

          updateInstanceState(opfsPath, { worker });

          const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
          const duckDbInstance = new duckdb.AsyncDuckDB(logger, worker);

          await duckDbInstance.instantiate(
            bundle.mainModule,
            bundle.pthreadWorker
          );

          try {
            await duckDbInstance.open({
              path: opfsPath,
              accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
            });
          } catch (openError) {
            console.warn(`DB open failed for ${opfsPath}:`, openError);
            if (
              openError instanceof Error &&
              (openError.message.includes("WAL file") ||
                openError.message.includes("createSyncAccessHandle")) // Broader check for WAL related or access handle issues
            ) {
              console.log(
                `Attempting recovery for ${opfsPath} due to: ${openError.message}`
              );
              try {
                await duckDbInstance.terminate();
              } catch (termError) {
                console.warn(
                  `Failed to terminate for recovery ${opfsPath}:`,
                  termError
                );
              }
              // Ensure worker is also cleared from state if db.terminate failed to clear its own worker reference or if worker was the issue
              updateInstanceState(opfsPath, {
                worker: null,
                db: null,
                isLoading: true,
              });

              if (navigator.storage && navigator.storage.getDirectory) {
                const opfsRoot = await navigator.storage.getDirectory();
                const baseName = opfsPath.startsWith("opfs://")
                  ? opfsPath.substring("opfs://".length)
                  : opfsPath;
                const dbFiles = [
                  baseName,
                  `${baseName}.wal`,
                  `${baseName}.tmp`,
                ];
                // console.log(`Recovery: Removing files for ${opfsPath}: ${dbFiles.join(', ')}`);
                for (const fileName of dbFiles) {
                  try {
                    await opfsRoot.removeEntry(fileName);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  } catch (_e) {
                    /* ignore if not found */
                  }
                }
              }

              // Create a new worker for the recovery attempt
              const newWorkerResponse = await fetch(bundle.mainWorker!);
              const newWorkerBlob = await newWorkerResponse.blob();
              const newWorkerUrl = URL.createObjectURL(newWorkerBlob);
              const newWorker = new Worker(newWorkerUrl);
              URL.revokeObjectURL(newWorkerUrl);
              updateInstanceState(opfsPath, {
                worker: newWorker,
                isLoading: true,
              }); // Update state with new worker

              const freshDuckDbInstance = new duckdb.AsyncDuckDB(
                logger,
                newWorker
              );
              await freshDuckDbInstance.instantiate(
                bundle.mainModule,
                bundle.pthreadWorker
              );
              try {
                // console.log(`Recovery: Attempting to open fresh DB for ${opfsPath}`);
                await freshDuckDbInstance.open({
                  path: opfsPath,
                  accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
                });
              } catch (walOpenError) {
                console.error(
                  `Recovery: Failed to open fresh DB for ${opfsPath}`,
                  walOpenError
                );
                newWorker.terminate(); // Terminate the new worker if recovery open fails
                updateInstanceState(opfsPath, {
                  error: `Recovery failed: ${
                    walOpenError instanceof Error
                      ? walOpenError.message
                      : String(walOpenError)
                  }`,
                  isLoading: false,
                  isReady: false,
                  db: null,
                  worker: null,
                });
                return; // Exit initInstance after failed recovery
              }

              if (!mounted.current) {
                await freshDuckDbInstance.terminate();
                newWorker.terminate();
                return;
              }
              // console.log(`Recovery successful for ${opfsPath}.`);
              updateInstanceState(opfsPath, {
                db: freshDuckDbInstance,
                isReady: true,
                isLoading: false,
                error: null,
              });
              return; // Exit initInstance after successful recovery
            }
            throw openError; // Re-throw if not a handled WAL/access issue
          }

          if (!mounted.current) {
            await duckDbInstance.terminate();
            worker.terminate();
            return;
          }
          // console.log(`DuckDB instance ${opfsPath} initialized successfully.`);
          updateInstanceState(opfsPath, {
            db: duckDbInstance,
            isReady: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          // This is the catch from the original duckdb init logic
          console.error(`DuckDB init error for ${opfsPath}:`, err);
          // Ensure worker from this attempt is cleaned if one was created and stored in state
          // as part of this failed attempt.
          const currentAttemptInstance = instancesRef.current.get(opfsPath);
          if (currentAttemptInstance?.worker) {
            // console.log(`Terminating worker from failed init attempt for ${opfsPath}`);
            currentAttemptInstance.worker.terminate();
          }
          updateInstanceState(opfsPath, {
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
            isReady: false,
            db: null,
            worker: null,
          });
        }
        // End of original try/catch for DuckDB initialization
      } catch (outerError) {
        // This catch is for unexpected errors in the locking mechanism or pre-init logic
        console.error(
          `DuckDB initInstance outer error for ${opfsPath}:`,
          outerError
        );
        updateInstanceState(opfsPath, {
          error:
            outerError instanceof Error
              ? outerError.message
              : String(outerError),
          isLoading: false,
          isReady: false,
          db: null,
          worker: null,
        });
      } finally {
        initLocksRef.current.delete(opfsPath);
        // console.log(`initInstance: Lock released for ${opfsPath}`);
      }
    },
    [updateInstanceState, terminateInstanceInternal]
  );

  const removeOpfsFile = useCallback(
    async (opfsPath: string): Promise<boolean> => {
      if (typeof opfsPath !== "string" || !opfsPath) {
        console.error(
          "removeOpfsFile: opfsPath is undefined or invalid. Cannot remove files."
        );
        return false;
      }
      await terminateInstanceInternal(opfsPath);

      try {
        if (navigator.storage && navigator.storage.getDirectory) {
          const opfsRoot = await navigator.storage.getDirectory();
          const baseName = opfsPath.startsWith("opfs://")
            ? opfsPath.substring("opfs://".length)
            : opfsPath;

          const dbFiles = [baseName, `${baseName}.wal`, `${baseName}.tmp`];
          let allRemoved = true;
          for (const fileName of dbFiles) {
            try {
              await opfsRoot.removeEntry(fileName);
            } catch (removeError) {
              if (
                !(
                  removeError instanceof Error &&
                  removeError.name === "NotFoundError"
                )
              ) {
                console.warn(
                  `Could not remove ${fileName} for ${opfsPath}:`,
                  removeError
                );
                allRemoved = false;
              }
            }
          }
          return allRemoved;
        }
        return false;
      } catch (error) {
        console.error(`Error removing OPFS files for ${opfsPath}:`, error);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateInstanceState, terminateInstanceInternal] // updateInstanceState is stable
  );

  const checkOpfsFile = useCallback(
    async (opfsPath: string): Promise<boolean> => {
      if (typeof opfsPath !== "string" || !opfsPath) {
        console.error(
          "checkOpfsFile: opfsPath is undefined or invalid. Cannot check file."
        );
        return false;
      }
      try {
        if (navigator.storage && navigator.storage.getDirectory) {
          const opfsRoot = await navigator.storage.getDirectory();
          const baseName = opfsPath.startsWith("opfs://")
            ? opfsPath.substring("opfs://".length)
            : opfsPath;
          try {
            await opfsRoot.getFileHandle(baseName);
            return true;
          } catch (error) {
            if (error instanceof Error && error.name === "NotFoundError")
              return false;
            console.warn(
              `Error checking OPFS file ${baseName} for ${opfsPath}:`,
              error
            );
            return false;
          }
        }
        return false;
      } catch (error) {
        console.error(
          `Error checking OPFS file system for ${opfsPath}:`,
          error
        );
        return false;
      }
    },
    []
  );

  const reinitializeInstance = useCallback(
    async (opfsPath: string) => {
      if (typeof opfsPath !== "string" || !opfsPath) {
        console.error(
          "reinitializeInstance: opfsPath is undefined or invalid."
        );
        return;
      }
      await removeOpfsFile(opfsPath);
      await initInstance(opfsPath);
    },
    [removeOpfsFile, initInstance]
  );

  const terminateInstance = useCallback(
    async (opfsPath: string) => {
      if (typeof opfsPath !== "string" || !opfsPath) {
        console.error("terminateInstance: opfsPath is undefined or invalid.");
        return;
      }
      await terminateInstanceInternal(opfsPath);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateInstanceState, terminateInstanceInternal] // updateInstanceState is stable
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // console.log("DuckDBProviderWrapper unmounting. Terminating all instances.");
      instancesRef.current.forEach((_instance, opfsPath) => { // Removed async from forEach callback
        terminateInstanceInternal(opfsPath); // Call directly
      });
      setInstances(new Map());
    };
  }, [terminateInstanceInternal]); // Added terminateInstanceInternal to dependency array

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

export const DuckDBProvider = ({ children }: { children: React.ReactNode }) => {
  return <DuckDBProviderWrapper>{children}</DuckDBProviderWrapper>;
};
