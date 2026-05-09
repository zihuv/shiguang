import { app, nativeImage, shell } from "electron";
import fssync from "node:fs";
import path from "node:path";
import { writeFilesToClipboard } from "../clipboard-file-references";
import { getFileById, getFolderById, touchFileLastAccessed } from "../database";
import { checkForUpdates } from "../app/updater";
import { getLogDir } from "../logger";
import {
  createGenericFileDragIconPngBuffer,
  createImageDragPreviewPngBuffer,
  DRAG_ICON_MAX_EDGE,
} from "../drag-preview-icon";
import type { AppState, FileRecord } from "../types";
import { type CommandHandler, numberArg, numberArrayArg } from "./common";

const genericDragIconCache = new Map<string, Promise<Electron.NativeImage>>();

function resizeDragIconToFit(icon: Electron.NativeImage): Electron.NativeImage {
  const size = icon.getSize();
  const edge = Math.max(size.width, size.height);
  if (!edge || edge <= DRAG_ICON_MAX_EDGE) {
    return icon;
  }

  const scale = DRAG_ICON_MAX_EDGE / edge;
  return icon.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "best",
  });
}

async function createGenericFileDragIcon(ext: string): Promise<Electron.NativeImage> {
  const cacheKey = ext.trim().toLowerCase() || "file";
  const cachedIcon = genericDragIconCache.get(cacheKey);
  if (cachedIcon) {
    return cachedIcon;
  }

  const iconPromise = createGenericFileDragIconPngBuffer(ext).then((pngBuffer) => {
    const icon = nativeImage.createFromBuffer(pngBuffer);
    return icon.isEmpty() ? nativeImage.createEmpty() : icon;
  });
  genericDragIconCache.set(cacheKey, iconPromise);
  return iconPromise;
}

async function createHeifDragPreviewPngBuffer(
  filePath: string,
  maxEdge: number,
): Promise<Buffer | null> {
  const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
    width: maxEdge,
    height: maxEdge,
  });
  if (thumbnail.isEmpty()) {
    return null;
  }
  return resizeDragIconToFit(thumbnail).toPNG();
}

async function getFileDragIcon(file: FileRecord): Promise<Electron.NativeImage> {
  try {
    const previewBuffer = await createImageDragPreviewPngBuffer(file.path, file.ext, {
      heifThumbnailProvider: createHeifDragPreviewPngBuffer,
    });
    if (previewBuffer) {
      const previewIcon = nativeImage.createFromBuffer(previewBuffer);
      if (!previewIcon.isEmpty()) {
        return resizeDragIconToFit(previewIcon);
      }
    }
  } catch (error) {
    console.error("[drag-preview] build failed", {
      filePath: file.path,
      ext: file.ext,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return createGenericFileDragIcon(file.ext);
}

async function getFallbackDragIcon(filePath: string): Promise<Electron.NativeImage> {
  const ext = path.extname(filePath).slice(1);
  try {
    const previewBuffer = await createImageDragPreviewPngBuffer(filePath, ext, {
      heifThumbnailProvider: createHeifDragPreviewPngBuffer,
    });
    if (previewBuffer) {
      const previewIcon = nativeImage.createFromBuffer(previewBuffer);
      if (!previewIcon.isEmpty()) {
        return resizeDragIconToFit(previewIcon);
      }
    }
  } catch {
    // Keep external drags usable even when the source file cannot be decoded.
  }

  const img = await createGenericFileDragIcon(ext);
  if (!img.isEmpty()) {
    return resizeDragIconToFit(img);
  }
  return nativeImage.createEmpty();
}

export function createSystemCommands(state: AppState): Record<string, CommandHandler> {
  return {
    get_app_version: () => app.getVersion(),
    check_for_updates: () => checkForUpdates({ manual: true }),
    copy_files_to_clipboard: (args) => {
      const files = numberArrayArg(args, "fileIds", "file_ids")
        .map((fileId) => getFileById(state.db, fileId))
        .filter((item): item is FileRecord => Boolean(item));
      return writeFilesToClipboard(files);
    },
    start_drag_files: async (args, window) => {
      const files = numberArrayArg(args, "fileIds", "file_ids")
        .map((fileId) => getFileById(state.db, fileId))
        .filter((item): item is FileRecord => Boolean(item));
      const paths = files.map((file) => file.path);
      if (!paths.length || !window) throw new Error("No files selected");
      const firstFile = files[0];
      window.webContents.startDrag({
        file: paths[0],
        files: paths,
        icon: firstFile ? await getFileDragIcon(firstFile) : await getFallbackDragIcon(paths[0]),
      });
    },
    open_file: async (args) => {
      const fileId = numberArg(args, "fileId", "file_id");
      const file = getFileById(state.db, fileId);
      if (!file) throw new Error("File not found");
      touchFileLastAccessed(state.db, fileId);
      const result = await shell.openPath(file.path);
      if (result) throw new Error(result);
    },
    show_in_explorer: (args) => {
      const file = getFileById(state.db, numberArg(args, "fileId", "file_id"));
      if (!file) throw new Error("File not found");
      shell.showItemInFolder(file.path);
    },
    show_folder_in_explorer: async (args) => {
      const folder = getFolderById(state.db, numberArg(args, "folderId", "folder_id"));
      if (!folder) throw new Error("Folder not found");
      const result = await shell.openPath(folder.path);
      if (result) throw new Error(result);
    },
    show_current_library_in_explorer: async () => {
      const result = await shell.openPath(state.indexPath);
      if (result) throw new Error(result);
    },
    open_log_directory: async () => {
      const logDir = getLogDir();
      if (!fssync.existsSync(logDir)) {
        fssync.mkdirSync(logDir, { recursive: true });
      }
      const result = await shell.openPath(logDir);
      if (result) throw new Error(result);
    },
  };
}
