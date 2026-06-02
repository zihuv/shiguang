// 拾光采集器 - Background Runtime

import type { CollectionMetadata, ToastType } from "../types";
import { normalizeOptionalFolderId, parseFolderId } from "../folders";
import { filenameFromImageUrl, resolveImageBytes } from "./image-bytes";
export { buildImageFetchInit, isImageNotFoundError, shouldUseFrameImageFetch } from "./image-bytes";
import { BackgroundPreferences, DEFAULT_IMPORT_CONCURRENCY } from "./preferences";
import {
  asRecord,
  fetchFoldersFromShiguang,
  fetchShiguang,
  getErrorMessage,
  isShiguangServerReachable,
  readShiguangJson,
} from "./shiguang-api";

interface ImportTask {
  tabId?: number;
  imageUrl: string;
  candidateUrls?: string[];
  referer?: string;
  sourceUrl?: string;
  metadata?: CollectionMetadata | null;
  folderId?: number | null;
  renderedImageDataUrl?: string | null;
  notifyOnError?: boolean;
  notifyOnSuccess?: boolean;
  successMessage?: string;
}

interface QueuedImportTask extends ImportTask {
  resolve: (value: unknown) => void;
}

interface CollectImageOptions extends Omit<ImportTask, "imageUrl" | "folderId"> {
  imageUrl?: string | null;
  missingImageMessage?: string;
  folderId?: string | number | null;
  targetFolderResolved?: boolean;
  forceTargetFolder?: boolean;
  waitForCompletion?: boolean;
}

interface ImportBytesOptions {
  filename?: string;
  contentType?: string;
  folderId?: number | null;
  sourceUrl?: string;
  metadata?: CollectionMetadata | null;
}

interface ScreenshotImportOptions {
  filename?: string;
  folderId?: string | number | null;
  targetFolderResolved?: boolean;
  tabId?: number;
  sourceUrl?: string;
}

interface RuntimeMessage {
  action?: string;
  payload?: Record<string, unknown>;
}

export function resolveScreenshotSourceUrl(
  explicitSourceUrl: unknown,
  tabUrl: string | undefined,
): string {
  return (typeof explicitSourceUrl === "string" && explicitSourceUrl) || tabUrl || "";
}

