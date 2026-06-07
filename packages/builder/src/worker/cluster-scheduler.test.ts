import { describe, expect, it } from "vitest";

import {
  calculateWorkersToStart,
  createInitialTaskQueue,
  getAvailableWorkerSlots,
  selectBatchTaskAssignments,
} from "./cluster-scheduler.js";

describe("cluster-scheduler", () => {
  it("calculates worker count from total tasks and per-worker concurrency", () => {
    expect(
      calculateWorkersToStart({
        concurrency: 8,
        totalTasks: 21,
        workerConcurrency: 5,
      }),
    ).toEqual({
      requiredWorkers: 5,
      workersToStart: 5,
    });
    expect(
      calculateWorkersToStart({
        concurrency: 2,
        totalTasks: 21,
        workerConcurrency: 5,
      }),
    ).toEqual({
      requiredWorkers: 5,
      workersToStart: 2,
    });
    expect(getAvailableWorkerSlots(2, 5)).toBe(3);
  });

  it("selects deterministic batch assignments without mutating the queue", () => {
    const queue = createInitialTaskQueue(4);
    const batch = selectBatchTaskAssignments({
      availableSlots: 2,
      taskQueue: queue,
      timestamp: 123,
      workerId: 7,
    });

    expect(batch.tasks).toEqual([
      { taskId: "7-0-123-0", taskIndex: 0 },
      { taskId: "7-1-123-1", taskIndex: 1 },
    ]);
    expect(batch.remainingQueue).toEqual([{ taskIndex: 2 }, { taskIndex: 3 }]);
    expect(queue).toEqual(createInitialTaskQueue(4));
  });
});
