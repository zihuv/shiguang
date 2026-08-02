import { BrowserWindow } from "electron";
import log from "electron-log/main";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import {
  clearFilesFolderId,
  countPresentFilesInDir,
  deleteFolderRecord,
  filePathsInDir,
  findMoveCandidateByContentHash,
  getAllFolders,
  getFileById,
  getFileByPath,
  getFolderByPath,
  getIndexPaths,
  getOrCreateFolder,
  isFileUnchanged,
  markFileMissingByPath,
  updateFileBasicInfo,
  updateFileColorData,
  updateFilePathAndFolder,
  upsertFile,
  relocateFolderSubtree,
} from "../database";
import {
  detectExtensionFromPath,
  isBlockedUnsupportedExtension,
  isScanSupportedExtension,
} from "../media";
import { isHiddenName, pathHasPrefix } from "../path-utils";
import { removeThumbnailForFile } from "../storage";
import {
  classifyExistingPathSync,
  selectFoldersToPrune,
  shouldUseMoveCandidate,
  type LibrarySyncChangeKind,
} from "../library-sync-logic";
import type { AppState } from "../types";
import { emit, type GetWindow } from "./common";
import {
  buildFileInputFromPath,
  normalizeImportExtension,
  runPostImportPipeline,
  timestampFromStats,
} from "./import-service";

let libraryWatcher: FSWatcher | null = null;
let librarySyncQueue = Promise.resolve();
let librarySyncFlushTimer: NodeJS.Timeout | null = null;
let librarySyncScanTimer: NodeJS.Timeout | null = null;
let lastLibrarySyncScanAt = 0;
const pendingLibraryUnlinks = new Map<string, NodeJS.Timeout>();
const pendingLibraryChanges = new Map<string, NodeJS.Timeout>();
const pendingDirectoryUnlinks = new Map<string, NodeJS.Timeout>();
const directoryIdentityByPath = new Map<string, string>();
const directoryPathByIdentity = new Map<string, string>();

interface LibrarySyncSummary {
  added: number;
  updated: number;
  removed: number;
  moved: number;
  skipped: number;
  scanned: number;
  errorCount: number;
}

function emptyLibrarySyncSummary(): LibrarySyncSummary {
  return {
    added: 0,
    updated: 0,
    removed: 0,
    moved: 0,
    skipped: 0,
    scanned: 0,
    errorCount: 0,
  };
}

const pendingLibrarySyncSummary = emptyLibrarySyncSummary();

function hasLibrarySyncChanges(summary: LibrarySyncSummary): boolean {
  return (
    summary.added > 0 ||
    summary.updated > 0 ||
    summary.removed > 0 ||
    summary.moved > 0 ||
    summary.errorCount > 0
  );
}

function recordLibrarySyncChange(
  window: BrowserWindow | null,
  kind: LibrarySyncChangeKind,
  scanned = 1,
): void {
  pendingLibrarySyncSummary.scanned += scanned;
  if (kind === "added") pendingLibrarySyncSummary.added += 1;
  if (kind === "updated") pendingLibrarySyncSummary.updated += 1;
  if (kind === "removed") pendingLibrarySyncSummary.removed += 1;
  if (kind === "moved") pendingLibrarySyncSummary.moved += 1;
  if (kind === "skipped") pendingLibrarySyncSummary.skipped += 1;

  if (librarySyncFlushTimer) {
    return;
  }
  librarySyncFlushTimer = setTimeout(() => {
    librarySyncFlushTimer = null;
    const summary = { ...pendingLibrarySyncSummary };
    Object.assign(pendingLibrarySyncSummary, emptyLibrarySyncSummary());
    if (hasLibrarySyncChanges(summary)) {
      emit(window, "library-sync-updated", summary);
    }
  }, 500);
}

export async function scanFoldersOnly(state: AppState, rootPath: string): Promise<number> {
  const indexPaths = getIndexPaths(state.db);
  let count = 0;

  async function visit(dir: string, depth: number): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || isHiddenName(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (depth >= 0) {
        getOrCreateFolder(state.db, child, indexPaths);
        count += 1;
      }
      await visit(child, depth + 1);
    }
  }

  await visit(rootPath, 0);
  pruneMissingEmptyFolders(state, rootPath);
  return count;
}

function directoryIdentity(stats: fssync.Stats): string {
  return `${stats.dev}:${stats.ino}`;
}

