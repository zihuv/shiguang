import { BrowserWindow, dialog, ipcMain } from "electron";
import { log } from "./logger";
import fs from "node:fs/promises";
import fssync from "node:fs";
import { z } from "zod";
import { getIndexPaths } from "./database";
import { isPathAllowedForRead } from "./storage";
import { getDeletedFolderHoldingDir } from "./trash-paths";
import type { AppState } from "./types";
import { type GetWindow } from "./commands/common";
import { createCommandRegistry } from "./commands/registry";
import {
  WRITE_DESKTOP_COMMANDS,
  type DesktopCommandName,
} from "../src/shared/desktop-command-contracts";

const WRITE_COMMANDS = new Set<DesktopCommandName>(WRITE_DESKTOP_COMMANDS);

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  const summary: Record<string, unknown> = {};
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 80) {
      summary[key] = value.slice(0, 80) + "…";
    } else if (typeof value === "object" && value !== null) {
      summary[key] = Array.isArray(value) ? `[Array(${value.length})]` : "{…}";
    } else {
      summary[key] = value;
    }
  }
  return JSON.stringify(summary);
}

export { startCollectorServer } from "./commands/collector-server";
export { requestLibrarySyncScan, startLibrarySyncService } from "./commands/library-sync-service";
export { ensureDeletedFolderHoldingDir } from "./commands/trash-file-service";
export { wakeAutoVisualIndexing } from "./commands/visual-ai-service";

const rendererLogSchema = z.object({
  level: z.enum(["debug", "error", "info", "log", "trace", "warn"]).catch("info"),
  message: z.string().max(20_000),
});

export function registerIpcHandlers(
  state: AppState,
  getWindow: GetWindow,
  assetToUrl: (filePath: string) => string,
): void {
  const commands = createCommandRegistry(state, getWindow);

  ipcMain.handle(
    "shiguang:invoke",
    async (event, command: string, args: Record<string, unknown> = {}) => {
      const commandName = command as DesktopCommandName;
      const handler = commands[commandName];
      if (!handler) {
        throw new Error(`Unknown desktop command: ${command}`);
      }
      if (WRITE_COMMANDS.has(commandName)) {
        log.info(`[cmd] ${command}`, summarizeArgs(args));
      }
      return handler(args, BrowserWindow.fromWebContents(event.sender));
    },
  );

  ipcMain.on("shiguang:send", (event, command: string, args: Record<string, unknown> = {}) => {
    const commandName = command as DesktopCommandName;
    const handler = commands[commandName];
    if (!handler) {
      log.warn(`Unknown send command: ${command}`);
      return;
    }
    const result = handler(args, BrowserWindow.fromWebContents(event.sender));
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        log.error(`[send] ${command} failed:`, error);
      });
    }
  });

  ipcMain.handle("shiguang:dialog:open", async (_event, options: Electron.OpenDialogOptions) => {
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled
      ? null
      : options.properties?.includes("multiSelections")
        ? result.filePaths
        : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(
    "shiguang:fs:exists",
    (_event, filePath: string) =>
      fssync.existsSync(filePath) &&
      isPathAllowedForRead(filePath, getIndexPaths(state.db), [
        getDeletedFolderHoldingDir(state.appDataDir),
      ]),
  );
  ipcMain.handle("shiguang:fs:readFile", async (_event, filePath: string) => {
    if (
      !isPathAllowedForRead(filePath, getIndexPaths(state.db), [
        getDeletedFolderHoldingDir(state.appDataDir),
      ])
    )
      throw new Error("Path is not allowed");
    return new Uint8Array(await fs.readFile(filePath));
  });
  ipcMain.handle("shiguang:fs:readTextFile", async (_event, filePath: string) => {
    if (
      !isPathAllowedForRead(filePath, getIndexPaths(state.db), [
        getDeletedFolderHoldingDir(state.appDataDir),
      ])
    )
      throw new Error("Path is not allowed");
    return fs.readFile(filePath, "utf8");
  });
  ipcMain.handle("shiguang:asset:toUrl", (_event, filePath: string) => assetToUrl(filePath));
  ipcMain.handle("shiguang:window:set-fullscreen", (event, enabled: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.setFullScreen(Boolean(enabled));
    return window.isFullScreen();
  });
  ipcMain.handle("shiguang:window:is-fullscreen", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    return Boolean(window && !window.isDestroyed() && window.isFullScreen());
  });
  ipcMain.handle("shiguang:window:minimize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.minimize();
    return true;
  });
  ipcMain.handle("shiguang:window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return window.isMaximized();
  });
  ipcMain.handle("shiguang:window:is-maximized", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    return Boolean(window && !window.isDestroyed() && window.isMaximized());
  });
  ipcMain.handle("shiguang:window:close", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.close();
    return true;
  });
  ipcMain.handle("shiguang:log", (_event, level: string, message: string) => {
    const payload = rendererLogSchema.parse({ level, message });
    const writer =
      payload.level === "error"
        ? log.error
        : payload.level === "warn"
          ? log.warn
          : payload.level === "debug"
            ? log.debug
            : log.info;
    writer(payload.message);
  });
}
