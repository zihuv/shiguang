import { CircleStop, LoaderCircle } from "lucide-react";
import { useAiBatchAnalyzeStore } from "@/stores/aiBatchAnalyzeStore";
import { useImportStore } from "@/stores/importStore";
import { useVisualIndexTaskStore } from "@/stores/visualIndexTaskStore";
import { cn } from "@/lib/utils";
import { getTaskProgressItem, type TaskProgressItem } from "@/components/TaskProgressTray.model";

function TaskProgressRow({ item, onCancel }: { item: TaskProgressItem; onCancel: () => void }) {
  return (
    <div className="min-w-0" role="status" aria-label={`${item.title} ${item.countLabel}`}>
      <div className="flex h-7 min-w-0 items-center gap-2">
        <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-500 dark:text-gray-300" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-800 dark:text-gray-100">
          {item.title}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          {item.countLabel}
        </span>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/[0.06] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
          title={`取消${item.title}`}
          aria-label={`取消${item.title}`}
          onClick={onCancel}
        >
          <CircleStop className="h-3.5 w-3.5" />
        </button>
      </div>
      {item.detail ? (
        <div className="mb-1 truncate pl-5 pr-8 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
          {item.detail}
        </div>
      ) : null}
      <div className="h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            item.kind === "import" && "bg-sky-500",
            item.kind === "ai-metadata" && "bg-violet-500",
            item.kind === "visual-index" && "bg-emerald-500",
          )}
          style={{ width: `${item.progress}%` }}
        />
      </div>
    </div>
  );
}

export default function TaskProgressTray() {
  const importTask = useImportStore((state) => state.importTask);
  const cancelImportTask = useImportStore((state) => state.cancelImportTask);
  const aiMetadataTask = useAiBatchAnalyzeStore((state) => state.aiMetadataTask);
  const cancelBatchAnalyze = useAiBatchAnalyzeStore((state) => state.cancelBatchAnalyze);
  const visualIndexTask = useVisualIndexTaskStore((state) => state.visualIndexTask);
  const cancelVisualIndexTask = useVisualIndexTaskStore((state) => state.cancelVisualIndexTask);

  const items: Array<{ item: TaskProgressItem; onCancel: () => void }> = [];
  const importItem = getTaskProgressItem("import", importTask);
  const aiMetadataItem = getTaskProgressItem("ai-metadata", aiMetadataTask);
  const visualIndexItem = getTaskProgressItem("visual-index", visualIndexTask);

  if (importItem) {
    items.push({ item: importItem, onCancel: () => void cancelImportTask() });
  }
  if (aiMetadataItem) {
    items.push({ item: aiMetadataItem, onCancel: () => void cancelBatchAnalyze() });
  }
  if (visualIndexItem) {
    items.push({ item: visualIndexItem, onCancel: () => void cancelVisualIndexTask() });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="app-no-drag pointer-events-auto absolute bottom-4 left-4 z-30 flex w-[min(20rem,calc(100%-2rem))] flex-col gap-2 rounded-2xl bg-white/94 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.14)] backdrop-blur dark:bg-[#171717]/94 dark:shadow-[0_18px_42px_rgba(0,0,0,0.38)]"
      aria-label="任务进度"
    >
      {items.map(({ item, onCancel }) => (
        <TaskProgressRow key={item.kind} item={item} onCancel={onCancel} />
      ))}
    </div>
  );
}