function rememberDirectory(dirPath: string, stats: fssync.Stats): void {
  const identity = directoryIdentity(stats);
  const previousPath = directoryPathByIdentity.get(identity);
  if (previousPath && previousPath !== dirPath) {
    directoryIdentityByPath.delete(previousPath);
  }
  directoryIdentityByPath.set(dirPath, identity);
  directoryPathByIdentity.set(identity, dirPath);
}

async function seedDirectoryIdentities(rootPaths: string[]): Promise<void> {
  async function visit(dirPath: string): Promise<void> {
    let stats: fssync.Stats;
    let entries: fssync.Dirent[];
    try {
      [stats, entries] = await Promise.all([
        fs.stat(dirPath),
        fs.readdir(dirPath, { withFileTypes: true }),
      ]);
    } catch {
      return;
    }
    rememberDirectory(dirPath, stats);
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !isHiddenName(entry.name))
        .map((entry) => visit(path.join(dirPath, entry.name))),
    );
  }

  await Promise.all(rootPaths.map(visit));
}

function pruneMissingEmptyFolders(state: AppState, rootPath: string): void {
  const idsToPrune = selectFoldersToPrune({
    folders: getAllFolders(state.db),
    rootPath,
    existsOnDisk: (folderPath) => fssync.existsSync(folderPath),
    inRenameWindow: (folderPath) => pendingDirectoryUnlinks.has(folderPath),
    presentFileCount: (folderPath) => countPresentFilesInDir(state.db, folderPath),
  });
  if (idsToPrune.length === 0) {
    return;
  }
  clearFilesFolderId(state.db, idsToPrune);
  for (const id of idsToPrune) {
    deleteFolderRecord(state.db, id);
  }
}

async function syncAddedDirectory(
  state: AppState,
  getWindow: GetWindow,
  dirPath: string,
): Promise<void> {
  if (isHiddenName(path.basename(dirPath))) {
    return;
  }

  let stats: fssync.Stats;
  try {
    stats = await fs.stat(dirPath);
  } catch {
    return;
  }
  const identity = directoryIdentity(stats);
  const previousPath = directoryPathByIdentity.get(identity);
  const indexPaths = getIndexPaths(state.db);
  const parentPath = path.dirname(dirPath);
  const parentId = getFolderByPath(state.db, parentPath)?.id ?? null;

  if (
    previousPath &&
    previousPath !== dirPath &&
    !fssync.existsSync(previousPath) &&
    relocateFolderSubtree(state.db, previousPath, dirPath, parentId)
  ) {
    const pendingUnlink = pendingDirectoryUnlinks.get(previousPath);
    if (pendingUnlink) {
      clearTimeout(pendingUnlink);
      pendingDirectoryUnlinks.delete(previousPath);
    }
    directoryIdentityByPath.delete(previousPath);
  } else {
    getOrCreateFolder(state.db, dirPath, indexPaths);
  }

  rememberDirectory(dirPath, stats);
  recordLibrarySyncChange(getWindow(), "updated");
}

function forgetRemovedDirectory(dirPath: string, onSettled?: () => void): void {
  const existingTimer = pendingDirectoryUnlinks.get(dirPath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    pendingDirectoryUnlinks.delete(dirPath);
    const identity = directoryIdentityByPath.get(dirPath);
    directoryIdentityByPath.delete(dirPath);
    if (identity && directoryPathByIdentity.get(identity) === dirPath) {
      directoryPathByIdentity.delete(identity);
    }
    onSettled?.();
  }, 3000);
  pendingDirectoryUnlinks.set(dirPath, timer);
}

