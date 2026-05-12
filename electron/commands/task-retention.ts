const DEFAULT_TERMINAL_TASK_RETENTION_MS = 60_000;
const DEFAULT_MAX_RETAINED_TERMINAL_TASKS = 8;

const TERMINAL_TASK_STATUSES = new Set([
  "completed",
  "completed_with_errors",
  "cancelled",
  "failed",
]);

type TerminalTaskEntry = {
  snapshot: {
    status: string;
  };
};

const cleanupTimers = new WeakMap<
  Map<string, TerminalTaskEntry>,
  Map<string, ReturnType<typeof setTimeout>>
>();

export function isTerminalTaskStatus(status: string): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

function getCleanupTimers(tasks: Map<string, TerminalTaskEntry>) {
  let timers = cleanupTimers.get(tasks);
  if (!timers) {
    timers = new Map();
    cleanupTimers.set(tasks, timers);
  }
  return timers;
}

function clearCleanupTimer(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  taskId: string,
): void {
  const timer = timers.get(taskId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  timers.delete(taskId);
}

function pruneRetainedTerminalTasks(
  tasks: Map<string, TerminalTaskEntry>,
  timers: Map<string, ReturnType<typeof setTimeout>>,
  maxRetainedTerminalTasks: number,
): void {
  const terminalTaskIds = Array.from(tasks.entries())
    .filter(([, entry]) => isTerminalTaskStatus(entry.snapshot.status))
    .map(([taskId]) => taskId);
  const overflow = terminalTaskIds.length - Math.max(1, maxRetainedTerminalTasks);

  if (overflow <= 0) {
    return;
  }

  for (const taskId of terminalTaskIds.slice(0, overflow)) {
    clearCleanupTimer(timers, taskId);
    tasks.delete(taskId);
  }
}

export function scheduleTerminalTaskCleanup<T extends TerminalTaskEntry>(
  tasks: Map<string, T>,
  taskId: string,
  options: {
    retentionMs?: number;
    maxRetainedTerminalTasks?: number;
  } = {},
): void {
  const entry = tasks.get(taskId);
  if (!entry || !isTerminalTaskStatus(entry.snapshot.status)) {
    return;
  }

  const taskMap = tasks as Map<string, TerminalTaskEntry>;
  const timers = getCleanupTimers(taskMap);

  if (!timers.has(taskId)) {
    const retentionMs = options.retentionMs ?? DEFAULT_TERMINAL_TASK_RETENTION_MS;
    const timer = setTimeout(
      () => {
        taskMap.delete(taskId);
        timers.delete(taskId);
      },
      Math.max(0, retentionMs),
    );
    timer.unref?.();
    timers.set(taskId, timer);
  }

  pruneRetainedTerminalTasks(
    taskMap,
    timers,
    options.maxRetainedTerminalTasks ?? DEFAULT_MAX_RETAINED_TERMINAL_TASKS,
  );
}
