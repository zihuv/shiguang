import type { CollectionContext, CollectionMetadata, PartialCollectionMetadata } from "../types";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeUrl(url: unknown, baseUrl?: string | null): string | null {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed, baseUrl || window.location.href).href;
  } catch {
    return trimmed;
  }
}

export function sameUrl(left: unknown, right: unknown): boolean {
  return Boolean(left && right && normalizeUrl(left) === normalizeUrl(right));
}

export function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

export function uniqueStrings(values: Iterable<unknown> | null | undefined, limit = 12): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values || []) {
    const text = normalizeText(value);
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(text);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

export function mergeMetadata(
  base: PartialCollectionMetadata = {},
  extra: PartialCollectionMetadata = {},
): CollectionMetadata {
  return {
    title: normalizeText(extra.title || base.title),
    description: normalizeText(extra.description || base.description),
    author: normalizeText(extra.author || base.author),
    authorUrl: normalizeUrl(extra.authorUrl || base.authorUrl),
    provider: normalizeText(extra.provider || base.provider),
    license: normalizeText(extra.license || base.license),
    canonicalUrl: normalizeUrl(extra.canonicalUrl || base.canonicalUrl),
    publishedAt: normalizeText(extra.publishedAt || base.publishedAt),
    location: normalizeText(extra.location || base.location),
    camera: normalizeText(extra.camera || base.camera),
    width: numberValue(extra.width) || numberValue(base.width),
    height: numberValue(extra.height) || numberValue(base.height),
    tags: uniqueStrings([...(base.tags || []), ...(extra.tags || [])]),
  };
}

export function getMetaContent(selector: string): string {
  const value = document.querySelector(selector)?.getAttribute("content");
  return normalizeText(value);
}

export function cleanTitle(value: unknown): string {
  return normalizeText(
    String(value || "")
      .replace(/\s*\|\s*Unsplash.*$/i, "")
      .replace(/\s*\|\s*Pexels.*$/i, "")
      .replace(/\s*-\s*Pixabay.*$/i, "")
      .replace(/\s*\|\s*Flickr.*$/i, "")
      .replace(/\s*-\s*Wikimedia Commons.*$/i, "")
      .replace(/\s*\|\s*Behance.*$/i, "")
      .replace(/\s*-\s*Dribbble.*$/i, "")
      .replace(/\s*-\s*ArtStation.*$/i, "")
      .replace(/\s*-\s*pixiv.*$/i, ""),
  );
}

export function getCanonicalUrl(): string | null {
  return normalizeUrl(
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || window.location.href,
  );
}

export function getElement(target: EventTarget | Node | null | undefined): Element | null {
  if (!(target instanceof Node)) {
    return null;
  }
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return element instanceof Element ? element : null;
}

export function getImageElement(
  target: EventTarget | Node | null | undefined,
): HTMLImageElement | null {
  const element = getElement(target);
  if (element instanceof HTMLImageElement) {
    return element;
  }
  if (element instanceof Element) {
    return element.querySelector("img");
  }
  return null;
}

export function findClosestAnchorUrl(
  target: EventTarget | Node | null | undefined,
  predicate: (href: string) => boolean,
  baseUrl?: string | null,
): string | null {
  const element = getElement(target);
  if (!(element instanceof Element)) {
    return null;
  }

  const anchors: HTMLAnchorElement[] = [];
  const closest = element.closest("a[href]");
  if (closest instanceof HTMLAnchorElement) {
    anchors.push(closest);
  }
  anchors.push(...Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]")));

  for (const anchor of anchors) {
    const href = normalizeUrl(anchor.getAttribute("href") || anchor.href, baseUrl);
    if (href && predicate(href)) {
      return href;
    }
  }

  return null;
}

export function firstText(selectors: string[], root: ParentNode = document): string {
  for (const selector of selectors) {
    const text = normalizeText(root.querySelector(selector)?.textContent || "");
    if (text) {
      return text;
    }
  }
  return "";
}

function collectJsonLdItems(): JsonObject[] {
  const items: JsonObject[] = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      if (Array.isArray(parsed)) {
        items.push(...parsed.filter((item): item is JsonObject => Boolean(asObject(item))));
      } else if (parsed && typeof parsed === "object") {
        const parsedObject = parsed as JsonObject;
        items.push(parsedObject);
        if (Array.isArray(parsedObject["@graph"])) {
          items.push(
            ...parsedObject["@graph"].filter((item): item is JsonObject => Boolean(asObject(item))),
          );
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return items;
}

function scoreJsonLdItem(item: JsonObject, context: CollectionContext): number {
  const image = asObject(item.image);
  const urls = [item.contentUrl, item.url, item.thumbnailUrl, image?.url, item.image]
    .flat()
    .map((value) =>
      normalizeUrl(typeof value === "string" ? value : asObject(value)?.url, context.pageUrl),
    )
    .filter((url): url is string => Boolean(url));

  let score = 0;
  for (const url of urls) {
    if (context.imageUrl && sameUrl(url, context.imageUrl)) {
      score += 10;
    }
    if (context.sourceUrl && sameUrl(url, context.sourceUrl)) {
      score += 6;
    }
    if (url === normalizeUrl(window.location.href)) {
      score += 2;
    }
  }

  const typeText = String(item["@type"] || item.type || "");
  if (/imageobject|photograph|creativework/i.test(typeText)) {
    score += 3;
  }

  return score;
}

function getJsonLdMetadata(context: CollectionContext): PartialCollectionMetadata & {
  imageUrl?: string | null;
} {
  const scored = collectJsonLdItems()
    .map((item) => ({ item, score: scoreJsonLdItem(item, context) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = scored[0]?.item;
  if (!best) {
    return {};
  }

  const author = best.author;
  const authorName =
    typeof author === "string"
      ? author
      : Array.isArray(author)
        ? author.map((item) => asObject(item)?.name || asObject(item)?.alternateName).find(Boolean)
        : asObject(author)?.name || asObject(author)?.alternateName;

  const keywords = typeof best.keywords === "string" ? best.keywords.split(",") : best.keywords;
  const imageUrl = normalizeUrl(
    typeof best.contentUrl === "string"
      ? best.contentUrl
      : typeof best.url === "string"
        ? best.url
        : null,
    context.pageUrl,
  );

  return {
    imageUrl,
    title: stringValue(best.headline) || stringValue(best.name) || stringValue(best.caption),
    description: stringValue(best.description) || stringValue(best.caption),
    author: stringValue(authorName),
    authorUrl: stringValue(asObject(author)?.url),
    publishedAt: stringValue(best.datePublished) || stringValue(best.dateCreated),
    tags: Array.isArray(keywords) ? keywords : [],
  };
}

export function getGenericMetadata(context: CollectionContext): CollectionMetadata {
  const imageElement = getImageElement(context.target);
  const jsonLd = getJsonLdMetadata(context);
  const keywords = getMetaContent("meta[name='keywords']");

  return mergeMetadata(
    {
      title: imageElement?.getAttribute("alt") || "",
      width: imageElement?.naturalWidth || 0,
      height: imageElement?.naturalHeight || 0,
    },
    {
      title: jsonLd.title,
      description: jsonLd.description,
      author: jsonLd.author || getMetaContent("meta[name='author']"),
      authorUrl: jsonLd.authorUrl,
      canonicalUrl: getCanonicalUrl(),
      publishedAt: jsonLd.publishedAt,
      tags: [...(jsonLd.tags || []), ...(keywords ? keywords.split(",") : [])],
    },
  );
}
