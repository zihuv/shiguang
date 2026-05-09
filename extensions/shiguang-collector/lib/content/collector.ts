// Content Script Shared Utilities

export function createCollector(siteMetadata = null) {
  const TOAST_CONTAINER_ID = "shiguang-toast-container";
  const TOAST_REMOVE_DELAY = 240;

  const state = {
    lastImageUrl: null,
    lastRightClickTarget: null,
    lastSourceUrl: null,
    lastCollectionPayload: null,
  };
  const downloadFrames = new Map();
  const sourceUrlResolvers = [];

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

  function showToast(message, type = "info", duration = 3000) {
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

  function getErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error || "网络错误");
    if (message === "Failed to fetch") {
      return "无法连接到拾光本地服务（127.0.0.1:7845），请确保拾光应用正在运行";
    }
    return message;
  }

  async function requestCollectImage(imageUrl, options = {}) {
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

  function cleanCollectionMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const cleaned = {
      title: typeof metadata.title === "string" ? metadata.title.trim() : "",
      description: typeof metadata.description === "string" ? metadata.description.trim() : "",
      author: typeof metadata.author === "string" ? metadata.author.trim() : "",
      authorUrl: typeof metadata.authorUrl === "string" ? metadata.authorUrl.trim() : "",
      provider: typeof metadata.provider === "string" ? metadata.provider.trim() : "",
      license: typeof metadata.license === "string" ? metadata.license.trim() : "",
      canonicalUrl: typeof metadata.canonicalUrl === "string" ? metadata.canonicalUrl.trim() : "",
      publishedAt: typeof metadata.publishedAt === "string" ? metadata.publishedAt.trim() : "",
      location: typeof metadata.location === "string" ? metadata.location.trim() : "",
      camera: typeof metadata.camera === "string" ? metadata.camera.trim() : "",
      width: Number.isFinite(metadata.width) ? metadata.width : 0,
      height: Number.isFinite(metadata.height) ? metadata.height : 0,
      tags: Array.isArray(metadata.tags)
        ? metadata.tags
            .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
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

  function normalizeImageUrl(url) {
    if (typeof url !== "string") {
      return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return new URL(trimmed, window.location.href).href;
    } catch {
      return trimmed;
    }
  }

  function uniqueUrls(urls) {
    const seen = new Set();
    const unique = [];
    for (const url of urls) {
      const normalized = normalizeImageUrl(url);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      unique.push(normalized);
    }
    return unique;
  }

  function extractImageUrlFromDragEvent(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return null;
    }

    const uriList = dataTransfer.getData("text/uri-list");
    if (uriList) {
      const uriCandidate = uriList
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"));

      if (uriCandidate) {
        return normalizeImageUrl(uriCandidate);
      }
    }

    const html = dataTransfer.getData("text/html");
    if (html) {
      const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (srcMatch?.[1]) {
        return normalizeImageUrl(srcMatch[1]);
      }
    }

    const plainText = dataTransfer.getData("text/plain").trim();
    if (/^(https?:)?\/\//i.test(plainText)) {
      return normalizeImageUrl(plainText);
    }

    return null;
  }

  function findRenderedImageElement(target, imageUrl) {
    const element = getElementFromTarget(target);
    const normalizedImageUrl = normalizeImageUrl(imageUrl);

    const isUsableImage = (image) =>
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

  function getRenderedImageDataUrl(target, imageUrl) {
    const image = findRenderedImageElement(target, imageUrl);
    if (!image) {
      return null;
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
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
      console.warn("Failed to reuse rendered image pixels:", error);
      return null;
    }
  }

  function getElementFromTarget(target) {
    return target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  }

  const IMAGE_DATA_ATTRIBUTES = [
    "full",
    "fullSize",
    "large",
    "original",
    "originalSrc",
    "src",
    "lazy",
    "pinMedia",
    "image",
    "url",
  ];

  function parseSrcset(srcset) {
    if (typeof srcset !== "string" || !srcset.trim()) {
      return null;
    }

    const candidates = srcset
      .split(",")
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts[1] || "";
        const width = descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
        const density = descriptor.endsWith("x") ? Number.parseFloat(descriptor) : 0;
        return {
          url,
          score: Number.isFinite(width) && width > 0 ? width : density * 1000,
        };
      })
      .filter((candidate) => candidate.url);

    if (!candidates.length) {
      return null;
    }

    candidates.sort((left, right) => right.score - left.score);
    return normalizeImageUrl(candidates[0].url);
  }

  function getDataImageUrl(element) {
    for (const attribute of IMAGE_DATA_ATTRIBUTES) {
      const value = element.dataset?.[attribute];
      const normalized = normalizeImageUrl(value);
      if (normalized) {
        return normalized;
      }
    }

    const dataSrcset = parseSrcset(element.dataset?.srcset);
    if (dataSrcset) {
      return dataSrcset;
    }

    return null;
  }

  function getPictureSourceUrl(element) {
    const picture = element.closest?.("picture") || element.querySelector?.("picture");
    const sources = picture ? Array.from(picture.querySelectorAll("source[srcset]")) : [];

    for (const source of sources) {
      const sourceUrl = parseSrcset(source.getAttribute("srcset"));
      if (sourceUrl) {
        return sourceUrl;
      }
    }

    return null;
  }

  function getImageUrlFromImage(img) {
    return (
      getDataImageUrl(img) ||
      getPictureSourceUrl(img) ||
      parseSrcset(img.getAttribute("srcset")) ||
      normalizeImageUrl(img.currentSrc || img.src)
    );
  }

  function getImageCandidateUrlsFromElement(target) {
    const element = getElementFromTarget(target);
    if (!(element instanceof Element)) {
      return [];
    }

    const urls = [];
    const images =
      element instanceof HTMLImageElement
        ? [element]
        : Array.from(element.querySelectorAll?.("img") || []);
    for (const image of images) {
      urls.push(getDataImageUrl(image));
      urls.push(getPictureSourceUrl(image));
      urls.push(parseSrcset(image.getAttribute("srcset")));
      urls.push(image.currentSrc || image.src);
    }

    urls.push(getImageUrlFromBackground(element));
    urls.push(getImageUrlFromBackground(element, "::before"));
    urls.push(getImageUrlFromBackground(element, "::after"));
    return uniqueUrls(urls);
  }

  function buildImageCandidateUrls(target, imageUrl, collectionPayload) {
    return uniqueUrls([
      ...(Array.isArray(collectionPayload?.candidateUrls) ? collectionPayload.candidateUrls : []),
      collectionPayload?.imageUrl,
      ...getImageCandidateUrlsFromElement(target),
      imageUrl,
    ]);
  }

  function getImageUrlFromBackground(element, pseudoElement) {
    const style = window.getComputedStyle(element, pseudoElement);
    const bgImage = style.backgroundImage;
    if (!bgImage || bgImage === "none") {
      return null;
    }

    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    return urlMatch ? normalizeImageUrl(urlMatch[1]) : null;
  }

  function getImageUrlFromSingleElement(element) {
    if (element.tagName === "IMG") {
      return getImageUrlFromImage(element);
    }

    const dataImageUrl = getDataImageUrl(element);
    if (dataImageUrl) {
      return dataImageUrl;
    }

    const pictureSourceUrl = getPictureSourceUrl(element);
    if (pictureSourceUrl) {
      return pictureSourceUrl;
    }

    const backgroundUrl =
      getImageUrlFromBackground(element) ||
      getImageUrlFromBackground(element, "::before") ||
      getImageUrlFromBackground(element, "::after");
    if (backgroundUrl) {
      return backgroundUrl;
    }

    const img = element.querySelector("img");
    return img ? getImageUrlFromImage(img) : null;
  }

  function getImageUrlFromElement(target) {
    const element = getElementFromTarget(target);
    if (!(element instanceof Element)) {
      return null;
    }

    let current = element;
    while (current && current !== document.body) {
      const imageUrl = getImageUrlFromSingleElement(current);
      if (imageUrl) {
        return imageUrl;
      }

      current = current.parentElement;
    }

    return null;
  }

  function getImageUrlFromPoint(x, y) {
    if (typeof document.elementsFromPoint !== "function") {
      return null;
    }

    const elements = document.elementsFromPoint(x, y);
    for (const element of elements) {
      const imageUrl = getImageUrlFromElement(element);
      if (imageUrl) {
        return imageUrl;
      }
    }

    return null;
  }

  function resolveSourceUrlFromElement(target, imageUrl) {
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

  function resolveCollectionPayload(target, imageUrl, options = {}) {
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
      candidateUrls: uniqueUrls(
        resolved?.candidateUrls || [resolved?.imageUrl, normalizedImageUrl],
      ),
      sourceUrl: normalizeImageUrl(resolved?.sourceUrl) || sourceUrl || window.location.href,
      metadata: cleanCollectionMetadata(resolved?.metadata),
    };

    return payload;
  }

  function registerSourceUrlResolver(resolver) {
    if (typeof resolver === "function") {
      sourceUrlResolvers.push(resolver);
    }
  }

  function setLastImageContext(target, imageUrl, sourceUrl) {
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

  function createDownloadFrame(token, imageUrl) {
    if (!token || !imageUrl) {
      return { success: false, error: "缺少下载 frame 参数" };
    }

    removeDownloadFrame(token);

    const frame = document.createElement("iframe");
    frame.dataset.shiguangDownloadFrame = token;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText = [
      "position: fixed",
      "left: -10000px",
      "top: -10000px",
      "width: 8px",
      "height: 8px",
      "opacity: 0",
      "pointer-events: none",
      "border: 0",
    ].join(";");
    frame.src = imageUrl;
    (document.body || document.documentElement).appendChild(frame);
    downloadFrames.set(token, frame);

    return { success: true };
  }

  function removeDownloadFrame(token) {
    if (!token) {
      return;
    }

    const existing = downloadFrames.get(token);
    if (existing) {
      existing.remove();
      downloadFrames.delete(token);
      return;
    }

    document.querySelector(`iframe[data-shiguang-download-frame="${CSS.escape(token)}"]`)?.remove();
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
    createDownloadFrame,
    removeDownloadFrame,
  };
}