export function initBackground(): void {
  const DEDUPE_WINDOW_MS = 1000;
  const IMPORT_QUEUE_LIMIT = 500;

  const importQueue: QueuedImportTask[] = [];
  const recentImportTimes = new Map<string, number>();
  const preferences = new BackgroundPreferences();
  let activeImportCount = 0;

  void preferences.read();
  preferences.watch(drainImportQueue);

  async function resolveTargetFolderForSend(
    tabId: number | undefined,
    folderId: unknown,
    targetFolderResolved = false,
    forcePrompt = false,
  ): Promise<{ cancelled: boolean; folderId: number | null; error?: string }> {
    const explicitFolderId = parseFolderId(folderId);
    if (explicitFolderId) {
      return { cancelled: false, folderId: explicitFolderId };
    }

    if (targetFolderResolved) {
      return { cancelled: false, folderId: null };
    }

    if (!forcePrompt) {
      const storedPreferences = await preferences.read();
      if (storedPreferences.targetFolderEnabled !== true) {
        return { cancelled: false, folderId: null };
      }
    }

    if (!tabId) {
      throw new Error("当前页面无法选择目标文件夹");
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { action: "selectTargetFolder" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "未知错误");
      throw new Error(`无法打开文件夹选择器：${message}`);
    }

    if (response?.cancelled || response?.success === false) {
      return {
        cancelled: true,
        folderId: null,
        error: response?.error || "已取消发送",
      };
    }

    return {
      cancelled: false,
      folderId: parseFolderId(response?.folderId),
    };
  }

  function getImportConcurrency(): number {
    return preferences.getImportConcurrency();
  }

  function cleanRecentImportTimes(now = Date.now()): void {
    for (const [imageUrl, timestamp] of recentImportTimes) {
      if (now - timestamp > DEDUPE_WINDOW_MS * 6) {
        recentImportTimes.delete(imageUrl);
      }
    }
  }

  async function showPageToast(
    tabId: number | undefined,
    message: string,
    type: ToastType = "info",
    duration = 3000,
  ): Promise<boolean> {
    if (!tabId) {
      return false;
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "showToast",
        payload: {
          message,
          type,
          duration,
        },
      });
      return true;
    } catch (error) {
      console.warn("Failed to show page toast:", error);
      return false;
    }
  }

  async function importImageBytesToShiguang(task: ImportTask): Promise<Record<string, unknown>> {
    const { bytes, contentType, finalUrl } = await resolveImageBytes(task, { sendMessageToTab });
    return importBytesToShiguang(bytes, {
      filename: filenameFromImageUrl(finalUrl || task.imageUrl, contentType),
      contentType,
      folderId: task.folderId,
      sourceUrl: task.sourceUrl || task.referer || finalUrl || task.imageUrl,
      metadata: task.metadata,
    });
  }

  async function importBytesToShiguang(
    bytes: ArrayBuffer,
    {
      filename = "screenshot.png",
      contentType = "application/octet-stream",
      folderId,
      sourceUrl = "",
      metadata = null,
    }: ImportBytesOptions = {},
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      filename,
    });
    if (folderId) {
      params.set("folder_id", String(folderId));
    }
    if (sourceUrl) {
      params.set("source_url", sourceUrl);
    }

    const response = await fetchShiguang(`/api/import?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        ...(metadata
          ? {
              "X-Shiguang-Collector-Metadata": encodeURIComponent(JSON.stringify(metadata)),
            }
          : {}),
      },
      body: bytes,
    });

    return readShiguangJson(response);
  }

  async function importDataUrlToShiguang(
    dataUrl: string,
    options: ScreenshotImportOptions = {},
  ): Promise<Record<string, unknown> | { success: false; cancelled: true; error: string }> {
    const target = await resolveTargetFolderForSend(
      options.tabId,
      options.folderId,
      options.targetFolderResolved === true,
    );
    if (target.cancelled) {
      return { success: false, cancelled: true, error: target.error || "已取消发送" };
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bytes = await blob.arrayBuffer();
    return importBytesToShiguang(bytes, {
      filename: options.filename || "screenshot.png",
      contentType: blob.type || "image/png",
      folderId: target.folderId,
      sourceUrl: options.sourceUrl,
    });
  }

  function enqueueImportTask(task: ImportTask, waitForCompletion = true): Promise<unknown> {
    const now = Date.now();
    cleanRecentImportTimes(now);

    const dedupeKey = `${task.folderId || "default"}\n${task.imageUrl}`;
    const recent = recentImportTimes.get(dedupeKey);
    if (recent && now - recent < DEDUPE_WINDOW_MS) {
      return Promise.resolve({
        success: true,
        deduped: true,
        result: null,
      });
    }

    if (importQueue.length >= IMPORT_QUEUE_LIMIT) {
      return Promise.resolve({
        success: false,
        error: "收藏队列已满，请稍后再试",
      });
    }

    recentImportTimes.set(dedupeKey, now);

    if (!waitForCompletion) {
      importQueue.push({ ...task, resolve: () => {} });
      drainImportQueue();
      return Promise.resolve({
        success: true,
        queued: true,
      });
    }

    return new Promise((resolve) => {
      importQueue.push({ ...task, resolve });
      drainImportQueue();
    });
  }

  function drainImportQueue(): void {
    const maxConcurrency = getImportConcurrency();

    while (activeImportCount < maxConcurrency && importQueue.length > 0) {
      const task = importQueue.shift();
      if (!task) {
        break;
      }
      activeImportCount += 1;

      runImportTask(task)
        .then(task.resolve)
        .catch((error) => {
          task.resolve({
            success: false,
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          activeImportCount -= 1;
          drainImportQueue();
        });
    }
  }

  async function runImportTask(task: ImportTask): Promise<Record<string, unknown>> {
    try {
      const result = await importImageBytesToShiguang(task);
      if (task.notifyOnSuccess) {
        await notifyResult(task.tabId, task.successMessage || "已发送到拾光", "success", 2200);
      }
      return {
        success: true,
        result,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error("发送到拾光失败:", errorMessage);

      if (task.notifyOnError) {
        await notifyResult(task.tabId, `发送失败: ${errorMessage}`, "error", 3600);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async function collectImage({
    tabId,
    imageUrl,
    candidateUrls = [],
    referer,
    sourceUrl,
    metadata = null,
    missingImageMessage = "未找到图片，请右键点击图片后重试",
    notifyOnError = true,
    notifyOnSuccess = false,
    successMessage = "已发送到拾光",
    folderId,
    targetFolderResolved = false,
    forceTargetFolder = false,
    renderedImageDataUrl = null,
    waitForCompletion = true,
  }: CollectImageOptions): Promise<unknown> {
    if (!imageUrl) {
      if (notifyOnError) {
        await notifyResult(tabId, missingImageMessage, "error");
      }

      return {
        success: false,
        error: missingImageMessage,
      };
    }

    const target = await resolveTargetFolderForSend(
      tabId,
      folderId,
      targetFolderResolved,
      forceTargetFolder,
    );
    if (target.cancelled) {
      return { success: false, cancelled: true, error: target.error || "已取消发送" };
    }

    return enqueueImportTask(
      {
        tabId,
        imageUrl,
        candidateUrls,
        referer,
        sourceUrl: sourceUrl || referer || imageUrl,
        metadata,
        folderId: target.folderId,
        renderedImageDataUrl,
        notifyOnError,
        notifyOnSuccess,
        successMessage,
      },
      waitForCompletion,
    );
  }

  async function notifyResult(
    tabId: number | undefined,
    message: string,
    type: ToastType = "info",
    duration = 3000,
  ): Promise<void> {
    const shownInPage = await showPageToast(tabId, message, type, duration);
    if (shownInPage) {
      return;
    }

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "拾光采集器",
      message,
    });
  }

  // Create context menu when extension is installed
  chrome.runtime.onInstalled.addListener(() => {
    // 链接遮罩里的图片（如小红书封面）会被 Chrome 归类为 link context。
    // 取图仍交给 content script，保证 SPA、懒加载和遮罩结构都走同一套逻辑。
    chrome.contextMenus.create({
      id: "sendToShiguang",
      title: "发送给拾光",
      contexts: ["page", "image", "link"],
    });
  });

  // Listen for context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const tabId = tab?.id;
    const referer = tab?.url || info.pageUrl;
    let sourceUrl = referer;
    let imageUrl = null;
    let metadata = null;
    let renderedImageDataUrl = null;
    let candidateUrls = [];

    // 优先复用 content script 的取图结果，和 Alt+左键保持一致
    if (tabId) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          action: "getLastImageUrl",
        });
        if (response && response.imageUrl) {
          imageUrl = response.imageUrl;
          sourceUrl = response.sourceUrl || sourceUrl;
          metadata = response.collectionPayload?.metadata || null;
          candidateUrls = response.candidateUrls || response.collectionPayload?.candidateUrls || [];
          renderedImageDataUrl = response.renderedImageDataUrl || null;
        }
      } catch (error) {
        console.error("Failed to get image from content script:", error);
      }
    }

    // content script 未取到时，再回退到浏览器提供的 srcUrl
    if (!imageUrl) {
      imageUrl = info.srcUrl || null;
    }

    try {
      await collectImage({
        tabId,
        imageUrl,
        candidateUrls,
        referer,
        sourceUrl,
        metadata,
        renderedImageDataUrl,
        forceTargetFolder: true,
        missingImageMessage: "未找到图片，请右键点击图片后重试",
        notifyOnSuccess: true,
      });
    } catch (error) {
      await notifyResult(tabId, `发送失败: ${getErrorMessage(error)}`, "error", 3600);
    }
  });

  async function sendMessageToTab(tabId: number | undefined, message: RuntimeMessage) {
    if (!tabId) {
      return false;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response?.success !== false;
    } catch (error) {
      console.warn("Failed to send message to tab:", error);
      return false;
    }
  }

  async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function captureVisibleDataUrl(tab: chrome.tabs.Tab): Promise<string> {
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  }

  async function captureVisibleAndImport(
    tab: chrome.tabs.Tab,
    options: ScreenshotImportOptions = {},
  ) {
    const dataUrl = await captureVisibleDataUrl(tab);
    return importDataUrlToShiguang(dataUrl, {
      filename: "visible-screenshot.png",
      folderId: options.folderId,
      targetFolderResolved: options.targetFolderResolved === true,
      tabId: tab?.id,
      sourceUrl: resolveScreenshotSourceUrl(options.sourceUrl, tab?.url),
    });
  }

  function sendImportResponse(sendResponse: (response?: unknown) => void, result: unknown): void {
    const resultRecord = asRecord(result);
    if (resultRecord.cancelled) {
      sendResponse(result);
      return;
    }

    sendResponse({ success: true, result });
  }

  chrome.action.onClicked.addListener(async (tab) => {
    const opened = await sendMessageToTab(tab?.id, { action: "togglePanel" });
    if (!opened) {
      await notifyResult(tab?.id, "当前页面无法打开采集面板", "error", 3200);
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return;
    }

    if (command === "open-panel") {
      await sendMessageToTab(tab.id, { action: "togglePanel" });
      return;
    }

    if (command === "capture-area") {
      await sendMessageToTab(tab.id, { action: "startAreaCapture" });
      return;
    }

    if (command === "capture-element") {
      await sendMessageToTab(tab.id, { action: "startElementCapture" });
      return;
    }

    if (command === "capture-visible") {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "captureVisibleFromPage",
        });
        if (response?.success) {
          return;
        }
      } catch {
        // Fall back to a background-only capture on pages where content scripts are unavailable.
      }

      try {
        const result = await captureVisibleAndImport(tab);
        if (result?.cancelled) {
          return;
        }
        await notifyResult(tab.id, "已收藏可视范围截图", "success", 2200);
      } catch (error) {
        await notifyResult(tab.id, `截图失败: ${getErrorMessage(error)}`, "error", 3600);
      }
    }
  });

  // Check server connection
  async function checkServerConnection(): Promise<boolean> {
    return isShiguangServerReachable();
  }

  // Messages from content scripts and the collector panel.
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.action === "checkConnection") {
      checkServerConnection()
        .then((connected) => sendResponse({ connected }))
        .catch(() => sendResponse({ connected: false }));
      return true;
    }

    if (message.action === "collectImage") {
      const payload = message.payload || {};
      collectImage({
        tabId: _sender.tab?.id,
        imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl : "",
        candidateUrls: Array.isArray(payload.candidateUrls)
          ? payload.candidateUrls.filter((url): url is string => typeof url === "string")
          : [],
        referer: typeof payload.referer === "string" ? payload.referer : _sender.tab?.url,
        sourceUrl:
          (typeof payload.sourceUrl === "string" && payload.sourceUrl) ||
          (typeof payload.source_url === "string" && payload.source_url) ||
          (typeof payload.referer === "string" && payload.referer) ||
          _sender.tab?.url,
        metadata: (payload.metadata as CollectionMetadata | null) || null,
        missingImageMessage:
          (typeof payload.missingImageMessage === "string" && payload.missingImageMessage) ||
          "未找到可采集的图片",
        notifyOnError: payload.notifyOnError === true,
        notifyOnSuccess: payload.notifyOnSuccess === true,
        successMessage:
          (typeof payload.successMessage === "string" && payload.successMessage) || "已发送到拾光",
        folderId: normalizeOptionalFolderId(payload.folderId ?? payload.folder_id),
        targetFolderResolved: payload.targetFolderResolved === true,
        forceTargetFolder: payload.forceTargetFolder === true,
        waitForCompletion: payload.waitForCompletion !== false,
        renderedImageDataUrl:
          typeof payload.renderedImageDataUrl === "string" ? payload.renderedImageDataUrl : null,
      })
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }

    if (message.action === "getPreferences") {
      preferences.read().then((storedPreferences) => {
        sendResponse({
          preferences: storedPreferences,
          defaults: {
            importConcurrency: DEFAULT_IMPORT_CONCURRENCY,
          },
        });
      });
      return true;
    }

    if (message.action === "getFolders") {
      fetchFoldersFromShiguang()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }

    if (message.action === "updatePreferences") {
      preferences.update(message.payload || {}).then((next) => {
        drainImportQueue();
        sendResponse({ success: true, preferences: next });
      });
      return true;
    }

    if (message.action === "captureVisibleScreenshot") {
      const payload = message.payload || {};
      const tab = _sender.tab;
      if (!tab) {
        sendResponse({ success: false, error: "未找到当前标签页" });
        return true;
      }

      captureVisibleAndImport(tab, {
        folderId: normalizeOptionalFolderId(payload.folderId ?? payload.folder_id),
        targetFolderResolved: payload.targetFolderResolved === true,
        sourceUrl: resolveScreenshotSourceUrl(payload.sourceUrl ?? payload.source_url, tab.url),
      })
        .then((result) => sendImportResponse(sendResponse, result))
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }

    if (message.action === "captureVisibleDataUrl") {
      const tab = _sender.tab;
      if (!tab) {
        sendResponse({ success: false, error: "未找到当前标签页" });
        return true;
      }

      captureVisibleDataUrl(tab)
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }

    if (message.action === "importScreenshotDataUrl") {
      const payload = message.payload || {};
      if (typeof payload.dataUrl !== "string" || !payload.dataUrl) {
        sendResponse({ success: false, error: "缺少截图数据" });
        return true;
      }

      importDataUrlToShiguang(payload.dataUrl, {
        filename: (typeof payload.filename === "string" && payload.filename) || "screenshot.png",
        folderId: normalizeOptionalFolderId(payload.folderId ?? payload.folder_id),
        targetFolderResolved: payload.targetFolderResolved === true,
        tabId: _sender.tab?.id,
        sourceUrl: resolveScreenshotSourceUrl(
          payload.sourceUrl ?? payload.source_url,
          _sender.tab?.url,
        ),
      })
        .then((result) => sendImportResponse(sendResponse, result))
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }
  });
}
