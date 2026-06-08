import { Task } from './taskQueue';
declare class TaskWorker {
    private isRunning;
    private pollInterval;
    private inFlightTasks;
    private usePersistence;
    private isWindowsAbsolutePath;
    private normalizePathForMatch;
    private resolveMappedStoragePath;
    private assertStoragePathExists;
    private dropSqlCloneDatabaseIfPresent;
    /**
     * Phase 4: Drop checkpoint database safely
     * Called during checkpoint deletion to clean up physical SQL Server database
     * Non-fatal error handling: logs warnings but doesn't throw
     */
    private dropCheckpointDatabaseSafely;
    private resolveCloneDatabaseNameFromTaskHistory;
    private isRetryableTaskError;
    startWorker(): Promise<void>;
    stopWorker(gracefulWaitMs?: number): Promise<void>;
    private processNextTask;
    processTask(task: Task): Promise<void>;
    isWorkerRunning(): boolean;
    getInFlightTaskCount(): number;
}
export declare function getTaskWorker(): TaskWorker;
export declare function initializeTaskWorker(): TaskWorker;
export declare function resetTaskWorkerForTesting(): void;
export { TaskWorker };
//# sourceMappingURL=taskWorker.d.ts.map