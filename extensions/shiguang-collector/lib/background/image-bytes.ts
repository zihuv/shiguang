import { getErrorMessage } from "./shiguang-api";

export interface FetchImageResult {
  bytes: ArrayBuffer;
  contentType: string;
  finalUrl: string;
}

export interface ImageBytesTask {
  tabId?: number;
  imageUrl: string;
  candidateUrls?: string[];
  renderedImageDataUrl?: string | null;
}

interface ResolveImageBytesDependencies {
  sendMessageToTab(
    tabId: number | undefined,
    message: { action?: string; payload?: unknown },
  ): Promise<boolean>;
}

const FRAME_FETCH_TIMEOUT_MS = 30_000;

function isPixivImageUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === "i.pximg.net";
  } catch {
    return false;
  }
}

export function buildImageFetchInit(): RequestInit {
  return {
    cache: "force-cache",
    credentials: "include",
  };
}

export function shouldUseFrameImageFetch(imageUrl: string): boolean {
  return isPixivImageUrl(imageUrl);
}

export function isImageNotFoundError(error: unknown): boolean {
  return error instanceof Error && /^HTTP 404(?:\s|$)/.test(error.message);
}

export function extensionFromContentType(contentType: unknown): string {
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

export function filenameFromImageUrl(imageUrl: string, contentType: string): string {
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
  const response = await fetch(imageUrl, buildImageFetchInit());

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
  }

  const contentType = response.headers.get("content-type") || "";
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) {
    throw new Error("图片数据为空");
  }

  return {
    bytes,
    contentType,
    finalUrl: response.url || imageUrl,
  };
}

async function fetchImageBytesViaFrame(
  tabId: number | undefined,
  imageUrl: string,
  deps: ResolveImageBytesDependencies,
): Promise<FetchImageResult> {
  if (!tabId) {
    throw new Error("当前标签页不可用，无法使用嵌入页面取图");
  }

  const frameKey = `shiguang-frame-fetch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let frameCreated = false;

  const removeFrame = async () => {
    if (!frameCreated) {
      return;
    }
    await deps.sendMessageToTab(tabId, {
      action: "removeImageFetchFrame",
      payload: { id: frameKey },
    });
  };

  const frameId = await new Promise<number>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      chrome.webNavigation.onCommitted.removeListener(handleCommitted);
      chrome.webNavigation.onErrorOccurred.removeListener(handleError);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const matchesFrameNavigation = (
      details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
    ) => details.tabId === tabId && details.frameId !== 0 && details.url === imageUrl;

    const handleCommitted = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
      if (matchesFrameNavigation(details)) {
        finish(() => resolve(details.frameId));
      }
    };

    const handleError = (details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails) => {
      if (matchesFrameNavigation(details)) {
        finish(() => reject(new Error(details.error || "嵌入页面加载图片失败")));
      }
    };

    timeout = setTimeout(() => {
      finish(() => reject(new Error("嵌入页面取图超时")));
    }, FRAME_FETCH_TIMEOUT_MS);

    chrome.webNavigation.onCommitted.addListener(handleCommitted);
    chrome.webNavigation.onErrorOccurred.addListener(handleError);

    deps
      .sendMessageToTab(tabId, {
        action: "createImageFetchFrame",
        payload: { id: frameKey, url: imageUrl },
      })
      .then((created) => {
        frameCreated = created;
        if (!created) {
          finish(() => reject(new Error("无法创建嵌入页面取图容器")));
        }
      })
      .catch((error) => {
        finish(() => reject(error));
      });
  });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
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
      throw new Error("嵌入页面未返回图片数据");
    }

    const parsed = dataUrlToFetchResult(result.dataUrl);
    return {
      ...parsed,
      contentType: result.contentType || parsed.contentType,
      finalUrl: result.finalUrl || imageUrl,
    };
  } finally {
    await removeFrame();
  }
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
  deps: ResolveImageBytesDependencies,
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
    if (shouldUseFrameImageFetch(imageUrl)) {
      if (isImageNotFoundError(browserFetchError)) {
        throw browserFetchError;
      }

      try {
        return await fetchImageBytesViaFrame(tabId, imageUrl, deps);
      } catch (frameFetchError) {
        throw new Error(
          `浏览器侧取图失败：${getErrorMessage(browserFetchError)}；嵌入页面取图失败：${getErrorMessage(frameFetchError)}`,
        );
      }
    }

    throw browserFetchError;
  }
}

export async function resolveImageBytes(
  task: ImageBytesTask,
  deps: ResolveImageBytesDependencies,
): Promise<FetchImageResult> {
  const candidateUrls = uniqueImportUrls([
    ...(Array.isArray(task.candidateUrls) ? task.candidateUrls : []),
    task.imageUrl,
  ]);
  const errors: string[] = [];

  for (const candidateUrl of candidateUrls) {
    try {
      return await resolveImageBytesFromUrl(candidateUrl, task.tabId, deps);
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
