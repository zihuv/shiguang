// Content Script Drag Dock

import { collectorPreferences } from "../preferences";
import { dragDockStyle } from "./drag-dock-style";

export function createDragDock(collector) {
  const DRAG_DOCK_ID = "shiguang-drag-dock";
  const DRAG_DOCK_STYLE_ID = "shiguang-drag-dock-style";
  const DRAG_DOCK_HIDE_DELAY = 140;
  const DEFAULT_FOLDER_TARGET_ID = "__default__";
  const DRAG_PANEL_MARGIN = 12;
  const DRAG_PANEL_GAP = 24;
  const FOLDER_LIST_AUTO_SCROLL_EDGE = 42;
  const FOLDER_LIST_AUTO_SCROLL_MAX_SPEED = 18;

  let dragDockRefs = null;
  let dragDockHideTimer = 0;
  let dragDockHoverDepth = 0;
  let dragDockVisible = false;
  let dragDockSending = false;
  let currentDragImageUrl = null;
  let currentDragReferer = null;
  let currentDragSourceUrl = null;
  let currentDragCollectionPayload = null;
  let dragDockEnabled = true;
  let folderTargets = [];
  let folderTargetsLoading = false;
  let folderTargetsError = "";
  let activeFolderTargetId = null;
  let lastDragPoint = null;
  let folderAutoScrollFrame = 0;
  let folderAutoScrollSpeed = 0;

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

  function stopFolderAutoScroll() {
    folderAutoScrollSpeed = 0;
    if (folderAutoScrollFrame) {
      window.cancelAnimationFrame(folderAutoScrollFrame);
      folderAutoScrollFrame = 0;
    }
  }

  function runFolderAutoScroll() {
    if (!folderAutoScrollSpeed || !dragDockRefs?.folderList?.isConnected) {
      stopFolderAutoScroll();
      return;
    }

    dragDockRefs.folderList.scrollTop += folderAutoScrollSpeed;
    folderAutoScrollFrame = window.requestAnimationFrame(runFolderAutoScroll);
  }

  function setFolderAutoScrollSpeed(speed) {
    folderAutoScrollSpeed = speed;
    if (!speed) {
      stopFolderAutoScroll();
      return;
    }

    if (!folderAutoScrollFrame) {
      dragDockRefs.folderList.scrollTop += speed;
      folderAutoScrollFrame = window.requestAnimationFrame(runFolderAutoScroll);
    }
  }

  function updateFolderAutoScroll(event) {
    const folderList = dragDockRefs?.folderList;
    if (!folderList || folderList.hidden) {
      stopFolderAutoScroll();
      return;
    }

    const rect = folderList.getBoundingClientRect();
    if (!rect.height || event.clientY < rect.top || event.clientY > rect.bottom) {
      stopFolderAutoScroll();
      return;
    }

    const maxScrollTop = Math.max(0, folderList.scrollHeight - folderList.clientHeight);
    if (!maxScrollTop) {
      stopFolderAutoScroll();
      return;
    }

    const distanceToTop = event.clientY - rect.top;
    const distanceToBottom = rect.bottom - event.clientY;
    if (distanceToTop < FOLDER_LIST_AUTO_SCROLL_EDGE && folderList.scrollTop > 0) {
      const strength = 1 - distanceToTop / FOLDER_LIST_AUTO_SCROLL_EDGE;
      setFolderAutoScrollSpeed(-Math.ceil(strength * FOLDER_LIST_AUTO_SCROLL_MAX_SPEED));
      return;
    }

    if (distanceToBottom < FOLDER_LIST_AUTO_SCROLL_EDGE && folderList.scrollTop < maxScrollTop) {
      const strength = 1 - distanceToBottom / FOLDER_LIST_AUTO_SCROLL_EDGE;
      setFolderAutoScrollSpeed(Math.ceil(strength * FOLDER_LIST_AUTO_SCROLL_MAX_SPEED));
      return;
    }

    stopFolderAutoScroll();
  }

  function sendRuntimeMessage(message) {
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

  function parseOptionalInt(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function flattenFolders(folders, defaultFolderId, depth = 0, trail = []) {
    const rows = [];
    for (const folder of folders || []) {
      const nextTrail = [...trail, folder.name].filter(Boolean);
      if (defaultFolderId && folder.id === defaultFolderId) {
        rows.push(...flattenFolders(folder.children || [], defaultFolderId, depth + 1, nextTrail));
        continue;
      }

      rows.push({
        id: String(folder.id),
        folderId: String(folder.id),
        name: folder.name,
        depth,
        pathLabel: nextTrail.join("/"),
      });
      rows.push(...flattenFolders(folder.children || [], defaultFolderId, depth + 1, nextTrail));
    }
    return rows;
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

      const defaultFolderId = parseOptionalInt(response.default_folder_id);
      folderTargets = [
        {
          id: DEFAULT_FOLDER_TARGET_ID,
          folderId: "",
          name: "浏览器采集",
          pathLabel: "浏览器采集",
          depth: 0,
        },
        ...flattenFolders(response.folders || [], defaultFolderId),
      ];
    } catch (error) {
      folderTargets = [
        {
          id: DEFAULT_FOLDER_TARGET_ID,
          folderId: "",
          name: "浏览器采集",
          pathLabel: "浏览器采集",
          depth: 0,
        },
      ];
      folderTargetsError = collector.getErrorMessage(error);
    } finally {
      folderTargetsLoading = false;
      syncDragDock();
    }
  }

  function getFolderTargetFromEvent(event) {
    const target = event.target?.closest?.("[data-shiguang-folder-target-id]");
    if (!target) {
      return null;
    }

    const id = target.dataset.shiguangFolderTargetId;
    return folderTargets.find((folder) => folder.id === id) || null;
  }

  function renderFolderTargets(refs) {
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

  function ensureDragDock() {
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

    card.addEventListener("drop", async (event) => {
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

      dragDockSending = true;
      currentDragImageUrl = imageUrl;
      syncDragDock();

      try {
        const result = await collector.requestCollectImage(imageUrl, {
          referer: currentDragReferer || window.location.href,
          sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
          collectionPayload: currentDragCollectionPayload || {
            imageUrl,
            sourceUrl: currentDragSourceUrl || currentDragReferer || window.location.href,
            metadata: null,
          },
          missingImageMessage: "未找到可采集的图片",
          notifyOnSuccess: true,
          successMessage: folderTarget ? `已发送到 ${folderTarget.name || "拾光"}` : "已发送到拾光",
          folderId: folderTarget ? (folderTarget.folderId ?? folderTarget.id) : undefined,
          targetFolderResolved: Boolean(folderTarget),
        });

        if (result.cancelled) {
          return;
        }

        if (!result.success) {
          throw new Error(result.error || "未知错误");
        }
      } catch (error) {
        console.error("拖拽发送到拾光失败:", error);
        collector.showToast("发送失败: " + collector.getErrorMessage(error), "error", 3600);
      } finally {
        hideDragDock(true);
      }
    });

    (document.body || document.documentElement).appendChild(root);

    dragDockRefs = {
      root,
      card,
      leftDropTarget,
      rightTitle,
      folderList,
      folderStatus,
      footerText,
    };
    syncDragDock();
    return dragDockRefs;
  }

  function syncDragDock() {
    const refs = dragDockVisible || dragDockRefs?.root?.isConnected ? ensureDragDock() : null;
    if (!refs) {
      return;
    }

    const { root, footerText } = refs;
    const isActive = dragDockHoverDepth > 0;

    root.setAttribute("aria-hidden", dragDockVisible ? "false" : "true");
    root.classList.toggle("shiguang-drag-dock--visible", dragDockVisible);
    root.classList.toggle("shiguang-drag-dock--interactive", dragDockVisible && !dragDockSending);
    root.classList.toggle("shiguang-drag-dock--active", isActive);
    renderFolderTargets(refs);

    if (dragDockSending) {
      footerText.textContent = "正在发送到拾光...";
      return;
    }

    if (isActive) {
      const activeTarget = folderTargets.find((folder) => folder.id === activeFolderTargetId);
      footerText.textContent = activeTarget
        ? `松开发送到 ${activeTarget.name}`
        : "释放鼠标后立即发送";
      return;
    }

    footerText.textContent = folderTargetsLoading ? "正在读取文件夹..." : "拖到左侧或文件夹";
  }

  function updateDragDockPosition(clientX, clientY) {
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
    imageUrl,
    referer = window.location.href,
    sourceUrl = referer,
    collectionPayload = null,
    dragPoint = null,
  ) {
    if (!dragDockEnabled) {
      return;
    }

    clearDragDockHideTimer();
    dragDockHoverDepth = 0;
    dragDockVisible = true;
    dragDockSending = false;
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

  function hideDragDock(force = false) {
    clearDragDockHideTimer();

    if (dragDockSending && !force) {
      return;
    }

    dragDockVisible = false;
    dragDockHoverDepth = 0;
    dragDockSending = false;
    currentDragImageUrl = null;
    currentDragReferer = null;
    currentDragSourceUrl = null;
    currentDragCollectionPayload = null;
    activeFolderTargetId = null;
    lastDragPoint = null;
    stopFolderAutoScroll();
    syncDragDock();
  }

  function scheduleDragDockHide(delay = DRAG_DOCK_HIDE_DELAY) {
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
