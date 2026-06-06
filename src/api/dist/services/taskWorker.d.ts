import { Task } from './taskQueue';
declare class TaskWorker {
    private isRunning;
    private pollInterval;
    private inFlightTasks;
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