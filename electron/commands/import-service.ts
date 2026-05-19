import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow } from "electron";
import { getFolderById, getOrCreateFolder, getIndexPaths } from "../database";
import type { AppState, FileRecord, ImportTaskItem, ImportTaskSnapshot } from "../types";
import { emit, taskId } from "./common";
import {
  collectFilesFromDirectoryWithRel,
  importBytes,
  importClipboardFile,
  importFilePath,
} from "./import-core";
import {
  importTaskSource,
  isFilePathImportItem,
  normalizeImportTaskItems,
} from "./import-task-items";
import { runPostImportPipeline } from "./post-import-pipeline";
import { isTerminalTaskStatus, scheduleTerminalTaskCleanup } from "./task-retention";

export {
  buildFileInputFromPath,
  collectFilesFromDirectory,
  collectFilesFromDirectoryWithRel,
  getTargetDir,
  importBytes,
  importClipboardFile,
  importExistingFilePath,
  importFilePath,
  normalizeImportExtension,
  timestampFromStats,
} from "./import-core";
export {
  ensureThumbnailForFile,
  runPostImportPipeline,
  shouldGenerateFileThumbnail,
  type PostImportContext,
  type PostImportSource,
} from "./post-import-pipeline";

const FILE_PATH_IMPORT_CONCURRENCY = 5;

type ImportTaskEntry = NonNullable<
  AppState["importTasks"] extends Map<string, infer Entry> ? Entry : never
>;

async function importTaskItem(
  state: AppState,
  item: ImportTaskItem,
  fallbackFolderId: number | null,
): Promise<FileRecord> {
  const folderId = item.folderId ?? fallbackFolderId;
  switch (item.kind) {
    case "base64_image":
      return importBytes(state, {
        bytes: Buffer.from(item.base64Data, "base64"),
        folderId,
        fallbackExt: item.ext,
        namePrefix: "paste",
      });
    case "binary_image":
      return importBytes(state, {
        bytes: Buffer.from(item.bytes),
        folderId,
        fallbackExt: item.ext,
        namePrefix: "paste",
        rating: item.rating,
        description: item.description,
        sourceUrl: item.sourceUrl,
        tagIds: item.tagIds,
      });
    case "clipboard_file":
      return importClipboardFile(state, {
        sourcePath: item.sourcePath,
        folderId,
        ext: item.ext,
        rating: item.rating,
        description: item.description,
        sourceUrl: item.sourceUrl,
        tagIds: item.tagIds,
      });
    case "file_path":
      return importFilePath(state, item.path, folderId);
  }
}

async function runImportTask(
  state: AppState,
  window: BrowserWindow | null,
  id: string,
): Promise<void> {
  const entry = state.importTasks.get(id);
  if (!entry) return;
  entry.snapshot.status = "running";
  emit(window, "import-task-updated", id);

  const recordResult = (
    index: number,
    item: ImportTaskItem,
    file: FileRecord | null,
    error?: unknown,
  ) => {
    const source = importTaskSource(item);
    if (file) {
      entry.snapshot.successCount += 1;
      entry.snapshot.results.push({ index, status: "completed", source, error: null, file });
      runPostImportPipeline(state, window, file, { source: "import_task" });
    } else {
      entry.snapshot.failureCount += 1;
      entry.snapshot.results.push({
        index,
        status: "failed",
        source,
        error: error instanceof Error ? error.message : String(error),
        file: null,
      });
    }

    entry.snapshot.processed += 1;
    entry.snapshot.status =
      entry.snapshot.processed === entry.snapshot.total
        ? entry.snapshot.failureCount > 0
          ? "completed_with_errors"
          : "completed"
        : "running";
    emit(window, "import-task-updated", id);
  };

  const processOne = async (index: number, item: ImportTaskItem): Promise<void> => {
    if (entry.cancelled) {
      entry.snapshot.status = "cancelled";
      emit(window, "import-task-updated", id);
      return;
    }

    try {
      recordResult(index, item, await importTaskItem(state, item, entry.folderId));
    } catch (error) {
      recordResult(index, item, null, error);
    }
  };

  try {
    if (entry.items.length > 1 && entry.items.every(isFilePathImportItem)) {
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(FILE_PATH_IMPORT_CONCURRENCY, entry.items.length) },
        async () => {
          while (!entry.cancelled) {
            const index = nextIndex;
            nextIndex += 1;
            const item = entry.items[index];
            if (!item) {
              return;
            }
            await processOne(index, item);
          }
        },
      );
      await Promise.all(workers);
    } else {
      for (const [index, item] of entry.items.entries()) {
        await processOne(index, item);
        if (entry.cancelled) {
          return;
        }
      }
    }

    if (entry.cancelled && entry.snapshot.processed < entry.snapshot.total) {
      entry.snapshot.status = "cancelled";
      emit(window, "import-task-updated", id);
    }
  } finally {
    const latestEntry = state.importTasks.get(id);
    if (latestEntry && isTerminalTaskStatus(latestEntry.snapshot.status)) {
      compactImportTaskEntry(latestEntry);
      scheduleTerminalTaskCleanup(state.importTasks, id);
    }
  }
}

function compactImportTaskEntry(entry: ImportTaskEntry): void {
  if (!entry.items.length) {
    return;
  }

  const failedIndexes = new Set(
    entry.snapshot.results
      .filter((result) => result.status === "failed")
      .map((result) => result.index),
  );
  entry.retryItems = entry.items.filter((_item, index) => failedIndexes.has(index));
  entry.items = [];
}

export async function startImportTask(
  state: AppState,
  window: BrowserWindow | null,
  rawItems: unknown[],
  folderId: number | null,
): Promise<ImportTaskSnapshot> {
  const items = normalizeImportTaskItems(rawItems);
  const indexPath = getIndexPaths(state.db)[0] ?? state.indexPath;
  const expanded: ImportTaskItem[] = [];
  for (const item of items) {
    if (item.kind === "file_path") {
      try {
        const stats = await fs.stat(item.path);
        if (stats.isDirectory()) {
          const itemFolderId = item.folderId ?? folderId;
          const parentPath =
            itemFolderId !== null
              ? (getFolderById(state.db, itemFolderId)?.path ?? indexPath)
              : indexPath;
          const dirName = path.basename(item.path);
          const destDir = path.join(parentPath, dirName);
          const files = await collectFilesFromDirectoryWithRel(item.path);
          for (const f of files) {
            const targetFolderId =
              f.relDir === "."
                ? getOrCreateFolder(state.db, destDir, [indexPath])
                : getOrCreateFolder(state.db, path.join(destDir, f.relDir), [indexPath]);
            expanded.push({
              kind: "file_path",
              path: f.abs,
              folderId: targetFolderId ?? itemFolderId,
            });
          }
          continue;
        }
      } catch {
        // Let item-level import record the failure with the original source.
      }
    }
    expanded.push(item);
  }

  const id = `import-${taskId()}`;
  const snapshot: ImportTaskSnapshot = {
    id,
    status: "queued",
    total: expanded.length,
    processed: 0,
    successCount: 0,
    failureCount: 0,
    results: [],
  };
  state.importTasks.set(id, { snapshot, items: expanded, folderId, cancelled: false });
  void runImportTask(state, window, id);
  return snapshot;
}
