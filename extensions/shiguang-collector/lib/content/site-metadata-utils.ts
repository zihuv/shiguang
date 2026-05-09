export function normalizeUrl(url, baseUrl) {
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

export function sameUrl(left, right) {
  return Boolean(left && right && normalizeUrl(left) === normalizeUrl(right));
}

export function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

export function uniqueStrings(values, limit = 12) {
  const normalized = [];
  const seen = new Set();

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

export function mergeMetadata(base = {}, extra = {}) {
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
    width: Number.isFinite(extra.width) ? extra.width : base.width,
    height: Number.isFinite(extra.height) ? extra.height : base.height,
    tags: uniqueStrings([...(base.tags || []), ...(extra.tags || [])]),
  };
}

export function getMetaContent(selector) {
  const value = document.querySelector(selector)?.getAttribute("content");
  return normalizeText(value);
}

export function cleanTitle(value) {
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

export function getCanonicalUrl() {
  return normalizeUrl(
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || window.location.href,
  );
}

export function getElement(target) {
  return target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
}

export function getImageElement(target) {
  const element = getElement(target);
  if (element instanceof HTMLImageElement) {
    return element;
  }
  if (element instanceof Element) {
    return element.querySelector("img");
  }
  return null;
}

export function findClosestAnchorUrl(target, predicate, baseUrl) {
  const element = getElement(target);
  if (!(element instanceof Element)) {
    return null;
  }

  const anchors = [];
  const closest = element.closest("a[href]");
  if (closest) {
    anchors.push(closest);
  }
  anchors.push(...element.querySelectorAll("a[href]"));

  for (const anchor of anchors) {
    const href = normalizeUrl(anchor.getAttribute("href") || anchor.href, baseUrl);
    if (href && predicate(href)) {
      return href;
    }
  }

  return null;
}

export function firstText(selectors, root = document) {
  for (const selector of selectors) {
    const text = normalizeText(root.querySelector(selector)?.textContent || "");
    if (text) {
      return text;
    }
  }
  return "";
}

function collectJsonLdItems() {
  const items = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      if (Array.isArray(parsed)) {
        items.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        items.push(parsed);
        if (Array.isArray(parsed["@graph"])) {
          items.push(...parsed["@graph"]);
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return items;
}

function scoreJsonLdItem(item, context) {
  const urls = [item?.contentUrl, item?.url, item?.thumbnailUrl, item?.image?.url, item?.image]
    .flat()
    .map((value) => normalizeUrl(typeof value === "string" ? value : value?.url, context.pageUrl))
    .filter(Boolean);

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

  const typeText = String(item?.["@type"] || item?.type || "");
  if (/imageobject|photograph|creativework/i.test(typeText)) {
    score += 3;
  }

  return score;
}

function getJsonLdMetadata(context) {
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
        ? author.map((item) => item?.name || item?.alternateName).find(Boolean)
        : author?.name || author?.alternateName;

  const keywords = typeof best.keywords === "string" ? best.keywords.split(",") : best.keywords;
  const imageUrl = normalizeUrl(
    typeof best.contentUrl === "string"
      ? best.contentUrl
      : typeof best.url === "string"
        ? best.url
        : undefined,
    context.pageUrl,
  );

  return {
    imageUrl,
    title: best.headline || best.name || best.caption,
    description: best.description || best.caption,
    author: authorName,
    authorUrl: typeof author === "object" ? author?.url : "",
    publishedAt: best.datePublished || best.dateCreated,
    tags: Array.isArray(keywords) ? keywords : [],
  };
}

export function getGenericMetadata(context) {
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
      imageUrl: jsonLd.imageUrl,
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
