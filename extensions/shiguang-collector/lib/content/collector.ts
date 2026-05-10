// Content Script Shared Utilities

import type {
  CollectionMetadata,
  CollectionPayload,
  Collector,
  RequestCollectImageOptions,
  SiteMetadataService,
  ToastType,
} from "../types";
import {
  extractImageUrlFromDragEvent,
  getElementFromTarget,
  getImageCandidateUrlsFromElement,
  getImageUrlFromElement,
  getImageUrlFromImage,
  getImageUrlFromPoint,
  normalizeImageUrl,
  uniqueImageUrls,
} from "./image-urls";

type SourceUrlResolver = (element: Element, imageUrl: string) => string | null;

interface CollectorState {
  lastImageUrl: string | null;
  lastRightClickTarget: EventTarget | Node | null;
  lastSourceUrl: string | null;
  lastCollectionPayload: CollectionPayload | null;
}

export function createCollector(siteMetadata: SiteMetadataService | null = null): Collector {
  const TOAST_CONTAINER_ID = "shiguang-toast-container";
  const TOAST_REMOVE_DELAY = 240;

  const state: CollectorState = {
    lastImageUrl: null,
    lastRightClickTarget: null,
    lastSourceUrl: null,
    lastCollectionPayload: null,
  };
  const sourceUrlResolvers: SourceUrlResolver[] = [];

  function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) {
      return container;
    }

    container = document.createElement("div");
    container.id = TOAST_CONTAINER_ID;
    container.setAttribute("aria-live", "polite");
    container.style.cssText = [
      "position: fixed",
      "top: 16px",
      "right: 16px",
      "display: flex",
      "flex-direction: column",
      "align-items: flex-end",
      "gap: 10px",
      "width: min(360px, calc(100vw - 32px))",
      "z-index: 2147483647",
      "pointer-events: none",
    ].join(";");

    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  function showToast(message: string, type: ToastType = "info", duration = 3000): void {
    const theme = {
      success: {
        border: "#16a34a",
        icon: "✓",
      },
      error: {
        border: "#dc2626",
        icon: "!",
      },
      info: {
        border: "#2563eb",
        icon: "i",
      },
    };

    const currentTheme = theme[type] || theme.info;
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.style.cssText = [
      "display: flex",
      "align-items: flex-start",
      "gap: 10px",
      "width: 100%",
      "padding: 12px 14px",
      "border-radius: 12px",
      "border: 1px solid rgba(255, 255, 255, 0.12)",
      `border-left: 4px solid ${currentTheme.border}`,
      "background: rgba(17, 24, 39, 0.94)",
      "box-shadow: 0 14px 30px rgba(15, 23, 42, 0.28)",
      "color: #f9fafb",
      'font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      "transform: translateY(-8px)",
      "opacity: 0",
      "transition: opacity 0.24s ease, transform 0.24s ease",
      "backdrop-filter: blur(10px)",
      "pointer-events: none",
    ].join(";");

    const icon = document.createElement("div");
    icon.textContent = currentTheme.icon;
    icon.style.cssText = [
      "width: 18px",
      "height: 18px",
      "border-radius: 999px",
      `background: ${currentTheme.border}`,
      "color: #fff",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "font-size: 12px",
      "font-weight: 700",
      "flex-shrink: 0",
      "margin-top: 1px",
    ].join(";");

    const content = document.createElement("div");
    content.textContent = message;
    content.style.cssText = ["flex: 1", "min-width: 0", "word-break: break-word"].join(";");

    toast.appendChild(icon);
    toast.appendChild(content);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    const removeToast = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      window.setTimeout(() => {
        toast.remove();
        if (!container.childElementCount) {
          container.remove();
        }
      }, TOAST_REMOVE_DELAY);
    };

    window.setTimeout(removeToast, duration);
  }

  function getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || "网络错误");
    if (message === "Failed to fetch") {
      return "无法连接到拾光本地服务（127.0.0.1:7845），请确保拾光应用正在运行";
    }
    return message;
  }

  async function requestCollectImage(imageUrl: string, options: RequestCollectImageOptions = {}) {
    const rememberedPayload = state.lastImageUrl === imageUrl ? state.lastCollectionPayload : null;
    const collectionPayload =
      options.collectionPayload ||
      rememberedPayload ||
      resolveCollectionPayload(options.target || state.lastRightClickTarget, imageUrl, {
        sourceUrl: options.sourceUrl,
        pageUrl: options.referer || window.location.href,
      });
    const sourceUrl = collectionPayload?.sourceUrl || options.referer || window.location.href;
    const target = options.target || state.lastRightClickTarget;
    const renderedImageDataUrl =
      options.renderedImageDataUrl ||
      getRenderedImageDataUrl(target, collectionPayload?.imageUrl || imageUrl);

    const response = await chrome.runtime.sendMessage({
      action: "collectImage",
      payload: {
        imageUrl: collectionPayload?.imageUrl || imageUrl,
        candidateUrls: buildImageCandidateUrls(target, imageUrl, collectionPayload),
        referer: options.referer || window.location.href,
        sourceUrl,
        metadata: collectionPayload?.metadata || null,
        missingImageMessage: options.missingImageMessage,
        notifyOnSuccess: options.notifyOnSuccess,
        successMessage: options.successMessage,
        folderId: options.folderId,
        targetFolderResolved: options.targetFolderResolved === true,
        renderedImageDataUrl,
      },
    });

    if (!response) {
      throw new Error("拾光采集器后台未响应");
    }

    return response;
  }

  function cleanCollectionMetadata(metadata: unknown): CollectionMetadata | null {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const value = metadata as Record<string, unknown>;
    const cleaned: CollectionMetadata = {
      title: typeof value.title === "string" ? value.title.trim() : "",
      description: typeof value.description === "string" ? value.description.trim() : "",
      author: typeof value.author === "string" ? value.author.trim() : "",
      authorUrl: typeof value.authorUrl === "string" ? value.authorUrl.trim() : null,
      provider: typeof value.provider === "string" ? value.provider.trim() : "",
      license: typeof value.license === "string" ? value.license.trim() : "",
      canonicalUrl: typeof value.canonicalUrl === "string" ? value.canonicalUrl.trim() : null,
      publishedAt: typeof value.publishedAt === "string" ? value.publishedAt.trim() : "",
      location: typeof value.location === "string" ? value.location.trim() : "",
      camera: typeof value.camera === "string" ? value.camera.trim() : "",
      width: typeof value.width === "number" && Number.isFinite(value.width) ? value.width : 0,
      height: typeof value.height === "number" && Number.isFinite(value.height) ? value.height : 0,
      tags: Array.isArray(value.tags)
        ? value.tags
            .map((tag: unknown) => (typeof tag === "string" ? tag.trim() : ""))
            .filter(Boolean)
            .slice(0, 12)
        : [],
    };

    return Object.values(cleaned).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    )
      ? cleaned
      : null;
  }

  function findRenderedImageElement(
    target: EventTarget | Node | null,
    imageUrl: string | null,
  ): HTMLImageElement | null {
    const element = getElementFromTarget(target);
    const normalizedImageUrl = normalizeImageUrl(imageUrl);

    const isUsableImage = (image: unknown): image is HTMLImageElement =>
      image instanceof HTMLImageElement &&
      image.complete &&
      (image.naturalWidth || image.width) > 0 &&
      (image.naturalHeight || image.height) > 0;

    if (isUsableImage(element)) {
      return element;
    }

    const nestedImage = element?.querySelector?.("img");
    if (isUsableImage(nestedImage)) {
      return nestedImage;
    }

    if (!normalizedImageUrl) {
      return null;
    }

    return (
      Array.from(document.images).find((image) => {
        if (!isUsableImage(image)) {
          return false;
        }

        return (
          normalizeImageUrl(image.currentSrc || image.src) === normalizedImageUrl ||
          getImageUrlFromImage(image) === normalizedImageUrl ||
          getImageUrlFromElement(image) === normalizedImageUrl
        );
      }) || null
    );
  }

  function getRenderedImageDataUrl(
    target: EventTarget | Node | null,
    imageUrl: string | null,
  ): string | null {
    const image = findRenderedImageElement(target, imageUrl);
    if (!image) {
      return null;
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return null;
    }

    if (shouldSkipRenderedPixelReuse(image)) {
      return null;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    } catch (error) {
      if (!isCanvasSecurityError(error)) {
        console.warn("Failed to reuse rendered image pixels:", error);
      }
      return null;
    }
  }

  function shouldSkipRenderedPixelReuse(image: HTMLImageElement): boolean {
    const imageUrl = normalizeImageUrl(image.currentSrc || image.src);
    if (!imageUrl) {
      return false;
    }

    try {
      return new URL(imageUrl).hostname.toLowerCase() === "i.pximg.net";
    } catch {
      return false;
    }
  }

  function isCanvasSecurityError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "SecurityError";
  }

  function buildImageCandidateUrls(
    target: EventTarget | Node | null,
    imageUrl: string,
    collectionPayload: CollectionPayload | null,
  ): string[] {
    return uniqueImageUrls([
      ...(Array.isArray(collectionPayload?.candidateUrls) ? collectionPayload.candidateUrls : []),
      collectionPayload?.imageUrl,
      ...getImageCandidateUrlsFromElement(target),
      imageUrl,
    ]);
  }

  function resolveSourceUrlFromElement(
    target: EventTarget | Node | null,
    imageUrl: string,
  ): string | null {
    const element = getElementFromTarget(target);
    if (!(element instanceof Element)) {
      return null;
    }

    for (const resolver of sourceUrlResolvers) {
      try {
        const sourceUrl = resolver(element, imageUrl);
        if (sourceUrl) {
          return normalizeImageUrl(sourceUrl);
        }
      } catch (error) {
        console.warn("Failed to resolve source URL:", error);
      }
    }

    return null;
  }

  function resolveCollectionPayload(
    target: EventTarget | Node | null,
    imageUrl: string | null | undefined,
    options: { sourceUrl?: string | null; pageUrl?: string | null } = {},
  ): CollectionPayload | null {
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    if (!normalizedImageUrl) {
      return null;
    }

    const sourceUrl = options.sourceUrl
      ? normalizeImageUrl(options.sourceUrl)
      : resolveSourceUrlFromElement(target, normalizedImageUrl) || null;
    const resolved = siteMetadata?.resolveCollectionPayload
      ? siteMetadata.resolveCollectionPayload({
          target,
          imageUrl: normalizedImageUrl,
          pageUrl: options.pageUrl || window.location.href,
          sourceUrl,
        })
      : null;

    const payload = {
      imageUrl: normalizeImageUrl(resolved?.imageUrl) || normalizedImageUrl,
      candidateUrls: uniqueImageUrls(
        resolved?.candidateUrls || [resolved?.imageUrl, normalizedImageUrl],
      ),
      sourceUrl: normalizeImageUrl(resolved?.sourceUrl) || sourceUrl || window.location.href,
      metadata: cleanCollectionMetadata(resolved?.metadata),
    };

    return payload;
  }

  function registerSourceUrlResolver(resolver: SourceUrlResolver): void {
    if (typeof resolver === "function") {
      sourceUrlResolvers.push(resolver);
    }
  }

  function setLastImageContext(
    target: EventTarget | Node | null,
    imageUrl: string | null | undefined,
    sourceUrl?: string | null,
  ): CollectionPayload | null {
    const payload = resolveCollectionPayload(target, imageUrl, {
      sourceUrl,
      pageUrl: window.location.href,
    });
    state.lastRightClickTarget = target ?? null;
    state.lastImageUrl = payload?.imageUrl || imageUrl || null;
    state.lastSourceUrl = payload?.sourceUrl || null;
    state.lastCollectionPayload = payload;
    return payload;
  }

  function getLastImageUrl() {
    return state.lastImageUrl;
  }

  function getLastSourceUrl() {
    return state.lastSourceUrl;
  }

  function getLastCollectionPayload() {
    return state.lastCollectionPayload;
  }

  function getLastRightClickTarget() {
    return state.lastRightClickTarget;
  }

  return {
    state,
    showToast,
    getErrorMessage,
    requestCollectImage,
    normalizeImageUrl,
    extractImageUrlFromDragEvent,
    getImageUrlFromElement,
    getImageUrlFromPoint,
    resolveSourceUrlFromElement,
    resolveCollectionPayload,
    registerSourceUrlResolver,
    setLastImageContext,
    getLastImageUrl,
    getLastSourceUrl,
    getLastCollectionPayload,
    getLastRightClickTarget,
    getRenderedImageDataUrl,
  };
}
