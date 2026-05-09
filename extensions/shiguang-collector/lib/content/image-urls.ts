interface SrcsetCandidate {
  url: string;
  score: number;
}

export const IMAGE_DATA_ATTRIBUTES = [
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

export function getElementFromTarget(
  target: EventTarget | Node | null | undefined,
): Element | null {
  if (!(target instanceof Node)) {
    return null;
  }
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return element instanceof Element ? element : null;
}

export function normalizeImageUrl(url: unknown, baseUrl = window.location.href): string | null {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

export function uniqueImageUrls(urls: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
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

export function parseSrcset(srcset: string | null | undefined): string | null {
  if (typeof srcset !== "string" || !srcset.trim()) {
    return null;
  }

  const candidates = srcset
    .split(",")
    .map((candidate): SrcsetCandidate => {
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
  return normalizeImageUrl(candidates[0]?.url);
}

export function getDataImageUrl(element: Element): string | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  for (const attribute of IMAGE_DATA_ATTRIBUTES) {
    const normalized = normalizeImageUrl(element.dataset?.[attribute]);
    if (normalized) {
      return normalized;
    }
  }

  return parseSrcset(element.dataset?.srcset);
}

export function getPictureSourceUrl(element: Element): string | null {
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

export function getImageUrlFromBackground(element: Element, pseudoElement?: string): string | null {
  const style = window.getComputedStyle(element, pseudoElement);
  const bgImage = style.backgroundImage;
  if (!bgImage || bgImage === "none") {
    return null;
  }

  const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
  return urlMatch ? normalizeImageUrl(urlMatch[1]) : null;
}

export function getImageUrlFromImage(img: HTMLImageElement): string | null {
  return (
    getDataImageUrl(img) ||
    getPictureSourceUrl(img) ||
    parseSrcset(img.getAttribute("srcset")) ||
    normalizeImageUrl(img.currentSrc || img.src)
  );
}

function getImageUrlFromSingleElement(element: Element): string | null {
  if (element instanceof HTMLImageElement) {
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

export function getImageUrlFromElement(target: EventTarget | Node | null): string | null {
  const element = getElementFromTarget(target);
  if (!(element instanceof Element)) {
    return null;
  }

  let current: Element | null = element;
  while (current && current !== document.body) {
    const imageUrl = getImageUrlFromSingleElement(current);
    if (imageUrl) {
      return imageUrl;
    }

    current = current.parentElement;
  }

  return null;
}

export function getImageCandidateUrlsFromElement(target: EventTarget | Node | null): string[] {
  const element = getElementFromTarget(target);
  if (!(element instanceof Element)) {
    return [];
  }

  const urls: Array<string | null> = [];
  const images =
    element instanceof HTMLImageElement
      ? [element]
      : Array.from(element.querySelectorAll<HTMLImageElement>("img"));
  for (const image of images) {
    urls.push(getDataImageUrl(image));
    urls.push(getPictureSourceUrl(image));
    urls.push(parseSrcset(image.getAttribute("srcset")));
    urls.push(image.currentSrc || image.src);
  }

  urls.push(getImageUrlFromBackground(element));
  urls.push(getImageUrlFromBackground(element, "::before"));
  urls.push(getImageUrlFromBackground(element, "::after"));
  return uniqueImageUrls(urls);
}

export function getImageUrlFromPoint(x: number, y: number): string | null {
  if (typeof document.elementsFromPoint !== "function") {
    return null;
  }

  for (const element of document.elementsFromPoint(x, y)) {
    const imageUrl = getImageUrlFromElement(element);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

export function extractImageUrlFromDragEvent(event: DragEvent): string | null {
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
