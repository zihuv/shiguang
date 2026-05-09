// Content Script Entry

import { defineContentScript } from "wxt/utils/define-content-script";
import { createCollector } from "../../lib/content/collector";
import { createDragDock } from "../../lib/content/drag-dock";
import { createPanel } from "../../lib/content/panel";
import { siteMetadata } from "../../lib/content/site-metadata";
import { initSiteAdapters } from "../../lib/site-adapters";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const collector = createCollector(siteMetadata);
    const dragDock = createDragDock(collector);
    const panel = createPanel(collector);
    const DRAG_PREVIEW_ID = "shiguang-drag-preview-container";
    const DRAG_PREVIEW_MAX_SIZE = 112;

    initSiteAdapters(collector);

    function findPreviewImageElement(target) {
      const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
      if (!(element instanceof Element)) {
        return null;
      }

      if (element instanceof HTMLImageElement && element.currentSrc) {
        return element;
      }

      return element.querySelector("img");
    }

    function ensureDragPreviewContainer() {
      let container = document.getElementById(DRAG_PREVIEW_ID);
      if (container) {
        return container;
      }

      container = document.createElement("div");
      container.id = DRAG_PREVIEW_ID;
      container.setAttribute("aria-hidden", "true");
      container.style.cssText = [
        "position: fixed",
        "top: -100000px",
        "left: 0",
        "pointer-events: none",
      ].join(";");
      (document.body || document.documentElement).appendChild(container);
      return container;
    }

    function getCompactDragPreviewSize(image) {
      const width = image.naturalWidth || image.width || image.getBoundingClientRect().width;
      const height = image.naturalHeight || image.height || image.getBoundingClientRect().height;
      if (!width || !height) {
        return null;
      }

      const scale = Math.min(1, DRAG_PREVIEW_MAX_SIZE / Math.max(width, height));
      return {
        height: Math.max(24, Math.round(height * scale)),
        width: Math.max(24, Math.round(width * scale)),
      };
    }

    function createCanvasDragPreview(image, size) {
      const canvas = document.createElement("canvas");
      const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      canvas.width = Math.round(size.width * pixelRatio);
      canvas.height = Math.round(size.height * pixelRatio);
      canvas.style.cssText = [
        `width: ${size.width}px`,
        `height: ${size.height}px`,
        "display: block",
        "border-radius: 8px",
        "box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24)",
      ].join(";");

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.scale(pixelRatio, pixelRatio);
      context.drawImage(image, 0, 0, size.width, size.height);
      return canvas;
    }

    function createCloneDragPreview(image, size) {
      const preview = image.cloneNode(false);
      preview.removeAttribute("id");
      preview.src = image.currentSrc || image.src;
      preview.style.cssText = [
        `width: ${size.width}px`,
        `height: ${size.height}px`,
        "display: block",
        "object-fit: cover",
        "border-radius: 8px",
        "box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24)",
        "background: #fff",
      ].join(";");
      return preview;
    }

    function setCompactDragImage(event, target) {
      const image = findPreviewImageElement(target);
      if (!event.dataTransfer || !image) {
        return;
      }

      const size = getCompactDragPreviewSize(image);
      if (!size) {
        return;
      }

      let preview = null;
      try {
        preview = createCanvasDragPreview(image, size);
      } catch (error) {
        console.warn("创建拖拽缩略图失败，回退到图片节点:", error);
      }
      preview = preview || createCloneDragPreview(image, size);

      const container = ensureDragPreviewContainer();
      container.textContent = "";
      container.appendChild(preview);
      event.dataTransfer.setDragImage(preview, 0, 0);
    }

    function getImageUrlFromPointerEvent(event) {
      return (
        collector.getImageUrlFromElement(event.target) ||
        collector.getImageUrlFromPoint?.(event.clientX, event.clientY)
      );
    }

    async function collectImageFromEvent(event, label) {
      const target = event.target;
      const imageUrl = getImageUrlFromPointerEvent(event);

      if (!imageUrl) {
        return false;
      }

      const collectionPayload = collector.setLastImageContext(target, imageUrl);

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      try {
        const result = await collector.requestCollectImage(imageUrl, {
          collectionPayload,
          missingImageMessage: "未找到可采集的图片",
          notifyOnSuccess: true,
          successMessage: "已发送到拾光",
        });

        if (result.cancelled) {
          return false;
        }

        if (!result.success) {
          throw new Error(result.error || "未知错误");
        }
      } catch (error) {
        console.error(`${label}发送到拾光失败:`, error);
        collector.showToast("发送失败: " + collector.getErrorMessage(error), "error", 3600);
      }

      return true;
    }

    document.addEventListener(
      "contextmenu",
      (event) => {
        const target = event.target;
        const imageUrl = getImageUrlFromPointerEvent(event);
        collector.setLastImageContext(target, imageUrl);

        if (event.altKey && imageUrl) {
          void collectImageFromEvent(event, "Alt+右键");
        }
      },
      true,
    );

    document.addEventListener(
      "dragstart",
      (event) => {
        if (dragDock?.isEnabled && !dragDock.isEnabled()) {
          return;
        }

        const target = event.target;
        const imageUrl = collector.getImageUrlFromElement(target);

        if (!imageUrl) {
          return;
        }

        const collectionPayload = collector.setLastImageContext(target, imageUrl);
        setCompactDragImage(event, target);
        dragDock?.showDragDock(
          collectionPayload?.imageUrl || imageUrl,
          window.location.href,
          collector.getLastSourceUrl?.() || window.location.href,
          collectionPayload,
          {
            clientX: event.clientX,
            clientY: event.clientY,
          },
        );
      },
      true,
    );

    document.addEventListener(
      "dragend",
      () => {
        dragDock?.scheduleHide();
      },
      true,
    );

    document.addEventListener(
      "drop",
      () => {
        dragDock?.scheduleHide(0);
      },
      true,
    );

    window.addEventListener(
      "blur",
      () => {
        dragDock?.scheduleHide(0);
      },
      true,
    );

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        dragDock?.hideDragDock?.(true);
      }
    });

    document.addEventListener(
      "click",
      async (event) => {
        if (event.button !== 0 || !event.altKey) {
          return;
        }

        void collectImageFromEvent(event, "Alt+左键");
      },
      true,
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "getLastImageUrl") {
        sendResponse({
          imageUrl: collector.getLastImageUrl(),
          sourceUrl: collector.getLastSourceUrl?.() || null,
          collectionPayload: collector.getLastCollectionPayload?.() || null,
        });
        return true;
      }

      if (message.action === "showToast") {
        const payload = message.payload || {};
        collector.showToast(
          payload.message || "",
          payload.type || "info",
          payload.duration || 3000,
        );
        sendResponse({ success: true });
        return true;
      }

      if (message.action === "togglePanel") {
        panel?.togglePanel?.();
        sendResponse({ success: Boolean(panel) });
        return true;
      }

      if (message.action === "selectTargetFolder") {
        if (!panel?.selectTargetFolder) {
          sendResponse({ success: false, error: "当前页面无法选择目标文件夹" });
          return true;
        }

        panel
          .selectTargetFolder()
          .then(sendResponse)
          .catch((error) =>
            sendResponse({ success: false, error: collector.getErrorMessage(error) }),
          );
        return true;
      }

      if (message.action === "startAreaCapture") {
        panel?.startAreaCapture?.();
        sendResponse({ success: Boolean(panel) });
        return true;
      }

      if (message.action === "startElementCapture") {
        panel?.startElementCapture?.();
        sendResponse({ success: Boolean(panel) });
        return true;
      }

      if (message.action === "captureVisibleFromPage") {
        if (!panel?.captureVisibleScreenshot) {
          sendResponse({ success: false });
          return true;
        }

        panel
          .captureVisibleScreenshot()
          .then(() => sendResponse({ success: true }))
          .catch((error) =>
            sendResponse({ success: false, error: collector.getErrorMessage(error) }),
          );
        return true;
      }

      if (message.action === "createDownloadFrame") {
        const payload = message.payload || {};
        sendResponse(
          collector.createDownloadFrame?.(payload.token, payload.imageUrl) || {
            success: false,
            error: "当前页面无法创建下载 frame",
          },
        );
        return true;
      }

      if (message.action === "removeDownloadFrame") {
        const payload = message.payload || {};
        collector.removeDownloadFrame?.(payload.token);
        sendResponse({ success: true });
        return true;
      }
    });
  },
});
