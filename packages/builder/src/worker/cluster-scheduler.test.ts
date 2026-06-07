import { describe, expect, it } from "vitest";

import {
  calculateWorkersToStart,
  createInitialTaskQueue,
  getAvailableWorkerSlots,
  getRequeueTaskIndexes,
  removeRequeuedPendingTasks,
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

  it("derives requeue task indexes and removes matching pending tasks", () => {
    const workerPending = new Map([
      ["3-1-100-0", 1],
      ["3-4-100-1", 4],
    ]);
    const pendingTasks = new Map<string, string>([
      ["3-1-100-0", "a"],
      ["3-4-100-1", "b"],
      ["2-4-100-0", "other-worker"],
    ]);

    const requeue = getRequeueTaskIndexes(workerPending);
    removeRequeuedPendingTasks(pendingTasks, 3, requeue);

    expect(requeue).toEqual([1, 4]);
    expect([...pendingTasks.keys()]).toEqual(["2-4-100-0"]);
    expect(getAvailableWorkerSlots(2, 5)).toBe(3);
  });
});
