// 拾光采集器 - Background Runtime

import type { CollectionMetadata, ToastType } from "../types";

interface NormalizedPreferences {
  dragDockEnabled?: boolean;
  importConcurrency: string;
  targetFolderEnabled: boolean;
}

type PreferencePatch = Partial<NormalizedPreferences>;

interface FetchImageResult {
  bytes: ArrayBuffer;
  contentType: string;
  finalUrl: string;
}

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
}

interface RuntimeMessage {
  action?: string;
  payload?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function initBackground(): void {
  const SHIGUANG_SERVER_URL = "http://127.0.0.1:7845";
  const PREFERENCES_KEY = "shiguangCollectorPreferences";
  const DEFAULT_IMPORT_CONCURRENCY = 10;
  const DEDUPE_WINDOW_MS = 1000;
  const IMPORT_QUEUE_LIMIT = 500;

  const importQueue: QueuedImportTask[] = [];
  const recentImportTimes = new Map<string, number>();
  let activeImportCount = 0;
  let cachedPreferences: NormalizedPreferences = normalizePreferences({});

  function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function readStoredPreferences(): Promise<NormalizedPreferences> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(PREFERENCES_KEY, (result) => {
        cachedPreferences = normalizePreferences(result?.[PREFERENCES_KEY]);
        resolve(cachedPreferences);
      });
    });
  }

  void readStoredPreferences();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[PREFERENCES_KEY]) {
      return;
    }

    cachedPreferences = normalizePreferences(changes[PREFERENCES_KEY].newValue);
    drainImportQueue();
  });

  function normalizePreferences(value: unknown): NormalizedPreferences {
    const record = asRecord(value);
    if (!Object.keys(record).length) {
      return {
        importConcurrency: "",
        targetFolderEnabled: false,
      };
    }

    const preferences: NormalizedPreferences = {
      importConcurrency: normalizeOptionalNumberText(record.importConcurrency),
      targetFolderEnabled: record.targetFolderEnabled === true,
    };

    if (record.dragDockEnabled === false || record.dragDockEnabled === true) {
      preferences.dragDockEnabled = record.dragDockEnabled;
    }

    return preferences;
  }

  function normalizePreferencePatch(value: unknown): PreferencePatch {
    const record = asRecord(value);
    if (!Object.keys(record).length) {
      return {};
    }

    const patch: PreferencePatch = {};
    for (const key of ["importConcurrency"]) {
      if (hasOwn(record, key)) {
        patch.importConcurrency = normalizeOptionalNumberText(record[key]);
      }
    }

    if (hasOwn(record, "targetFolderEnabled")) {
      patch.targetFolderEnabled = record.targetFolderEnabled === true;
    }

    if (hasOwn(record, "dragDockEnabled")) {
      if (record.dragDockEnabled === false || record.dragDockEnabled === true) {
        patch.dragDockEnabled = record.dragDockEnabled;
      }
    }

    return patch;
  }

  function normalizeOptionalNumberText(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    const text = String(value).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  function normalizeOptionalFolderId(value: unknown): string {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      return "";
    }

    return Number.parseInt(text, 10) > 0 ? text : "";
  }

  function parseFolderId(folderId: unknown): number | null {
    const normalized = normalizeOptionalFolderId(folderId);
    return normalized ? Number.parseInt(normalized, 10) : null;
  }

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
      const preferences = await readStoredPreferences();
      if (preferences.targetFolderEnabled !== true) {
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
    const configured = Number.parseInt(cachedPreferences.importConcurrency || "", 10);
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_IMPORT_CONCURRENCY;
    }

    return Math.min(configured, 20);
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

  function getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || "未知错误");
    if (message === "Failed to fetch") {
      return "无法连接到拾光本地服务（127.0.0.1:7845），请确保拾光应用正在运行";
    }
    return message;
  }

  async function isShiguangServerReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${SHIGUANG_SERVER_URL}/api/health`, {
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function fetchShiguang(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${SHIGUANG_SERVER_URL}${endpoint}`;
    try {
      return await fetch(url, options);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error || "网络错误");
      const reachable = await isShiguangServerReachable();
      if (!reachable) {
        throw new Error(
          `无法连接到拾光本地服务（${SHIGUANG_SERVER_URL}）。请确认拾光应用正在运行，且浏览器扩展允许访问 127.0.0.1。原始错误：${rawMessage}`,
        );
      }

      throw new Error(
        `拾光本地服务可连接，但请求 ${endpoint} 失败。可能被浏览器、代理或安全软件拦截。原始错误：${rawMessage}`,
      );
    }
  }

  function parseServerErrorText(errorText: string): string {
    if (!errorText) {
      return "";
    }

    try {
      const payload = JSON.parse(errorText);
      const payloadRecord = asRecord(payload);
      if (typeof payloadRecord.message === "string" && payloadRecord.message) {
        return payloadRecord.message;
      }
      if (typeof payloadRecord.error === "string" && payloadRecord.error) {
        return payloadRecord.error;
      }
    } catch {
      // Keep plain text errors as-is.
    }

    return errorText;
  }

  async function readShiguangJson(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) {
      const errorText = await response.text();
      const message =
        parseServerErrorText(errorText) ||
        `拾光本地服务返回 HTTP ${response.status} ${response.statusText || ""}`.trim();
      throw new Error(message);
    }

    const result = asRecord(await response.json());
    if (!result.success) {
      throw new Error(typeof result.error === "string" ? result.error : "Unknown error");
    }

    return result;
  }

  function extensionFromContentType(contentType: unknown): string {
    const mime = String(contentType || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extensions: Record<string, string> = {
      "image/apng": "png",
      "image/avif": "avif",
      "image/bmp": "bmp",
      "image/gif": "gif",
      "image/heic": "heic",
      "image/heif": "heif",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/tiff": "tiff",
      "image/webp": "webp",
    };
    return extensions[mime] || "";
  }

  function filenameFromImageUrl(imageUrl: string, contentType: string): string {
    let filename = "browser-image";
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== "data:") {
        const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
        if (name) {
          filename = name;
        }
      }
    } catch {
      // Keep fallback filename.
    }

    filename = filename.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160) || "browser-image";
    if (/\.[a-z0-9]{1,8}$/i.test(filename)) {
      return filename;
    }

    const ext = extensionFromContentType(contentType);
    return ext ? `${filename}.${ext}` : filename;
  }

  function splitDataUrl(dataUrl: string): { bytes: ArrayBuffer; contentType: string } {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?((?:;[^,]+)*),(.*)$/s);
    if (!match) {
      throw new Error("图片数据格式无效");
    }

    const contentType = match[1] || "application/octet-stream";
    const flags = match[2] || "";
    const data = match[3] || "";
    if (flags.includes(";base64")) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { bytes: bytes.buffer, contentType };
    }

    return {
      bytes: new TextEncoder().encode(decodeURIComponent(data)).buffer,
      contentType,
    };
  }

  function isDataUrl(value: unknown): value is string {
    return typeof value === "string" && value.startsWith("data:");
  }

  function isHttpUrl(value: unknown): value is string {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  function dataUrlToFetchResult(dataUrl: string): FetchImageResult {
    const { bytes, contentType } = splitDataUrl(dataUrl);
    return {
      bytes,
      contentType,
      finalUrl: dataUrl,
    };
  }

  async function fetchImageBytesFromBrowser(imageUrl: string): Promise<FetchImageResult> {
    const response = await fetch(imageUrl, {
      cache: "force-cache",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(
        `浏览器侧取图失败：HTTP ${response.status} ${response.statusText || ""}`.trim(),
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
      throw new Error("浏览器侧取图失败：图片数据为空");
    }

    return {
      bytes,
      contentType,
      finalUrl: response.url || imageUrl,
    };
  }

  async function fetchImageBytesFromPage(
    tabId: number | undefined,
    imageUrl: string,
  ): Promise<FetchImageResult> {
    if (!tabId) {
      throw new Error("当前标签页不可用，无法使用页面上下文取图");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async (url: string) => {
        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("读取图片数据失败"));
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(blob);
        });

        return {
          dataUrl,
          contentType,
          finalUrl: response.url || url,
        };
      },
      args: [imageUrl],
    });

    const result = results?.[0]?.result;
    if (!result?.dataUrl) {
      throw new Error("页面上下文未返回图片数据");
    }

    const parsed = dataUrlToFetchResult(result.dataUrl);
    return {
      ...parsed,
      contentType: result.contentType || parsed.contentType,
      finalUrl: result.finalUrl || imageUrl,
    };
  }

  function uniqueImportUrls(urls: Iterable<unknown>): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const url of urls) {
      if (typeof url !== "string" || !url.trim() || seen.has(url)) {
        continue;
      }
      seen.add(url);
      unique.push(url);
    }
    return unique;
  }

  async function resolveImageBytesFromUrl(
    imageUrl: string,
    tabId: number | undefined,
  ): Promise<FetchImageResult> {
    if (isDataUrl(imageUrl)) {
      return dataUrlToFetchResult(imageUrl);
    }

    if (!isHttpUrl(imageUrl)) {
      throw new Error("仅支持采集浏览器可读取的图片数据");
    }

    try {
      return await fetchImageBytesFromBrowser(imageUrl);
    } catch (browserFetchError) {
      try {
        return await fetchImageBytesFromPage(tabId, imageUrl);
      } catch (pageFetchError) {
        throw new Error(
          `浏览器侧取图失败：${getErrorMessage(browserFetchError)}；页面上下文取图失败：${getErrorMessage(pageFetchError)}`,
        );
      }
    }
  }

  async function resolveImageBytes(task: ImportTask): Promise<FetchImageResult> {
    const candidateUrls = uniqueImportUrls([
      ...(Array.isArray(task.candidateUrls) ? task.candidateUrls : []),
      task.imageUrl,
    ]);
    const errors: string[] = [];

    for (const candidateUrl of candidateUrls) {
      try {
        return await resolveImageBytesFromUrl(candidateUrl, task.tabId);
      } catch (error) {
        errors.push(`${candidateUrl}: ${getErrorMessage(error)}`);
      }
    }

    if (isDataUrl(task.renderedImageDataUrl)) {
      return {
        ...dataUrlToFetchResult(task.renderedImageDataUrl),
        finalUrl: task.imageUrl,
      };
    }

    throw new Error(errors.length ? errors.join("；") : "未找到可采集的图片数据");
  }

  async function importImageBytesToShiguang(task: ImportTask): Promise<Record<string, unknown>> {
    const { bytes, contentType, finalUrl } = await resolveImageBytes(task);
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
    });
  }

  function enqueueImportTask(task: ImportTask): Promise<unknown> {
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

    return enqueueImportTask({
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
    });
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
      await chrome.tabs.sendMessage(tabId, message);
      return true;
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

  async function fetchFoldersFromShiguang(): Promise<Record<string, unknown>> {
    const response = await fetchShiguang("/api/folders");
    return readShiguangJson(response);
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
        notifyOnError: false,
        notifyOnSuccess: payload.notifyOnSuccess === true,
        successMessage:
          (typeof payload.successMessage === "string" && payload.successMessage) || "已发送到拾光",
        folderId: normalizeOptionalFolderId(payload.folderId ?? payload.folder_id),
        targetFolderResolved: payload.targetFolderResolved === true,
        forceTargetFolder: payload.forceTargetFolder === true,
        renderedImageDataUrl:
          typeof payload.renderedImageDataUrl === "string" ? payload.renderedImageDataUrl : null,
      })
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }

    if (message.action === "getPreferences") {
      readStoredPreferences().then((preferences) => {
        sendResponse({
          preferences,
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
      chrome.storage.sync.get(PREFERENCES_KEY, (result) => {
        const current = normalizePreferences(result?.[PREFERENCES_KEY]);
        const patch = normalizePreferencePatch(message.payload || {});
        const next = normalizePreferences({ ...current, ...patch });
        chrome.storage.sync.set({ [PREFERENCES_KEY]: next }, () => {
          cachedPreferences = next;
          drainImportQueue();
          sendResponse({ success: true, preferences: next });
        });
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
      })
        .then((result) => sendImportResponse(sendResponse, result))
        .catch((error) => sendResponse({ success: false, error: getErrorMessage(error) }));
      return true;
    }
  });
}
