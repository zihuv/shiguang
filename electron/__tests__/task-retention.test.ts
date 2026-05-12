import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTerminalTaskCleanup } from "../commands/task-retention";

describe("task retention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes terminal tasks after the retention window", () => {
    const tasks = new Map([
      [
        "task-1",
        {
          snapshot: {
            status: "completed",
          },
        },
      ],
    ]);

    scheduleTerminalTaskCleanup(tasks, "task-1", { retentionMs: 1000 });

    expect(tasks.has("task-1")).toBe(true);
    vi.advanceTimersByTime(999);
    expect(tasks.has("task-1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tasks.has("task-1")).toBe(false);
  });

  it("prunes older terminal tasks without removing active tasks", () => {
    const tasks = new Map([
      ["terminal-1", { snapshot: { status: "completed" } }],
      ["active", { snapshot: { status: "running" } }],
      ["terminal-2", { snapshot: { status: "failed" } }],
      ["terminal-3", { snapshot: { status: "cancelled" } }],
    ]);

    scheduleTerminalTaskCleanup(tasks, "terminal-3", {
      retentionMs: 10_000,
      maxRetainedTerminalTasks: 2,
    });

    expect(tasks.has("terminal-1")).toBe(false);
    expect(tasks.has("active")).toBe(true);
    expect(tasks.has("terminal-2")).toBe(true);
    expect(tasks.has("terminal-3")).toBe(true);
  });
});
