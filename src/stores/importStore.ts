import { create } from "zustand";
import { toast } from "sonner";
import {
  cancelImportTask as cancelImportTaskCommand,
  getImportTask,
  startImportTask,
} from "@/services/desktop/files";
import {
  parseFileList,
  TERMINAL_IMPORT_TASK_STATUSES,
  type BinaryImageImportItem,
  type FileItem,
  type ImportTaskItem,
  type ImportTaskSnapshot,
} from "@/stores/fileTypes";
import { useFolderStore } from "@/stores/folderStore";
import { useLibraryQueryStore } from "@/stores/libraryQueryStore";
import { useSmartCollectionStore } from "@/stores/smartCollectionStore";
import { waitForDesktopTask } from "@/stores/taskWatcher";

interface ImportStore {
  importTask: ImportTaskSnapshot | null;
  setImportTask: (task: ImportTaskSnapshot | null) => void;
  importFile: (
    sourcePath: string,
    refresh?: boolean,
    targetFolderId?: number | null,
  ) => Promise<FileItem | null>;
  importFiles: (sourcePaths: string[], targetFolderId?: number | null) => Promise<FileItem[]>;
  importImageFromBase64: (
    base64Data: string,
    ext: string,
    refresh?: boolean,
    targetFolderId?: number | null,
  ) => Promise<FileItem | null>;
  importImagesFromBase64: (
    items: { base64Data: string; ext: string }[],
    targetFolderId?: number | null,
  ) => Promise<FileItem[]>;
  importBinaryImage: (
    bytes: Uint8Array,
    ext: string,
    refresh?: boolean,
    targetFolderId?: number | null,
  ) => Promise<FileItem | null>;
  importBinaryImages: (
    items: BinaryImageImportItem[],
    targetFolderId?: number | null,
  ) => Promise<FileItem[]>;
  cancelImportTask: () => Promise<void>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function notifyImportTaskResult(task: ImportTaskSnapshot) {
  if (task.status === "completed") {
    toast.success(`已导入 ${task.successCount} 个素材`);
    return;
  }

  if (task.status === "completed_with_errors") {
    if (task.successCount > 0) {
      toast.error(`导入完成：成功 ${task.successCount} 个素材，失败 ${task.failureCount} 个`);
      return;
    }

    toast.error(`导入失败，${task.failureCount} 个素材未导入`);
    return;
  }

  if (task.status === "cancelled") {
    toast.error(`导入已取消：已完成 ${task.processed}/${task.total}`);
    return;
  }

  if (task.status === "failed") {
    toast.error("导入失败");
  }
}

function decodeBase64ToBytes(base64Data: string) {
  return Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0));
}

function toImportTaskItem(item: BinaryImageImportItem): ImportTaskItem {
  if (item.sourcePath) {
    return {
      kind: "clipboard_file",
      sourcePath: item.sourcePath,
      ext: item.ext,
      rating: item.rating,
      description: item.description,
      sourceUrl: item.sourceUrl,
      tagIds: item.tagIds,
    };
  }

  return {
    kind: "binary_image",
    bytes: item.bytes ?? new Uint8Array(),
    ext: item.ext,
    rating: item.rating,
    description: item.description,
    sourceUrl: item.sourceUrl,
    tagIds: item.tagIds,
  };
}

async function finalizeImportTask(
  task: ImportTaskSnapshot,
  setImportTask: (task: ImportTaskSnapshot | null) => void,
) {
  const results = parseFileList(
    task.results
      .filter((result) => result.status === "completed" && result.file)
      .map((result) => result.file as FileItem),
  );

  await delay(0);
  await useLibraryQueryStore.getState().runCurrentQuery();
  await useFolderStore.getState().loadFolders();
  await useSmartCollectionStore.getState().loadStats();
  notifyImportTaskResult(task);
  setImportTask(null);
  return results;
}

export const useImportStore = create<ImportStore>((set, get) => ({
  importTask: null,

  setImportTask: (task) => set({ importTask: task }),

  importFile: async (sourcePath, refresh = true, targetFolderId) => {
    const files = await get().importFiles([sourcePath], targetFolderId);
    if (!refresh && files.length > 0) {
      return files[0];
    }
    return files[0] ?? null;
  },

  importFiles: async (sourcePaths, targetFolderId) => {
    if (sourcePaths.length === 0) return [];

    const selectedFolderId =
      targetFolderId !== undefined
        ? targetFolderId
        : useLibraryQueryStore.getState().selectedFolderId;

    try {
      const items: ImportTaskItem[] = sourcePaths.map((path) => ({ kind: "file_path", path }));
      const task = await startImportTask({
        items,
        folderId: selectedFolderId,
      });
      set({ importTask: task });

      const currentTask = await waitForDesktopTask({
        eventChannel: "import-task-updated",
        getSnapshot: getImportTask,
        isTerminal: (status) => TERMINAL_IMPORT_TASK_STATUSES.has(status),
        onUpdate: (nextTask) => set({ importTask: nextTask }),
        taskId: task.id,
      });

      return await finalizeImportTask(currentTask, (nextTask) => set({ importTask: nextTask }));
    } catch (error) {
      console.error("Failed to import files:", error);
      set({ importTask: null });
      return [];
    }
  },

  importImageFromBase64: async (base64Data, ext, refresh = true, targetFolderId) => {
    const files = await get().importBinaryImages(
      [{ bytes: decodeBase64ToBytes(base64Data), ext }],
      targetFolderId,
    );
    if (!refresh && files.length > 0) {
      return files[0];
    }
    return files[0] ?? null;
  },

  importImagesFromBase64: async (items, targetFolderId) => {
    return get().importBinaryImages(
      items.map((item) => ({
        bytes: decodeBase64ToBytes(item.base64Data),
        ext: item.ext,
      })),
      targetFolderId,
    );
  },

  importBinaryImage: async (bytes, ext, refresh = true, targetFolderId) => {
    const files = await get().importBinaryImages([{ bytes, ext }], targetFolderId);
    if (!refresh && files.length > 0) {
      return files[0];
    }
    return files[0] ?? null;
  },

  importBinaryImages: async (items, targetFolderId) => {
    if (items.length === 0) return [];

    const selectedFolderId =
      targetFolderId !== undefined
        ? targetFolderId
        : useLibraryQueryStore.getState().selectedFolderId;

    try {
      const taskItems = items.map(toImportTaskItem);
      const task = await startImportTask({
        items: taskItems,
        folderId: selectedFolderId,
      });
      set({ importTask: task });

      const currentTask = await waitForDesktopTask({
        eventChannel: "import-task-updated",
        getSnapshot: getImportTask,
        isTerminal: (status) => TERMINAL_IMPORT_TASK_STATUSES.has(status),
        onUpdate: (nextTask) => set({ importTask: nextTask }),
        taskId: task.id,
      });

      return await finalizeImportTask(currentTask, (nextTask) => set({ importTask: nextTask }));
    } catch (error) {
      console.error("Failed to import images:", error);
      set({ importTask: null });
      return [];
    }
  },

  cancelImportTask: async () => {
    const task = get().importTask;
    if (!task || TERMINAL_IMPORT_TASK_STATUSES.has(task.status)) {
      return;
    }

    await cancelImportTaskCommand(task.id);
  },
}));
