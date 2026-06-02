// 拾光采集器 - 页面内面板

import { panelStyle } from "./panel-style";
import { cropDataUrl, escapeHtml, parseOptionalInt, scanPageImages } from "./panel-utils";
import { findDefaultFolderId, flattenFolderRows } from "../folders";
import type {
  CollectionMetadata,
  CollectionPayload,
  Collector,
  CollectorPanel,
  FolderRecord,
} from "../types";

interface Preferences {
  dragDockEnabled?: boolean;
  importConcurrency?: string;
  targetFolderEnabled?: boolean;
}

interface Defaults {
  importConcurrency: number;
}

interface RuntimeResponse {
  success?: boolean;
  error?: string;
  preferences?: Preferences;
  defaults?: Defaults;
  folders?: FolderRecord[];
  default_folder_id?: unknown;
  dataUrl?: string;
  result?: unknown;
}

interface ScannedImage {
  url: string;
  width: number;
  height: number;
  sourceUrl: string | null;
  metadata: CollectionMetadata | null;
}

interface FolderSelection {
  cancelled: boolean;
  folderId?: string | number;
  resolved: boolean;
}

type BatchStatus = "queued" | "running" | "success" | "failed";

export function createPanel(collector: Collector): CollectorPanel {
  const PANEL_ID = "shiguang-collector-panel-host";
  const OVERLAY_ID = "shiguang-area-capture-overlay";
  const ELEMENT_PICKER_OVERLAY_ID = "shiguang-element-picker-overlay";

  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let panelOpen = false;
  let currentView = "home";
  let preferences: Preferences = {};
  let defaults = { importConcurrency: 10 };
  let folderTree: FolderRecord[] = [];
  let defaultFolderId: string | number | null = null;
  let batchImages: ScannedImage[] = [];
  let selectedUrls = new Set<string>();
  let batchStatus = new Map<string, BatchStatus>();
  let activeBatchUrls = new Set<string>();
  let batchRunning = false;
  let folderPickerPromise: Promise<{
    success?: boolean;
    cancelled?: boolean;
    error?: string;
    folderId?: string;
  }> | null = null;

  function sendRuntimeMessage(message: Record<string, unknown>): Promise<RuntimeResponse> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve((response || {}) as RuntimeResponse);
      });
    });
  }

  async function loadPreferences() {
    try {
      const response = await sendRuntimeMessage({ action: "getPreferences" });
      preferences = response?.preferences || {};
      defaults = response?.defaults || defaults;
    } catch (error) {
      console.warn("Failed to load collector preferences:", error);
      preferences = {};
    }
  }

  async function loadFolders() {
    try {
      const response = await sendRuntimeMessage({ action: "getFolders" });
      folderTree = response?.success ? response.folders || [] : [];
      const responseDefaultFolderId = response?.success
        ? parseOptionalInt(response.default_folder_id)
        : null;
      defaultFolderId = responseDefaultFolderId || findDefaultFolderId(folderTree);
    } catch (error) {
      console.warn("Failed to load collector folders:", error);
      folderTree = [];
      defaultFolderId = null;
    }
  }

  async function savePreferences(nextPreferences: Preferences): Promise<Preferences> {
    const response = await sendRuntimeMessage({
      action: "updatePreferences",
      payload: nextPreferences,
    });

    if (response?.success) {
      preferences = response.preferences || nextPreferences;
      return preferences;
    }

    throw new Error(response?.error || "偏好保存失败");
  }

  function isTargetFolderEnabled(): boolean {
    return preferences.targetFolderEnabled === true;
  }

  function renderFolderField(id: string, selectedFolderId = ""): string {
    const options = flattenFolderRows(folderTree, defaultFolderId)
      .map((folder) => {
        const selected = String(folder.id) === selectedFolderId ? "selected" : "";
        return [
          `<option value="${folder.id}" title="${escapeHtml(folder.pathLabel)}" data-depth="${folder.depth}" data-name="${escapeHtml(folder.name)}" data-path-label="${escapeHtml(folder.pathLabel)}" ${selected}>`,
          escapeHtml(folder.pathLabel),
          "</option>",
        ].join("");
      })
      .join("");

    return `
      <div class="field folder-field">
        <label for="${id}">收藏到</label>
        <select id="${id}">
          <option value="" data-depth="0" data-name="浏览器采集" data-path-label="浏览器采集" ${selectedFolderId ? "" : "selected"}>浏览器采集</option>
          ${options}
        </select>
      </div>
    `;
  }

  function setFolderSelectDisplayMode(
    select: HTMLSelectElement | null,
    mode: "tree" | "path",
  ): void {
    for (const option of select?.options || []) {
      const pathLabel = option.dataset.pathLabel || option.textContent || "";
      const name = option.dataset.name || pathLabel;
      const depth = parseOptionalInt(option.dataset.depth) || 0;
      option.textContent = mode === "tree" ? `${"\u00a0".repeat(depth * 4)}${name}` : pathLabel;
    }
  }

  function bindFolderSelectDisplay(select: HTMLSelectElement | null): void {
    if (!select) {
      return;
    }

    const showTree = () => setFolderSelectDisplayMode(select, "tree");
    const showPath = () => setFolderSelectDisplayMode(select, "path");
    select.addEventListener("pointerdown", showTree);
    select.addEventListener("keydown", (event: KeyboardEvent) => {
      if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
        showTree();
      }
    });
    select.addEventListener("change", () => window.setTimeout(showPath, 0));
    select.addEventListener("blur", showPath);
    showPath();
  }

  async function selectTargetFolder(): ReturnType<CollectorPanel["selectTargetFolder"]> {
    await loadFolders();
    if (folderPickerPromise) {
      return folderPickerPromise;
    }

    folderPickerPromise = new Promise((resolve) => {
      const pickerHost = document.createElement("div");
      pickerHost.style.cssText = ["position: fixed", "inset: 0", "z-index: 2147483647"].join(";");

      const pickerShadow = pickerHost.attachShadow({ mode: "open" });
      pickerShadow.innerHTML = `
        <style>${panelStyle}</style>
        <div class="folder-picker-shell" id="folderPickerShell">
          <div class="folder-picker-card" role="dialog" aria-modal="true" aria-labelledby="folderPickerTitle">
            <div class="folder-picker-title" id="folderPickerTitle">发送到</div>
            ${renderFolderField("folderPickerSelect")}
            <div class="folder-picker-actions">
              <button class="button secondary" id="cancelFolderPicker" type="button">取消</button>
              <button class="button" id="confirmFolderPicker" type="button">发送</button>
            </div>
          </div>
        </div>
      `;

      function finish(result: {
        success?: boolean;
        cancelled?: boolean;
        error?: string;
        folderId?: string;
      }) {
        pickerHost.remove();
        folderPickerPromise = null;
        resolve(result);
      }

      const select = pickerShadow.getElementById("folderPickerSelect") as HTMLSelectElement | null;
      bindFolderSelectDisplay(select);
      pickerShadow.getElementById("cancelFolderPicker")?.addEventListener("click", () => {
        finish({ success: false, cancelled: true, error: "已取消发送" });
      });
      pickerShadow.getElementById("confirmFolderPicker")?.addEventListener("click", () => {
        finish({ success: true, folderId: select?.value || "" });
      });
      pickerShadow.getElementById("folderPickerShell")?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.id === "folderPickerShell") {
          finish({ success: false, cancelled: true, error: "已取消发送" });
        }
      });
      pickerShadow.addEventListener("keydown", (event) => {
        if (!(event instanceof KeyboardEvent)) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish({ success: false, cancelled: true, error: "已取消发送" });
        }
      });

      (document.body || document.documentElement).appendChild(pickerHost);
      select?.focus();
    });

    return folderPickerPromise;
  }

  async function resolveTargetFolderForSend(): Promise<FolderSelection> {
    await loadPreferences();
    if (!isTargetFolderEnabled()) {
      return { cancelled: false, folderId: undefined, resolved: false };
    }

    const result = await selectTargetFolder();
    if (!result?.success) {
      return { cancelled: true, folderId: undefined, resolved: false };
    }

    return { cancelled: false, folderId: result.folderId, resolved: true };
  }

  function ensurePanel(): { host: HTMLDivElement; shadow: ShadowRoot } {
    if (host?.isConnected && shadow) {
      return { host, shadow };
    }

    host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText = [
      "position: fixed",
      "top: 18px",
      "right: 18px",
      "z-index: 2147483646",
      "display: none",
    ].join(";");

    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${panelStyle}</style>
      <div class="panel" id="panelRoot" role="dialog" aria-label="拾光采集面板">
        <div class="top">
          <button class="icon-btn" id="backButton" type="button" title="返回">‹</button>
          <div class="brand" id="panelTitle">拾光</div>
          <button class="icon-btn" id="closeButton" type="button" title="关闭">×</button>
        </div>
        <div class="body" id="panelBody"></div>
      </div>
    `;

    shadow.getElementById("closeButton")?.addEventListener("click", closePanel);
    shadow.getElementById("backButton")?.addEventListener("click", () => {
      currentView = "home";
      renderPanel();
    });

    (document.body || document.documentElement).appendChild(host);
    return { host, shadow };
  }

  function openPanel(view = currentView || "home"): void {
    ensurePanel();
    panelOpen = true;
    currentView = view;
    if (host) {
      host.style.display = "block";
    }
    void Promise.all([loadPreferences(), loadFolders()]).then(renderPanel);
  }

  function closePanel(): void {
    if (!host) {
      return;
    }

    panelOpen = false;
    host.style.display = "none";
  }

  function togglePanel(): void {
    if (panelOpen) {
      closePanel();
    } else {
      openPanel("home");
    }
  }

  function setPanelVisible(visible: boolean): void {
    if (!host) {
      return;
    }
    host.style.display = visible && panelOpen ? "block" : "none";
  }

  function renderPanel(): void {
    const { shadow: root } = ensurePanel();
    const backButton = root.getElementById("backButton");
    const title = root.getElementById("panelTitle");
    const body = root.getElementById("panelBody");
    const panelRoot = root.getElementById("panelRoot");

    if (!backButton || !title || !body || !panelRoot) {
      return;
    }
    backButton.style.visibility = currentView === "home" ? "hidden" : "visible";
    panelRoot.classList.toggle("wide", currentView === "batch");

    if (currentView === "batch") {
      title.textContent = "批量收藏";
      renderBatch(body);
      return;
    }

    if (currentView === "preferences") {
      title.textContent = "偏好设置";
      renderPreferences(body);
      return;
    }

    title.textContent = "拾光";
    renderHome(body);
  }

  function renderHome(body: HTMLElement): void {
    const dragEnabled = preferences.dragDockEnabled !== false;
    body.innerHTML = `
      <div class="actions">
        <button class="action" id="areaCaptureButton" type="button">区域截图</button>
        <button class="action" id="elementCaptureButton" type="button">元素截图</button>
        <button class="action" id="visibleCaptureButton" type="button">可视截图</button>
        <button class="action" id="batchButton" type="button">批量收藏</button>
        <button class="action" id="preferencesButton" type="button">偏好设置</button>
      </div>
      <div class="plain-row" style="margin-top: 2px;">
        <span>拖拽收藏</span>
        <button class="switch ${dragEnabled ? "on" : ""}" id="dragToggleButton" type="button" aria-label="切换拖拽收藏">
          <span></span>
        </button>
      </div>
    `;

    body.querySelector("#areaCaptureButton")?.addEventListener("click", startAreaCapture);
    body.querySelector("#elementCaptureButton")?.addEventListener("click", startElementCapture);
    body
      .querySelector("#visibleCaptureButton")
      ?.addEventListener("click", captureVisibleScreenshot);
    body.querySelector("#batchButton")?.addEventListener("click", async () => {
      currentView = "batch";
      await scanImages();
      renderPanel();
    });
    body.querySelector("#preferencesButton")?.addEventListener("click", () => {
      currentView = "preferences";
      renderPanel();
    });
    body.querySelector("#dragToggleButton")?.addEventListener("click", async () => {
      const next = { ...preferences, dragDockEnabled: !dragEnabled };
      try {
        await savePreferences(next);
        renderPanel();
      } catch (error) {
        collector.showToast(collector.getErrorMessage(error), "error", 3000);
      }
    });
  }

  function renderBatch(body: HTMLElement): void {
    const previousScrollTop = body.scrollTop;
    const selectedCount = selectedUrls.size;
    const progressText = getBatchProgressText(selectedCount);

    body.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="button secondary" id="rescanButton" type="button">刷新</button>
          <button class="button secondary" id="selectAllButton" type="button">全选</button>
          <button class="button secondary" id="selectNoneButton" type="button">全不选</button>
        </div>
        <div class="toolbar-right">
          <span class="muted" id="batchProgressText">${escapeHtml(progressText)}</span>
          <button class="button" id="collectSelectedButton" type="button" ${selectedCount && !batchRunning ? "" : "disabled"}>收藏</button>
        </div>
      </div>
      ${
        batchImages.length
          ? `<div class="grid">${batchImages.map(renderImageItem).join("")}</div>`
          : '<div class="empty">当前页面没有找到可收藏图片</div>'
      }
    `;

    body.querySelector("#rescanButton")?.addEventListener("click", async () => {
      await scanImages();
      renderPanel();
    });
    body.querySelector("#selectAllButton")?.addEventListener("click", () => {
      selectedUrls = new Set(
        batchImages.map((image) => image.url).filter((url) => isSelectableBatchUrl(url)),
      );
      renderPanel();
    });
    body.querySelector("#selectNoneButton")?.addEventListener("click", () => {
      selectedUrls = new Set();
      renderPanel();
    });
    body.querySelector("#collectSelectedButton")?.addEventListener("click", collectSelectedImages);

    body.querySelectorAll<HTMLInputElement>(".check").forEach((input) => {
      input.addEventListener("change", () => {
        if (!isSelectableBatchUrl(input.value)) {
          input.checked = false;
          selectedUrls.delete(input.value);
          syncBatchToolbar();
          return;
        }

        if (input.checked) {
          selectedUrls.add(input.value);
        } else {
          selectedUrls.delete(input.value);
        }
        syncBatchToolbar();
      });
    });

    body.scrollTop = previousScrollTop;
  }

  function syncBatchToolbar(): void {
    const root = shadow;
    if (!root || currentView !== "batch") {
      return;
    }

    const selectedCount = selectedUrls.size;
    const progressText = getBatchProgressText(selectedCount);
    const progress = root.getElementById("batchProgressText");
    const collectButton = root.getElementById("collectSelectedButton");

    if (progress) {
      progress.textContent = progressText;
    }
    if (collectButton) {
      (collectButton as HTMLButtonElement).disabled = !selectedCount || batchRunning;
    }
  }

  function getBatchProgressText(selectedCount = selectedUrls.size): string {
    if (!batchRunning || !activeBatchUrls.size) {
      return `${selectedCount} 已选`;
    }

    const activeStatuses = [...activeBatchUrls].map((url) => batchStatus.get(url));
    const completed = activeStatuses.filter(
      (status) => status === "success" || status === "failed",
    ).length;
    return `${completed} / ${activeBatchUrls.size}`;
  }

  function isSelectableBatchUrl(url: string): boolean {
    const status = batchStatus.get(url);
    return status !== "success" && status !== "queued" && status !== "running";
  }

  function renderImageItem(image: ScannedImage): string {
    const status = batchStatus.get(image.url);
    const selectable = isSelectableBatchUrl(image.url);
    const statusText =
      status === "success"
        ? "完成"
        : status === "failed"
          ? "失败"
          : status === "running"
            ? "进行"
            : status === "queued"
              ? "队列"
              : "";

    return `
      <label class="thumb" title="${escapeHtml(image.url)}">
        <img src="${escapeHtml(image.url)}" alt="">
        <input class="check" type="checkbox" value="${escapeHtml(image.url)}" ${selectedUrls.has(image.url) && selectable ? "checked" : ""} ${selectable && !batchRunning ? "" : "disabled"}>
        ${statusText ? `<span class="status">${statusText}</span>` : ""}
      </label>
    `;
  }

  function renderPreferences(body: HTMLElement): void {
    const dragEnabled = preferences.dragDockEnabled !== false;
    const targetFolderEnabled = isTargetFolderEnabled();
    body.innerHTML = `
      <div class="plain-row" style="margin-top: 2px;">
        <span>发送前选择文件夹</span>
        <button class="switch ${targetFolderEnabled ? "on" : ""}" id="targetFolderToggleButton" type="button" aria-label="切换发送前选择文件夹">
          <span></span>
        </button>
      </div>
      <div class="field">
        <label for="importConcurrency">导入并发</label>
        <input id="importConcurrency" inputmode="numeric" placeholder="${escapeHtml(defaults.importConcurrency || 10)}" value="${escapeHtml(preferences.importConcurrency || "")}">
      </div>
      <div class="plain-row" style="margin-top: 2px;">
        <span>拖拽收藏</span>
        <button class="switch ${dragEnabled ? "on" : ""}" id="dragToggleButton" type="button" aria-label="切换拖拽收藏">
          <span></span>
        </button>
      </div>
      <div class="row" style="justify-content: flex-end; margin-top: 14px;">
        <button class="button" id="savePreferencesButton" type="button">保存</button>
      </div>
    `;

    body.querySelector("#targetFolderToggleButton")?.addEventListener("click", async () => {
      preferences = { ...preferences, targetFolderEnabled: !targetFolderEnabled };
      await savePreferences(preferences);
      renderPanel();
    });
    body.querySelector("#dragToggleButton")?.addEventListener("click", async () => {
      preferences = { ...preferences, dragDockEnabled: !dragEnabled };
      await savePreferences(preferences);
      renderPanel();
    });
    body.querySelector("#savePreferencesButton")?.addEventListener("click", async () => {
      const importConcurrencyInput = body.querySelector<HTMLInputElement>("#importConcurrency");
      const next = {
        ...preferences,
        importConcurrency: importConcurrencyInput?.value.trim() || "",
        targetFolderEnabled,
      };

      try {
        await savePreferences(next);
        collector.showToast("偏好已保存", "success", 1800);
        renderPanel();
      } catch (error) {
        collector.showToast(collector.getErrorMessage(error), "error", 3000);
      }
    });
  }

  async function scanImages(): Promise<void> {
    await Promise.all([loadPreferences(), loadFolders()]);
    batchImages = scanPageImages(collector);
    const batchImageUrls = new Set(batchImages.map((image) => image.url));
    batchStatus = new Map(
      [...batchStatus.entries()].filter(
        ([url, status]) => batchImageUrls.has(url) && status === "success",
      ),
    );
    activeBatchUrls = new Set([...activeBatchUrls].filter((url) => batchImageUrls.has(url)));
    selectedUrls = new Set();
  }

  async function collectSelectedImages(): Promise<void> {
    const urls = [...selectedUrls];
    if (!urls.length || batchRunning) {
      return;
    }

    const batchImageByUrl = new Map(batchImages.map((image) => [image.url, image]));
    const target = await resolveTargetFolderForSend();
    if (target.cancelled) {
      return;
    }

    batchRunning = true;
    activeBatchUrls = new Set(urls);
    for (const url of urls) {
      selectedUrls.delete(url);
      batchStatus.set(url, "queued");
    }
    renderPanel();

    let nextIndex = 0;
    const workerCount = Math.min(
      urls.length,
      parseOptionalInt(preferences.importConcurrency) || defaults.importConcurrency || 10,
    );

    async function runNext() {
      const url = urls[nextIndex];
      nextIndex += 1;
      if (!url) {
        return;
      }

      batchStatus.set(url, "running");
      renderPanel();

      try {
        const imageItem = batchImageByUrl.get(url);
        const sourceUrl = imageItem?.sourceUrl;
        const result = await collector.requestCollectImage(url, {
          referer: window.location.href,
          sourceUrl,
          collectionPayload: {
            imageUrl: url,
            candidateUrls: [url],
            sourceUrl: sourceUrl || window.location.href,
            metadata: imageItem?.metadata || null,
          } satisfies CollectionPayload,
          missingImageMessage: "未找到可采集的图片",
          notifyOnSuccess: false,
          folderId: target.folderId,
          targetFolderResolved: target.resolved,
        });

        batchStatus.set(url, result?.success ? "success" : "failed");
      } catch {
        batchStatus.set(url, "failed");
      }
      renderPanel();
      await runNext();
    }

    await Promise.all(Array.from({ length: workerCount }, () => runNext()));

    batchRunning = false;
    activeBatchUrls = new Set();
    const failures = [...batchStatus.values()].filter((status) => status === "failed").length;
    collector.showToast(
      failures ? `批量收藏完成，失败 ${failures} 张` : "批量收藏完成",
      failures ? "info" : "success",
      2600,
    );
    renderPanel();
  }

  async function captureVisibleScreenshot(): Promise<boolean> {
    try {
      const target = await resolveTargetFolderForSend();
      if (target.cancelled) {
        return false;
      }

      setPanelVisible(false);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const response = await sendRuntimeMessage({
        action: "captureVisibleScreenshot",
        payload: {
          folderId: target.folderId,
          sourceUrl: window.location.href,
          targetFolderResolved: target.resolved,
        },
      });

      if (!response?.success) {
        throw new Error(response?.error || "截图失败");
      }

      collector.showToast("已收藏可视范围截图", "success", 2200);
      return true;
    } catch (error) {
      collector.showToast("截图失败: " + collector.getErrorMessage(error), "error", 3600);
      throw error;
    } finally {
      setPanelVisible(true);
    }
  }

  function startAreaCapture(): void {
    ensurePanel();
    setPanelVisible(false);

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "cursor: crosshair",
      "background: rgba(15, 23, 42, 0.16)",
    ].join(";");

    const selection = document.createElement("div");
    selection.style.cssText = [
      "position: fixed",
      "display: none",
      "border-radius: 8px",
      "background: rgba(255, 255, 255, 0.18)",
      "box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.34), inset 0 0 0 1px rgba(255, 255, 255, 0.95)",
    ].join(";");
    overlay.appendChild(selection);

    let startX = 0;
    let startY = 0;
    let currentRect: DOMRect | null = null;
    let dragging = false;

    function updateSelection(event: MouseEvent): void {
      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      currentRect = new DOMRect(left, top, width, height);
      selection.style.display = "block";
      selection.style.left = `${left}px`;
      selection.style.top = `${top}px`;
      selection.style.width = `${width}px`;
      selection.style.height = `${height}px`;
    }

    function cleanup(restorePanel = true): void {
      window.removeEventListener("keydown", handleKeydown, true);
      overlay.remove();
      if (restorePanel) {
        setPanelVisible(true);
      }
    }

    async function finishSelection(): Promise<void> {
      const rect = currentRect;
      cleanup(false);

      if (!rect || rect.width < 8 || rect.height < 8) {
        setPanelVisible(true);
        return;
      }

      try {
        const result = await captureArea(rect);
        if (!result) {
          return;
        }
        collector.showToast("已收藏区域截图", "success", 2200);
      } catch (error) {
        collector.showToast("截图失败: " + collector.getErrorMessage(error), "error", 3600);
      } finally {
        setPanelVisible(true);
      }
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(true);
      }
    }

    overlay.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      updateSelection(event);
    });

    overlay.addEventListener("mousemove", (event) => {
      if (!dragging) {
        return;
      }
      updateSelection(event);
    });

    overlay.addEventListener("mouseup", () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      void finishSelection();
    });

    window.addEventListener("keydown", handleKeydown, true);
    (document.body || document.documentElement).appendChild(overlay);
  }

  function startElementCapture(): void {
    ensurePanel();
    setPanelVisible(false);

    const previousCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "crosshair";

    const overlay = document.createElement("div");
    overlay.id = ELEMENT_PICKER_OVERLAY_ID;
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "pointer-events: none",
      "background: rgba(15, 23, 42, 0.10)",
    ].join(";");

    const highlight = document.createElement("div");
    highlight.style.cssText = [
      "position: fixed",
      "display: none",
      "border-radius: 6px",
      "background: rgba(37, 99, 235, 0.14)",
      "box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.95), 0 0 0 9999px rgba(15, 23, 42, 0.20)",
    ].join(";");
    overlay.appendChild(highlight);

    let selectedElement: Element | null = null;
    let selectedRect: DOMRect | null = null;
    let completed = false;

    function cleanup(restorePanel = true): void {
      document.documentElement.style.cursor = previousCursor;
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("scroll", handleScroll, true);
      overlay.remove();
      if (restorePanel) {
        setPanelVisible(true);
      }
    }

    function isPickerElement(element: Element | null): boolean {
      return Boolean(
        element === overlay ||
        element === host ||
        element?.id === ELEMENT_PICKER_OVERLAY_ID ||
        element?.id === PANEL_ID ||
        element?.id === "shiguang-toast-container" ||
        host?.contains(element),
      );
    }

    function getElementAtPoint(x: number, y: number): Element | null {
      const elements = document.elementsFromPoint(x, y);
      return (
        elements.find((element) => {
          if (!(element instanceof Element) || isPickerElement(element)) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.width >= 2 && rect.height >= 2;
        }) || null
      );
    }

    function getVisibleRect(element: Element): DOMRect {
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      return new DOMRect(left, top, width, height);
    }

    function updateHighlight(rect: DOMRect | null): void {
      selectedRect = rect;
      if (!rect || rect.width < 2 || rect.height < 2) {
        highlight.style.display = "none";
        return;
      }

      highlight.style.display = "block";
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
    }

    function selectFromEvent(event: MouseEvent): void {
      selectedElement = getElementAtPoint(event.clientX, event.clientY);
      updateHighlight(selectedElement ? getVisibleRect(selectedElement) : null);
    }

    async function finishSelection(event: MouseEvent): Promise<void> {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (completed) {
        return;
      }
      completed = true;

      if (!selectedElement) {
        selectFromEvent(event);
      }

      const rect = selectedElement ? getVisibleRect(selectedElement) : selectedRect;
      cleanup(false);

      if (!rect || rect.width < 8 || rect.height < 8) {
        setPanelVisible(true);
        return;
      }

      try {
        const result = await captureArea(rect, "element-screenshot.png");
        if (!result) {
          return;
        }
        collector.showToast("已收藏元素截图", "success", 2200);
      } catch (error) {
        collector.showToast("截图失败: " + collector.getErrorMessage(error), "error", 3600);
      } finally {
        setPanelVisible(true);
      }
    }

    function handleMouseMove(event: MouseEvent): void {
      selectFromEvent(event);
    }

    function handleMouseDown(event: MouseEvent): void {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    function handleClick(event: MouseEvent): void {
      if (event.button !== 0) {
        return;
      }
      void finishSelection(event);
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(true);
      }
    }

    function handleScroll(): void {
      if (selectedElement) {
        updateHighlight(getVisibleRect(selectedElement));
      }
    }

    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("scroll", handleScroll, true);
    (document.body || document.documentElement).appendChild(overlay);
  }

  async function captureArea(rect: DOMRect, filename = "area-screenshot.png"): Promise<unknown> {
    const target = await resolveTargetFolderForSend();
    if (target.cancelled) {
      return null;
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const response = await sendRuntimeMessage({ action: "captureVisibleDataUrl" });
    if (!response?.success || !response.dataUrl) {
      throw new Error(response?.error || "截图失败");
    }

    const croppedDataUrl = await cropDataUrl(response.dataUrl, rect);
    const importResponse = await sendRuntimeMessage({
      action: "importScreenshotDataUrl",
      payload: {
        dataUrl: croppedDataUrl,
        filename,
        folderId: target.folderId,
        sourceUrl: window.location.href,
        targetFolderResolved: target.resolved,
      },
    });

    if (!importResponse?.success) {
      throw new Error(importResponse?.error || "导入截图失败");
    }

    return importResponse.result;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && panelOpen) {
        closePanel();
      }
    },
    true,
  );

  return {
    togglePanel,
    openPanel,
    closePanel,
    selectTargetFolder,
    startAreaCapture,
    startElementCapture,
    captureVisibleScreenshot,
  };
}