async function waitForStableFile(filePath: string): Promise<boolean> {
  let previousSize = -1;
  let previousMtimeMs = -1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size <= 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      if (stats.size === previousSize && stats.mtimeMs === previousMtimeMs) {
        return true;
      }
      previousSize = stats.size;
      previousMtimeMs = stats.mtimeMs;
    } catch {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function syncExistingPath(
  state: AppState,
  filePath: string,
  window: BrowserWindow | null,
  knownExt?: string,
): Promise<LibrarySyncChangeKind> {
  let stats: fssync.Stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    return "skipped";
  }
  if (!stats.isFile() || stats.size <= 0 || isHiddenName(path.basename(filePath))) {
    return "skipped";
  }

  const pathExt = normalizeImportExtension(path.extname(filePath));
  if (isBlockedUnsupportedExtension(pathExt)) {
    return "skipped";
  }

  const detectedExt = normalizeImportExtension(
    knownExt ?? (await detectExtensionFromPath(filePath)) ?? pathExt,
  );
  if (!isScanSupportedExtension(detectedExt)) {
    return "skipped";
  }

  const existing = getFileByPath(state.db, filePath);
  if (existing) {
    if (existing.deletedAt) {
      return "skipped";
    }
    const fsModifiedAt = timestampFromStats(stats, "mtime");
    if (
      !existing.missingAt &&
      isFileUnchanged(state.db, filePath, detectedExt, stats.size, fsModifiedAt)
    ) {
      return "skipped";
    }
  }

  const indexPaths = getIndexPaths(state.db);
  const folderId = getOrCreateFolder(state.db, path.dirname(filePath), indexPaths);
  const input = await buildFileInputFromPath(filePath, folderId);

  if (existing) {
    const kind = classifyExistingPathSync(existing, false);
    if (kind === "skipped") {
      return "skipped";
    }
    await removeThumbnailForFile(indexPaths, filePath, {
      size: existing.size,
      modifiedAt: existing.modifiedAt,
    });
    updateFileBasicInfo(state.db, input);
    const updatedFile = getFileByPath(state.db, filePath);
    if (updatedFile) {
      updateFileColorData(
        state.db,
        updatedFile.id,
        input.dominantColor ?? "",
        input.colorDistribution ?? "[]",
      );
      runPostImportPipeline(state, window, updatedFile, {
        source: "library_sync",
        notify: false,
        autoAnalyzeMetadata: false,
      });
    }
    return kind;
  }

  const moveCandidate = input.contentHash
    ? findMoveCandidateByContentHash(state.db, input.contentHash)
    : null;
  if (
    moveCandidate &&
    shouldUseMoveCandidate(moveCandidate, filePath, fssync.existsSync(moveCandidate.path))
  ) {
    updateFilePathAndFolder(state.db, moveCandidate.id, filePath, folderId);
    updateFileBasicInfo(state.db, input);
    const movedFile = getFileById(state.db, moveCandidate.id);
    if (movedFile) {
      runPostImportPipeline(state, window, movedFile, {
        source: "library_sync",
        notify: false,
        autoAnalyzeMetadata: false,
      });
    }
    return "moved";
  }

  const fileId = upsertFile(state.db, input);
  const file = getFileById(state.db, fileId);
  if (file) {
    runPostImportPipeline(state, window, file, {
      source: "library_sync",
      notify: false,
      autoAnalyzeMetadata: false,
    });
  }
  return "added";
}

export async function scanIndexPath(
  state: AppState,
  rootPath: string,
  window: BrowserWindow | null = null,
): Promise<number> {
  const existing = filePathsInDir(state.db, rootPath);
  const processed = new Set<string>();
  const summary = emptyLibrarySyncSummary();

  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (isHiddenName(entry.name)) continue;
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getOrCreateFolder(state.db, candidate, getIndexPaths(state.db));
        await visit(candidate);
        continue;
      }
      if (!entry.isFile()) continue;

      const pathExt = normalizeImportExtension(path.extname(candidate));
      if (isBlockedUnsupportedExtension(pathExt)) continue;

      const ext = normalizeImportExtension((await detectExtensionFromPath(candidate)) ?? pathExt);
      if (!isScanSupportedExtension(ext)) continue;
      processed.add(candidate);
      const kind = await syncExistingPath(state, candidate, window, ext);
      recordLibrarySyncChange(window, kind);
      if (kind === "added") summary.added += 1;
      if (kind === "updated") summary.updated += 1;
      if (kind === "moved") summary.moved += 1;
      if (kind === "skipped") summary.skipped += 1;
      summary.scanned += 1;
    }
  }

  await visit(rootPath);
  for (const stalePath of [...existing].filter((item) => !processed.has(item))) {
    if (markFileMissingByPath(state.db, stalePath)) {
      summary.removed += 1;
      recordLibrarySyncChange(window, "removed");
    }
  }
  pruneMissingEmptyFolders(state, rootPath);
  return summary.added;
}

function queueLibrarySyncTask(task: () => Promise<void>): void {
  librarySyncQueue = librarySyncQueue
    .then(task)
    .catch((error) => log.warn("[library-sync] task failed", error));
}

function queueLibraryPathSync(
  state: AppState,
  getWindow: GetWindow,
  filePath: string,
  delay = 700,
): void {
  const existingTimer = pendingLibraryChanges.get(filePath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    pendingLibraryChanges.delete(filePath);
    queueLibrarySyncTask(async () => {
      const stable = await waitForStableFile(filePath);
      if (!stable) {
        recordLibrarySyncChange(getWindow(), "skipped");
        return;
      }
      const kind = await syncExistingPath(state, filePath, getWindow());
      recordLibrarySyncChange(getWindow(), kind);
    });
  }, delay);
  pendingLibraryChanges.set(filePath, timer);
}

