// Content Script Entry

import { defineContentScript } from "wxt/utils/define-content-script";
import { createCollector } from "../../lib/content/collector";
import { createDragDock } from "../../lib/content/drag-dock";
import { setCompactDragImage } from "../../lib/content/drag-preview";
import { createImageFetchFrame, removeImageFetchFrame } from "../../lib/content/image-fetch-frames";
import { createPanel } from "../../lib/content/panel";
import { siteMetadata } from "../../lib/content/site-metadata";
import { initSiteAdapters } from "../../lib/site-adapters";
import type { CollectionPayload, ToastType } from "../../lib/types";

interface ContentRuntimeMessage {
  action?: string;
  payload?: {
    id?: string;
    message?: string;
    type?: ToastType;
    duration?: number;
    url?: string;
  };
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const collector = createCollector(siteMetadata);
    const dragDock = createDragDock(collector);
    const panel = createPanel(collector);

    initSiteAdapters(collector);

    function getImageUrlFromPointerEvent(event: MouseEvent): string | null {
      return (
        collector.getImageUrlFromElement(event.target) ||
        collector.getImageUrlFromPoint?.(event.clientX, event.clientY) ||
        null
      );
    }

    async function collectImageFromEvent(event: MouseEvent, label: string): Promise<boolean> {
      const target = event.target;
      const imageUrl = getImageUrlFromPointerEvent(event);

      if (!imageUrl) {
        return false;
      }

      const collectionPayload: CollectionPayload | null = collector.setLastImageContext(
        target,
        imageUrl,
      );

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

    chrome.runtime.onMessage.addListener(
      (message: ContentRuntimeMessage, _sender, sendResponse) => {
        if (message.action === "getLastImageUrl") {
          sendResponse({
            imageUrl: collector.getLastImageUrl(),
            sourceUrl: collector.getLastSourceUrl() || null,
            collectionPayload: collector.getLastCollectionPayload() || null,
            candidateUrls: collector.getLastCollectionPayload()?.candidateUrls || [],
            renderedImageDataUrl:
              collector.getRenderedImageDataUrl(
                collector.getLastRightClickTarget(),
                collector.getLastImageUrl(),
              ) || null,
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

        if (message.action === "createImageFetchFrame") {
          const payload = message.payload || {};
          sendResponse({
            success: createImageFetchFrame(payload.id || "", payload.url || ""),
          });
          return true;
        }

        if (message.action === "removeImageFetchFrame") {
          const payload = message.payload || {};
          sendResponse({
            success: removeImageFetchFrame(payload.id || ""),
          });
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
      },
    );
  },
});
