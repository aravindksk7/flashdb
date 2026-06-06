export type TaskType = 'create-clone' | 'delete-clone' | 'create-checkpoint' | 'restore-checkpoint';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface Task {
    id: string;
    type: TaskType;
    status: TaskStatus;
    payload: Record<string, any>;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    retryCount: number;
}
export interface QueueMetrics {
    queueDepth: number;
    pendingTasks: number;
    processingTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageProcessingTimeMs: number;
    totalTasksProcessed: number;
    errorCount: number;
}
declare class TaskQueue {
    private queue;
    private queueFilePath;
    private completedTasks;
    private failedTasks;
    private totalTasksProcessed;
    private processingTimes;
    constructor();
    private ensureDataDirectory;
    loadQueue(): void;
    private saveQueue;
    enqueue(type: TaskType, payload: Record<string, any>): Task;
    dequeue(): Task | null;
    updateTask(id: string, status: TaskStatus, _result?: any, error?: string): void;
    getMetrics(): QueueMetrics;
    getTask(id: string): Task | null;
    getAllTasks(): {
        queue: Task[];
        completed: Task[];
        failed: Task[];
    };
    getPendingTasks(): Task[];
    getProcessingTasks(): Task[];
    getCompletedTasks(): Task[];
    getFailedTasks(): Task[];
    clearCompletedTasks(): void;
    clearFailedTasks(): void;
    retryTask(id: string): boolean;
}
export declare function getTaskQueue(): TaskQueue;
export declare function initializeTaskQueue(): TaskQueue;
export declare function resetTaskQueueForTesting(): void;
export { TaskQueue };
//# sourceMappingURL=taskQueue.d.ts.map