export interface QueuedClusterTask {
  taskIndex: number;
}

export interface BatchTaskAssignment {
  taskId: string;
  taskIndex: number;
}

export function createInitialTaskQueue(
  totalTasks: number,
): QueuedClusterTask[] {
  return Array.from({ length: totalTasks }, (_, taskIndex) => ({
    taskIndex,
  }));
}

export function calculateWorkersToStart({
  concurrency,
  totalTasks,
  workerConcurrency,
}: {
  concurrency: number;
  totalTasks: number;
  workerConcurrency: number;
}): { requiredWorkers: number; workersToStart: number } {
  const requiredWorkers = Math.ceil(totalTasks / workerConcurrency);
  return {
    requiredWorkers,
    workersToStart: Math.min(concurrency, requiredWorkers),
  };
}

export function getAvailableWorkerSlots(
  currentTaskCount: number,
  workerConcurrency: number,
): number {
  return Math.max(0, workerConcurrency - currentTaskCount);
}

export function createClusterTaskId({
  sequence,
  taskIndex,
  timestamp,
  workerId,
}: {
  sequence: number;
  taskIndex: number;
  timestamp: number;
  workerId: number;
}): string {
  return `${workerId}-${taskIndex}-${timestamp}-${sequence}`;
}

export function selectBatchTaskAssignments({
  availableSlots,
  taskQueue,
  timestamp,
  workerId,
}: {
  availableSlots: number;
  taskQueue: QueuedClusterTask[];
  timestamp: number;
  workerId: number;
}): {
  remainingQueue: QueuedClusterTask[];
  tasks: BatchTaskAssignment[];
} {
  const tasksToAssign = Math.min(availableSlots, taskQueue.length);
  const selected = taskQueue.slice(0, tasksToAssign);

  return {
    remainingQueue: taskQueue.slice(tasksToAssign),
    tasks: selected.map((task, sequence) => ({
      taskId: createClusterTaskId({
        workerId,
        taskIndex: task.taskIndex,
        timestamp,
        sequence,
      }),
      taskIndex: task.taskIndex,
    })),
  };
}

export function getRequeueTaskIndexes(
  workerPending: Map<string, number> | undefined,
): number[] {
  return workerPending ? Array.from(workerPending.values()) : [];
}

export function removeRequeuedPendingTasks<T>(
  pendingTasks: Map<string, T>,
  workerId: number,
  taskIndexes: number[],
): void {
  const taskIndexSet = new Set(taskIndexes);
  for (const [taskId] of pendingTasks) {
    const [taskWorkerId, rawTaskIndex] = taskId.split("-");
    if (
      Number(taskWorkerId) === workerId &&
      taskIndexSet.has(Number(rawTaskIndex))
    ) {
      pendingTasks.delete(taskId);
    }
  }
}
