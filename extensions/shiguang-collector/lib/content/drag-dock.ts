// Content Script Drag Dock

import { collectorPreferences } from "../preferences";
import {
  buildFolderTargets,
  DEFAULT_FOLDER_TARGET_ID,
  findDefaultFolderId,
  parseFolderId,
} from "../folders";
import { dragDockStyle } from "./drag-dock-style";
import type { CollectionPayload, Collector, DragDock, FolderRecord, FolderTarget } from "../types";

interface DragDockRefs {
  root: HTMLDivElement;
  card: HTMLDivElement;
  leftDropTarget: HTMLDivElement;
  rightPanel: HTMLDivElement;
  rightTitle: HTMLDivElement;
  folderList: HTMLDivElement;
  folderStatus: HTMLDivElement;
  footerText: HTMLSpanElement;
}

interface RuntimeFoldersResponse {
  success?: boolean;
  error?: string;
  default_folder_id?: unknown;
  folders?: FolderRecord[];
}

export function createDragDock(collector: Collector): DragDock {
  const DRAG_DOCK_ID = "shiguang-drag-dock";
  const DRAG_DOCK_STYLE_ID = "shiguang-drag-dock-style";
  const DRAG_DOCK_HIDE_DELAY = 140;
  const DRAG_PANEL_MARGIN = 12;
  const DRAG_PANEL_GAP = 24;
  const FOLDER_LIST_AUTO_SCROLL_EDGE = 24;
  const FOLDER_LIST_AUTO_SCROLL_TARGET_EDGE = 12;
  const FOLDER_LIST_AUTO_SCROLL_MAX_SPEED = 12;
  const FOLDER_LIST_AUTO_SCROLL_INTENT_DELAY = 140;

  let dragDockRefs: DragDockRefs | null = null;
  let dragDockHideTimer = 0;
  let dragDockHoverDepth = 0;
  let dragDockVisible = false;
  let currentDragImageUrl: string | null = null;
  let currentDragReferer: string | null = null;
  let currentDragSourceUrl: string | null = null;
  let currentDragCollectionPayload: CollectionPayload | null = null;
  let dragDockEnabled = true;
  let folderTargets: FolderTarget[] = [];
  let folderTargetsLoading = false;
  let folderTargetsError = "";
  let activeFolderTargetId: string | null = null;
  let lastDragPoint: { x: number; y: number } | null = null;
  let folderAutoScrollFrame = 0;
  let folderAutoScrollSpeed = 0;
  let folderAutoScrollIntent: { direction: "up" | "down"; startedAt: number } | null = null;
  let lastFolderAutoScrollY: number | null = null;

  collectorPreferences.getValue().then((preferences) => {
    dragDockEnabled = preferences.dragDockEnabled !== false;
    if (!dragDockEnabled) {
      hideDragDock(true);
    }
  });

  collectorPreferences.watch((preferences) => {
    dragDockEnabled = preferences.dragDockEnabled !== false;
    if (!dragDockEnabled) {
      hideDragDock(true);
    }
  });

  function clearDragDockHideTimer() {
    if (!dragDockHideTimer) {
      return;
    }

    window.clearTimeout(dragDockHideTimer);
    dragDockHideTimer = 0;
  }

  function ensureDragDockStyle() {
    if (document.getElementById(DRAG_DOCK_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = DRAG_DOCK_STYLE_ID;
    style.textContent = dragDockStyle;
    (document.head || document.documentElement).appendChild(style);
  }

  function stopFolderAutoScroll(resetIntent = true) {
    folderAutoScrollSpeed = 0;
    if (folderAutoScrollFrame) {
      window.cancelAnimationFrame(folderAutoScrollFrame);
      folderAutoScrollFrame = 0;
    }

    if (resetIntent) {
      folderAutoScrollIntent = null;
      lastFolderAutoScrollY = null;
    }
  }

  function runFolderAutoScroll() {
    if (!folderAutoScrollSpeed || !dragDockRefs?.folderList?.isConnected) {
      stopFolderAutoScroll(false);
      return;
    }

    dragDockRefs.folderList.scrollTop += folderAutoScrollSpeed;
    folderAutoScrollFrame = window.requestAnimationFrame(runFolderAutoScroll);
  }

  function setFolderAutoScrollSpeed(speed: number): void {
    folderAutoScrollSpeed = speed;
    if (!speed) {
      stopFolderAutoScroll();
      return;
    }

    if (!folderAutoScrollFrame && dragDockRefs) {
      dragDockRefs.folderList.scrollTop += speed;
      folderAutoScrollFrame = window.requestAnimationFrame(runFolderAutoScroll);
    }
  }

  function getFolderTargetElementFromEvent(event: DragEvent): HTMLElement | null {
    return event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-shiguang-folder-target-id]")
      : null;
  }

  function getFolderAutoScrollSpeed(
    direction: "up" | "down",
    distanceToEdge: number,
    edge: number,
  ): number {
    const strength = Math.max(0, Math.min(1, 1 - distanceToEdge / edge));
    const speed = Math.ceil(strength * FOLDER_LIST_AUTO_SCROLL_MAX_SPEED);
    return direction === "up" ? -speed : speed;
  }

  function shouldDelayFolderAutoScroll(
    direction: "up" | "down",
    isOverFolderTarget: boolean,
    now: number,
  ): boolean {
    if (!isOverFolderTarget) {
      return false;
    }

    if (
      folderAutoScrollSpeed &&
      Math.sign(folderAutoScrollSpeed) === (direction === "up" ? -1 : 1)
    ) {
      return false;
    }

    if (!folderAutoScrollIntent || folderAutoScrollIntent.direction !== direction) {
      folderAutoScrollIntent = { direction, startedAt: now };
      return true;
    }

    return now - folderAutoScrollIntent.startedAt < FOLDER_LIST_AUTO_SCROLL_INTENT_DELAY;
  }

  function updateFolderAutoScroll(event: DragEvent): void {
    const folderList = dragDockRefs?.folderList;
    const rightPanel = dragDockRefs?.rightPanel;
    if (!folderList || folderList.hidden) {
      stopFolderAutoScroll();
      return;
    }

    const rect = folderList.getBoundingClientRect();
    const scopeRect = rightPanel?.getBoundingClientRect();
    const activeRect = scopeRect?.width && scopeRect.height ? scopeRect : rect;
    const isInAutoScrollScope =
      event.clientX >= activeRect.left &&
      event.clientX <= activeRect.right &&
      event.clientY >= activeRect.top &&
      event.clientY <= activeRect.bottom;
    if (!rect.height || !isInAutoScrollScope) {
      stopFolderAutoScroll();
      return;
    }

    const maxScrollTop = Math.max(0, folderList.scrollHeight - folderList.clientHeight);
    if (!maxScrollTop) {
      stopFolderAutoScroll();
      return;
    }

    const distanceToTop = Math.max(0, event.clientY - rect.top);
    const distanceToBottom = Math.max(0, rect.bottom - event.clientY);
    const isOverFolderTarget = Boolean(getFolderTargetElementFromEvent(event));
    const edge = isOverFolderTarget
      ? FOLDER_LIST_AUTO_SCROLL_TARGET_EDGE
      : FOLDER_LIST_AUTO_SCROLL_EDGE;
    const previousY = lastFolderAutoScrollY;
    const deltaY = previousY === null ? 0 : event.clientY - previousY;
    lastFolderAutoScrollY = event.clientY;

    const now = window.performance?.now?.() ?? Date.now();
    const candidates: Array<{
      direction: "up" | "down";
      distanceToEdge: number;
      movingTowardEdge: boolean;
    }> = [];

    if ((event.clientY < rect.top || distanceToTop < edge) && folderList.scrollTop > 0) {
      candidates.push({
        direction: "up",
        distanceToEdge: distanceToTop,
        movingTowardEdge: previousY === null || deltaY <= 0,
      });
    }

    if (
      (event.clientY > rect.bottom || distanceToBottom < edge) &&
      folderList.scrollTop < maxScrollTop
    ) {
      candidates.push({
        direction: "down",
        distanceToEdge: distanceToBottom,
        movingTowardEdge: previousY === null || deltaY >= 0,
      });
    }

    const candidate = candidates[0];
    if (candidate?.movingTowardEdge) {
      if (shouldDelayFolderAutoScroll(candidate.direction, isOverFolderTarget, now)) {
        stopFolderAutoScroll(false);
        return;
      }

      folderAutoScrollIntent = {
        direction: candidate.direction,
        startedAt: folderAutoScrollIntent?.startedAt ?? now,
      };
      setFolderAutoScrollSpeed(
        getFolderAutoScrollSpeed(candidate.direction, candidate.distanceToEdge, edge),
      );
      return;
    }

    stopFolderAutoScroll();
  }

  function sendRuntimeMessage(
    message: Record<string, unknown>,
  ): Promise<RuntimeFoldersResponse | null> {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }

      globalThis.chrome.runtime.sendMessage(message, (response) => {
        const error = globalThis.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function loadFolderTargets() {
    if (folderTargetsLoading) {
      return;
    }

    folderTargetsLoading = true;
    folderTargetsError = "";
    syncDragDock();

    try {
      const response = await sendRuntimeMessage({ action: "getFolders" });
      if (!response?.success) {
        throw new Error(response?.error || "无法读取拾光文件夹");
      }

      const defaultFolderId =
        parseFolderId(response.default_folder_id) || findDefaultFolderId(response.folders || []);
      folderTargets = buildFolderTargets(response.folders || [], defaultFolderId);
    } catch (error) {
      folderTargets = buildFolderTargets([], null);
      folderTargetsError = collector.getErrorMessage(error);
    } finally {
      folderTargetsLoading = false;
      syncDragDock();
    }
  }

  function getFolderTargetFromEvent(event: DragEvent): FolderTarget | null {
    const target = getFolderTargetElementFromEvent(event);
    if (!target) {
      return null;
    }

    const id = target.dataset.shiguangFolderTargetId;
    return folderTargets.find((folder) => folder.id === id) || null;
  }

  function renderFolderTargets(refs: DragDockRefs): void {
    const { folderList, folderStatus, leftDropTarget, rightTitle } = refs;
    if (!folderList || !folderStatus || !leftDropTarget || !rightTitle) {
      return;
    }

    const defaultTarget = folderTargets.find((folder) => folder.id === DEFAULT_FOLDER_TARGET_ID);
    if (defaultTarget) {
      leftDropTarget.dataset.shiguangFolderTargetId = defaultTarget.id;
      leftDropTarget.dataset.shiguangFolderId = defaultTarget.folderId || "";
    }

    const defaultActive = activeFolderTargetId === DEFAULT_FOLDER_TARGET_ID;
    leftDropTarget.classList.toggle("is-active", defaultActive);

    const visibleTargets = folderTargets.filter((folder) => folder.id !== DEFAULT_FOLDER_TARGET_ID);
    const renderSignature = [
      folderTargetsLoading ? "loading" : "ready",
      folderTargetsError,
      activeFolderTargetId || "",
      visibleTargets
        .map((folder) => [folder.id, folder.name, folder.pathLabel, folder.depth].join(":"))
        .join("|"),
    ].join("\n");
    if (folderList.dataset.shiguangRenderSignature === renderSignature) {
      return;
    }
    folderList.dataset.shiguangRenderSignature = renderSignature;

    folderList.textContent = "";
    rightTitle.textContent = "目标文件夹";
    if (!visibleTargets.length) {
      folderList.hidden = true;
      folderStatus.hidden = false;
      folderStatus.textContent = folderTargetsLoading
        ? "正在读取文件夹..."
        : folderTargetsError
          ? "暂时无法读取文件夹"
          : "尚未建立文件夹";
      return;
    }

    folderList.hidden = false;
    folderStatus.hidden = true;
    folderStatus.textContent = "";

    const fragment = document.createDocumentFragment();
    for (const folder of visibleTargets) {
      const target = document.createElement("div");
      target.dataset.shiguangFolderTargetId = folder.id;
      target.dataset.shiguangFolderId = folder.folderId ?? folder.id;
      target.setAttribute("role", "button");
      target.setAttribute("title", folder.pathLabel);
      target.className = "shiguang-drag-dock__folder-target";

      const marker = document.createElement("span");
      marker.setAttribute("aria-hidden", "true");
      marker.className = "shiguang-drag-dock__folder-marker";

      const label = document.createElement("span");
      label.textContent = folder.name;
      label.className = "shiguang-drag-dock__folder-label";

      const active = activeFolderTargetId === folder.id;
      target.classList.toggle("is-active", active);
      target.style.setProperty(
        "--shiguang-folder-target-left",
        `${10 + Math.min(folder.depth || 0, 2) * 8}px`,
      );

      target.appendChild(marker);
      target.appendChild(label);
      fragment.appendChild(target);
    }

    folderList.appendChild(fragment);
  }

  function ensureDragDock(): DragDockRefs {
    if (dragDockRefs?.root?.isConnected) {
      return dragDockRefs;
    }

    ensureDragDockStyle();

    const root = document.createElement("div");
    root.id = DRAG_DOCK_ID;
    root.className = "shiguang-drag-dock";
    root.setAttribute("aria-hidden", "true");

    const card = document.createElement("div");
    card.className = "shiguang-drag-dock__card";

    const leftPanel = document.createElement("div");
    leftPanel.className = "shiguang-drag-dock__left";

    const leftDropTarget = document.createElement("div");
    leftDropTarget.className = "shiguang-drag-dock__default-target";
    leftDropTarget.dataset.shiguangFolderTargetId = DEFAULT_FOLDER_TARGET_ID;
    leftDropTarget.dataset.shiguangFolderId = "";
    leftDropTarget.setAttribute("role", "button");
    leftDropTarget.setAttribute("title", "浏览器采集");

    const folderIcon = document.createElement("div");
    folderIcon.setAttribute("aria-hidden", "true");
    folderIcon.className = "shiguang-drag-dock__folder-icon";

    const folderTab = document.createElement("div");
    folderTab.className = "shiguang-drag-dock__folder-tab";

    const folderBody = document.createElement("div");
    folderBody.className = "shiguang-drag-dock__folder-body";

    const folderMark = document.createElement("div");
    folderMark.className = "shiguang-drag-dock__folder-mark";

    folderIcon.appendChild(folderTab);
    folderIcon.appendChild(folderBody);
    folderIcon.appendChild(folderMark);

    const leftTitle = document.createElement("div");
    leftTitle.className = "shiguang-drag-dock__left-title";
    leftTitle.textContent = "拖拽到这里收藏";

    const defaultFolderLabel = document.createElement("div");
    defaultFolderLabel.className = "shiguang-drag-dock__default-label";
    defaultFolderLabel.textContent = "浏览器采集";

    leftDropTarget.appendChild(folderIcon);
    leftDropTarget.appendChild(leftTitle);
    leftDropTarget.appendChild(defaultFolderLabel);
    leftPanel.appendChild(leftDropTarget);

    const rightPanel = document.createElement("div");
    rightPanel.className = "shiguang-drag-dock__right";

    const rightTitle = document.createElement("div");
    rightTitle.className = "shiguang-drag-dock__right-title";

    const folderListWrap = document.createElement("div");
    folderListWrap.className = "shiguang-drag-dock__folder-wrap";

    const folderList = document.createElement("div");
    folderList.className = "shiguang-drag-dock__folder-list";
    folderList.dataset.shiguangFolderList = "true";
    folderList.hidden = true;

    const folderStatus = document.createElement("div");
    folderStatus.className = "shiguang-drag-dock__folder-status";
    folderStatus.hidden = true;

    const rightFooter = document.createElement("div");
    rightFooter.className = "shiguang-drag-dock__footer";

    const plus = document.createElement("span");
    plus.className = "shiguang-drag-dock__plus";
    plus.setAttribute("aria-hidden", "true");
    plus.textContent = "+";

    const footerText = document.createElement("span");
    footerText.className = "shiguang-drag-dock__footer-text";
    footerText.textContent = "拖到左侧或文件夹";

    rightFooter.appendChild(plus);
    rightFooter.appendChild(footerText);
    folderListWrap.appendChild(folderList);
    folderListWrap.appendChild(folderStatus);
    rightPanel.appendChild(rightTitle);
    rightPanel.appendChild(folderListWrap);
    rightPanel.appendChild(rightFooter);
    card.appendChild(leftPanel);
    card.appendChild(rightPanel);
    root.appendChild(card);

    card.addEventListener("dragenter", (event) => {
      const imageUrl = currentDragImageUrl || collector.extractImageUrlFromDragEvent(event);
      if (!imageUrl) {
        return;
      }

      event.preventDefault();
      clearDragDockHideTimer();
      dragDockHoverDepth += 1;
      currentDragImageUrl = imageUrl;
      activeFolderTargetId = getFolderTargetFromEvent(event)?.id || null;
      currentDragCollectionPayload =
        currentDragCollectionPayload ||
        collector.resolveCollectionPayload?.(event.target, imageUrl, {
          sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
          pageUrl: currentDragReferer || window.location.href,
        }) ||
        null;
      syncDragDock();
    });

    card.addEventListener("dragover", (event) => {
      const imageUrl = currentDragImageUrl || collector.extractImageUrlFromDragEvent(event);
      if (!imageUrl) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }

      clearDragDockHideTimer();
      updateFolderAutoScroll(event);
      currentDragImageUrl = imageUrl;
      activeFolderTargetId = getFolderTargetFromEvent(event)?.id || null;
      currentDragCollectionPayload =
        currentDragCollectionPayload ||
        collector.resolveCollectionPayload?.(event.target, imageUrl, {
          sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
          pageUrl: currentDragReferer || window.location.href,
        }) ||
        null;
      dragDockVisible = true;
      dragDockHoverDepth = Math.max(1, dragDockHoverDepth);
      syncDragDock();
    });

    card.addEventListener("dragleave", () => {
      dragDockHoverDepth = Math.max(0, dragDockHoverDepth - 1);
      activeFolderTargetId = null;
      stopFolderAutoScroll();
      syncDragDock();
    });

    card.addEventListener("drop", (event) => {
      const imageUrl =
        currentDragImageUrl ||
        collector.extractImageUrlFromDragEvent(event) ||
        collector.getLastImageUrl();
      const folderTarget = getFolderTargetFromEvent(event);

      event.preventDefault();
      event.stopPropagation();
      clearDragDockHideTimer();
      stopFolderAutoScroll();
      dragDockHoverDepth = 0;
      activeFolderTargetId = folderTarget?.id || null;

      if (!imageUrl) {
        hideDragDock(true);
        collector.showToast("未找到可采集的图片", "error", 3200);
        return;
      }

      currentDragImageUrl = imageUrl;
      const sendPromise = collector.requestCollectImage(imageUrl, {
        referer: currentDragReferer || window.location.href,
        sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
        collectionPayload: currentDragCollectionPayload || {
          imageUrl,
          candidateUrls: [imageUrl],
          sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
          metadata: null,
        },
        missingImageMessage: "未找到可采集的图片",
        notifyOnError: true,
        notifyOnSuccess: true,
        successMessage: folderTarget ? `已发送到 ${folderTarget.name || "拾光"}` : "已发送到拾光",
        folderId: folderTarget ? (folderTarget.folderId ?? folderTarget.id) : undefined,
        targetFolderResolved: Boolean(folderTarget),
        waitForCompletion: false,
      });

      hideDragDock(true);

      void sendPromise
        .then((result) => {
          if (result.cancelled) {
            return;
          }

          if (!result.success) {
            throw new Error(result.error || "未知错误");
          }
        })
        .catch((error) => {
          console.error("拖拽发送到拾光失败:", error);
          collector.showToast("发送失败: " + collector.getErrorMessage(error), "error", 3600);
        });
    });

    (document.body || document.documentElement).appendChild(root);

    dragDockRefs = {
      root,
      card,
      leftDropTarget,
      rightPanel,
      rightTitle,
      folderList,
      folderStatus,
      footerText,
    };
    syncDragDock();
    return dragDockRefs;
  }

  function syncDragDock(): void {
    const refs = dragDockVisible || dragDockRefs?.root?.isConnected ? ensureDragDock() : null;
    if (!refs) {
      return;
    }

    const { root, footerText } = refs;
    const isActive = dragDockHoverDepth > 0;

    root.setAttribute("aria-hidden", dragDockVisible ? "false" : "true");
    root.classList.toggle("shiguang-drag-dock--visible", dragDockVisible);
    root.classList.toggle("shiguang-drag-dock--interactive", dragDockVisible);
    root.classList.toggle("shiguang-drag-dock--active", isActive);
    renderFolderTargets(refs);

    if (isActive) {
      const activeTarget = folderTargets.find((folder) => folder.id === activeFolderTargetId);
      footerText.textContent = activeTarget
        ? `松开发送到 ${activeTarget.name}`
        : "释放鼠标后立即发送";
      return;
    }

    footerText.textContent = folderTargetsLoading ? "正在读取文件夹..." : "拖到左侧或文件夹";
  }

  function updateDragDockPosition(clientX: number, clientY: number): void {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return;
    }

    lastDragPoint = { x: clientX, y: clientY };
    if (!dragDockRefs?.root?.isConnected) {
      return;
    }

    const { root, card } = dragDockRefs;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 520;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 238;
    const panelWidth = card.offsetWidth || Math.min(520, Math.max(280, viewportWidth - 24));
    const panelHeight = card.offsetHeight || 238;
    const rightX = clientX + DRAG_PANEL_GAP;
    const leftX = clientX - panelWidth - DRAG_PANEL_GAP;
    const canPlaceRight = rightX + panelWidth + DRAG_PANEL_MARGIN <= viewportWidth;
    const canPlaceLeft = leftX >= DRAG_PANEL_MARGIN;
    const unclampedX = canPlaceRight || !canPlaceLeft ? rightX : leftX;
    const maxX = Math.max(DRAG_PANEL_MARGIN, viewportWidth - panelWidth - DRAG_PANEL_MARGIN);
    const maxY = Math.max(DRAG_PANEL_MARGIN, viewportHeight - panelHeight - DRAG_PANEL_MARGIN);
    const x = Math.min(Math.max(DRAG_PANEL_MARGIN, unclampedX), maxX);
    const y = Math.min(Math.max(DRAG_PANEL_MARGIN, clientY - panelHeight / 2), maxY);

    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
  }

  function showDragDock(
    imageUrl: string,
    referer = window.location.href,
    sourceUrl = referer,
    collectionPayload: CollectionPayload | null = null,
    dragPoint: { clientX: number; clientY: number } | null = null,
  ): void {
    if (!dragDockEnabled) {
      return;
    }

    clearDragDockHideTimer();
    dragDockHoverDepth = 0;
    dragDockVisible = true;
    currentDragImageUrl = imageUrl;
    currentDragReferer = referer;
    currentDragSourceUrl = sourceUrl;
    currentDragCollectionPayload = collectionPayload;
    activeFolderTargetId = null;
    syncDragDock();
    if (dragPoint) {
      updateDragDockPosition(dragPoint.clientX, dragPoint.clientY);
    } else if (lastDragPoint) {
      updateDragDockPosition(lastDragPoint.x, lastDragPoint.y);
    }
    void loadFolderTargets();
  }

  function hideDragDock(_force = false): void {
    clearDragDockHideTimer();

    dragDockVisible = false;
    dragDockHoverDepth = 0;
    currentDragImageUrl = null;
    currentDragReferer = null;
    currentDragSourceUrl = null;
    currentDragCollectionPayload = null;
    activeFolderTargetId = null;
    lastDragPoint = null;
    stopFolderAutoScroll();
    syncDragDock();
  }

  function scheduleDragDockHide(delay = DRAG_DOCK_HIDE_DELAY): void {
    clearDragDockHideTimer();
    dragDockHideTimer = window.setTimeout(() => {
      hideDragDock();
    }, delay);
  }

  return {
    showDragDock,
    hideDragDock,
    scheduleHide: scheduleDragDockHide,
    isEnabled: () => dragDockEnabled,
  };
}