function queueLibraryPathMissing(state: AppState, getWindow: GetWindow, filePath: string): void {
  const existingTimer = pendingLibraryUnlinks.get(filePath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    pendingLibraryUnlinks.delete(filePath);
    queueLibrarySyncTask(async () => {
      if (fssync.existsSync(filePath)) {
        queueLibraryPathSync(state, getWindow, filePath, 0);
        return;
      }
      if (markFileMissingByPath(state.db, filePath)) {
        recordLibrarySyncChange(getWindow(), "removed");
      }
    });
  }, 3000);
  pendingLibraryUnlinks.set(filePath, timer);
}

function scheduleLibraryScan(
  state: AppState,
  getWindow: GetWindow,
  reason: "startup" | "focus" | "manual",
): void {
  if (librarySyncScanTimer) {
    clearTimeout(librarySyncScanTimer);
  }
  const now = Date.now();
  if (reason === "focus" && now - lastLibrarySyncScanAt < 60_000) {
    return;
  }
  librarySyncScanTimer = setTimeout(
    () => {
      librarySyncScanTimer = null;
      lastLibrarySyncScanAt = Date.now();
      queueLibrarySyncTask(async () => {
        emit(getWindow(), "library-sync-status", { status: "running", reason });
        try {
          let total = 0;
          for (const indexPath of getIndexPaths(state.db)) {
            total += await scanIndexPath(state, indexPath, getWindow());
          }
          emit(getWindow(), "library-sync-status", { status: "idle", reason, total });
        } catch (error) {
          recordLibrarySyncChange(getWindow(), "skipped");
          pendingLibrarySyncSummary.errorCount += 1;
          log.warn("[library-sync] scan failed", error);
          emit(getWindow(), "library-sync-status", {
            status: "error",
            reason,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
    reason === "startup" ? 1000 : 300,
  );
}

export function requestLibrarySyncScan(
  state: AppState,
  getWindow: GetWindow,
  reason: "startup" | "focus" | "manual" = "manual",
): void {
  scheduleLibraryScan(state, getWindow, reason);
}

export function startLibrarySyncService(state: AppState, getWindow: GetWindow): void {
  if (libraryWatcher) {
    return;
  }
  const indexPaths = getIndexPaths(state.db);
  if (!indexPaths.length) {
    return;
  }

  libraryWatcher = chokidar.watch(indexPaths, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 800,
      pollInterval: 150,
    },
    ignored: (candidate) => isHiddenName(path.basename(candidate)),
  });

  void seedDirectoryIdentities(indexPaths);

  libraryWatcher
    .on("add", (filePath) => queueLibraryPathSync(state, getWindow, filePath))
    .on("change", (filePath) => queueLibraryPathSync(state, getWindow, filePath))
    .on("unlink", (filePath) => queueLibraryPathMissing(state, getWindow, filePath))
    .on("addDir", (dirPath) => {
      void syncAddedDirectory(state, getWindow, dirPath).catch((error) => {
        pendingLibrarySyncSummary.errorCount += 1;
        recordLibrarySyncChange(getWindow(), "skipped");
        log.warn("[library-sync] directory sync failed", error);
      });
    })
    .on("unlinkDir", (dirPath) => {
      forgetRemovedDirectory(dirPath, () => {
        // 重命名检测窗口（3s）已关闭：补标记磁盘上已消失的文件，并清理
        // 不再存在于磁盘的文件夹记录，让文件夹树与实际存储保持一致。
        const indexPath = getIndexPaths(state.db).find((item) => pathHasPrefix(dirPath, item));
        if (!indexPath) {
          return;
        }
        queueLibrarySyncTask(async () => {
          let removedCount = 0;
          for (const file of filePathsInDir(state.db, dirPath)) {
            if (!fssync.existsSync(file) && markFileMissingByPath(state.db, file)) {
              removedCount += 1;
            }
          }
          pruneMissingEmptyFolders(state, indexPath);
          for (let i = 0; i < removedCount; i += 1) {
            recordLibrarySyncChange(getWindow(), "removed");
          }
        });
      });
      recordLibrarySyncChange(getWindow(), "updated");
    })
    .on("error", (error) => {
      pendingLibrarySyncSummary.errorCount += 1;
      recordLibrarySyncChange(getWindow(), "skipped");
      log.warn("[library-sync] watcher error", error);
    });

  scheduleLibraryScan(state, getWindow, "startup");
}
