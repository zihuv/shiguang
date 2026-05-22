import { isTerminalTaskStatus } from "@/stores/fileTypes";

export type TaskProgressKind = "import" | "ai-metadata" | "visual-index";

export interface TaskProgressSnapshot {
  status: string;
  total: number;
  processed: number;
  currentFileName?: string | null;
}

export interface TaskProgressItem {
  kind: TaskProgressKind;
  title: string;
  countLabel: string;
  detail: string | null;
  progress: number;
}

const TASK_TITLES: Record<TaskProgressKind, string> = {
  import: "导入",
  "ai-metadata": "AI 分析",
  "visual-index": "向量计算",
};

export function isActiveTaskStatus(status: string) {
  return !isTerminalTaskStatus(status);
}

export function getTaskProgressPercent(processed: number, total: number) {
  if (!Number.isFinite(processed) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

export function getTaskProgressItem(
  kind: TaskProgressKind,
  task: TaskProgressSnapshot | null,
): TaskProgressItem | null {
  if (!task || !isActiveTaskStatus(task.status)) {
    return null;
  }

  return {
    kind,
    title: TASK_TITLES[kind],
    countLabel: task.total > 0 ? `${task.processed}/${task.total}` : "准备中",
    detail: task.currentFileName?.trim() || null,
    progress: getTaskProgressPercent(task.processed, task.total),
  };
}
