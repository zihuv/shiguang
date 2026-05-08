(() => {
  if (globalThis.__shiguangCollectorSiteMetadata) {
    return;
  }

  function normalizeUrl(url, baseUrl) {
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

  function sameUrl(left, right) {
    return Boolean(left && right && normalizeUrl(left) === normalizeUrl(right));
  }

  function normalizeText(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/g, " ").trim();
  }

  function uniqueStrings(values, limit = 12) {
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

  function mergeMetadata(base = {}, extra = {}) {
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

  function getMetaContent(selector) {
    const value = document.querySelector(selector)?.getAttribute("content");
    return normalizeText(value);
  }

  function cleanTitle(value) {
    return normalizeText(
      String(value || "")
        .replace(/\s*\|\s*Unsplash.*$/i, "")
        .replace(/\s*\|\s*Pexels.*$/i, "")
        .replace(/\s*-\s*Pixabay.*$/i, "")
        .replace(/\s*\|\s*Flickr.*$/i, "")
        .replace(/\s*-\s*Wikimedia Commons.*$/i, ""),
    );
  }

  function getCanonicalUrl() {
    return normalizeUrl(
      document.querySelector("link[rel='canonical']")?.getAttribute("href") || window.location.href,
    );
  }

  function getImageElement(target) {
    const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (element instanceof HTMLImageElement) {
      return element;
    }
    if (element instanceof Element) {
      return element.querySelector("img");
    }
    return null;
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
    const items = collectJsonLdItems();
    const scored = items
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

  function getGenericMetadata(context) {
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

  function findClosestAnchorUrl(target, predicate) {
    const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
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
      const href = normalizeUrl(anchor.getAttribute("href") || anchor.href);
      if (href && predicate(href)) {
        return href;
      }
    }

    return null;
  }

  function parseUnsplashPhotoId(value) {
    const href = normalizeUrl(value);
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/photos\/([^/?#]+)/i);
      if (match?.[1]) {
        const parts = match[1].split("-");
        return parts[parts.length - 1] || "";
      }

      const downloadMatch = href.match(/(?:\?|&)dl=[^-]+-([A-Za-z0-9_-]+)-unsplash\./i);
      return downloadMatch?.[1] || "";
    } catch {
      return "";
    }
  }

  function parsePexelsPhotoId(value) {
    const href = normalizeUrl(value);
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href);
      const pathMatch = url.pathname.match(/\/photo\/[^/]*-(\d+)\/?$/i);
      if (pathMatch?.[1]) {
        return pathMatch[1];
      }

      const imageMatch = url.pathname.match(/\/photos\/(\d+)\//i);
      return imageMatch?.[1] || "";
    } catch {
      return "";
    }
  }

  function parsePixabayPhotoId(value) {
    const href = normalizeUrl(value);
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href);
      const match = url.pathname.match(/-(\d+)\/?$/);
      return match?.[1] || "";
    } catch {
      return "";
    }
  }

  function parseFlickrPhotoId(value) {
    const href = normalizeUrl(value);
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/photos\/[^/]+\/(\d+)/i);
      return match?.[1] || "";
    } catch {
      return "";
    }
  }

  function isUnsplashDetailUrl(url) {
    return /https?:\/\/(?:www\.)?unsplash\.com\/photos\//i.test(url || "");
  }

  function isPexelsDetailUrl(url) {
    return /https?:\/\/(?:www\.)?pexels\.com\/photo\//i.test(url || "");
  }

  function isPixabayDetailUrl(url) {
    return /https?:\/\/(?:www\.)?pixabay\.com\/[^?#]*-\d+\/?$/i.test(url || "");
  }

  function isFlickrDetailUrl(url) {
    return /https?:\/\/(?:www\.)?flickr\.com\/photos\//i.test(url || "");
  }

  function isCommonsFileUrl(url) {
    return /https?:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(url || "");
  }

  function resolveUnsplash(context, genericMetadata) {
    const sourceUrl =
      context.sourceUrl ||
      findClosestAnchorUrl(context.target, isUnsplashDetailUrl) ||
      (isUnsplashDetailUrl(context.pageUrl) ? context.pageUrl : "");

    return {
      imageUrl: context.imageUrl,
      sourceUrl: sourceUrl || context.pageUrl,
      metadata: mergeMetadata(genericMetadata, {
        provider: "Unsplash",
        canonicalUrl: sourceUrl || getCanonicalUrl(),
        author: getMetaContent("meta[name='twitter:creator']").replace(/^@/, ""),
        title: cleanTitle(getMetaContent("meta[property='og:title']") || document.title),
        description: getMetaContent("meta[property='og:description']"),
        license: "Unsplash License",
        location:
          getMetaContent("meta[name='twitter:label1']") ||
          getMetaContent("meta[property='article:location']"),
      }),
    };
  }

  function resolvePexels(context, genericMetadata) {
    const sourceUrl =
      context.sourceUrl ||
      findClosestAnchorUrl(context.target, isPexelsDetailUrl) ||
      (isPexelsDetailUrl(context.pageUrl) ? context.pageUrl : "");

    return {
      imageUrl: context.imageUrl,
      sourceUrl: sourceUrl || context.pageUrl,
      metadata: mergeMetadata(genericMetadata, {
        provider: "Pexels",
        canonicalUrl: sourceUrl || getCanonicalUrl(),
        title: cleanTitle(getMetaContent("meta[property='og:title']") || document.title),
        description: getMetaContent("meta[property='og:description']"),
        author: getMetaContent("meta[name='author']"),
        license: "Pexels License",
      }),
    };
  }

  function resolvePixabay(context, genericMetadata) {
    const sourceUrl =
      context.sourceUrl ||
      findClosestAnchorUrl(context.target, isPixabayDetailUrl) ||
      (isPixabayDetailUrl(context.pageUrl) ? context.pageUrl : "");

    const tags = [];
    const title = cleanTitle(getMetaContent("meta[property='og:title']") || document.title);
    const titleId = parsePixabayPhotoId(title);
    for (const part of title.split(/[-|]/)) {
      const text = normalizeText(part);
      if (text && text !== titleId && !/pixabay/i.test(text)) {
        tags.push(...text.split(/\s+/));
        break;
      }
    }

    return {
      imageUrl: context.imageUrl,
      sourceUrl: sourceUrl || context.pageUrl,
      metadata: mergeMetadata(genericMetadata, {
        provider: "Pixabay",
        canonicalUrl: sourceUrl || getCanonicalUrl(),
        title,
        description: getMetaContent("meta[property='og:description']"),
        author: getMetaContent("meta[name='author']"),
        license: "Pixabay Content License",
        tags,
      }),
    };
  }

  function resolveFlickr(context, genericMetadata) {
    const sourceUrl =
      context.sourceUrl ||
      findClosestAnchorUrl(context.target, isFlickrDetailUrl) ||
      (isFlickrDetailUrl(context.pageUrl) ? context.pageUrl : "");

    return {
      imageUrl: context.imageUrl,
      sourceUrl: sourceUrl || context.pageUrl,
      metadata: mergeMetadata(genericMetadata, {
        provider: "Flickr",
        canonicalUrl: sourceUrl || getCanonicalUrl(),
        title: cleanTitle(getMetaContent("meta[property='og:title']") || document.title),
        description: getMetaContent("meta[property='og:description']"),
        author: getMetaContent("meta[name='author']"),
        license: "Flickr",
      }),
    };
  }

  function resolveWikimediaCommons(context, genericMetadata) {
    const sourceUrl =
      context.sourceUrl ||
      findClosestAnchorUrl(context.target, isCommonsFileUrl) ||
      (isCommonsFileUrl(context.pageUrl) ? context.pageUrl : "");

    const license =
      normalizeText(
        document.querySelector(".licensetpl_short")?.textContent ||
          document.querySelector("#mw-imagepage-license .licensetpl")?.textContent ||
          "",
      ) || "Wikimedia Commons";

    return {
      imageUrl: context.imageUrl,
      sourceUrl: sourceUrl || context.pageUrl,
      metadata: mergeMetadata(genericMetadata, {
        provider: "Wikimedia Commons",
        canonicalUrl: sourceUrl || getCanonicalUrl(),
        title: cleanTitle(getMetaContent("meta[property='og:title']") || document.title),
        description: getMetaContent("meta[property='og:description']"),
        author: getMetaContent("meta[name='author']"),
        license,
      }),
    };
  }

  function resolveProvider(context, genericMetadata) {
    const joined = [context.pageUrl, context.sourceUrl, context.imageUrl].filter(Boolean).join(" ");
    if (/unsplash\.com|images\.unsplash\.com/i.test(joined)) {
      return resolveUnsplash(context, genericMetadata);
    }
    if (/pexels\.com|images\.pexels\.com/i.test(joined)) {
      return resolvePexels(context, genericMetadata);
    }
    if (/pixabay\.com|cdn\.pixabay\.com/i.test(joined)) {
      return resolvePixabay(context, genericMetadata);
    }
    if (/flickr\.com|staticflickr\.com|live\.staticflickr\.com/i.test(joined)) {
      return resolveFlickr(context, genericMetadata);
    }
    if (/commons\.wikimedia\.org|upload\.wikimedia\.org/i.test(joined)) {
      return resolveWikimediaCommons(context, genericMetadata);
    }

    return {
      imageUrl: context.imageUrl,
      sourceUrl: context.sourceUrl || context.pageUrl,
      metadata: genericMetadata,
    };
  }

  function resolveCollectionPayload(input) {
    const context = {
      target: input?.target ?? null,
      imageUrl: normalizeUrl(input?.imageUrl, input?.pageUrl),
      pageUrl: normalizeUrl(input?.pageUrl) || normalizeUrl(window.location.href),
      sourceUrl: normalizeUrl(input?.sourceUrl, input?.pageUrl),
    };

    const genericMetadata = getGenericMetadata(context);
    const resolved = resolveProvider(context, genericMetadata);
    const metadata = mergeMetadata(genericMetadata, resolved.metadata);

    return {
      imageUrl: normalizeUrl(resolved.imageUrl, context.pageUrl) || context.imageUrl,
      sourceUrl: normalizeUrl(resolved.sourceUrl, context.pageUrl) || context.pageUrl,
      metadata: {
        ...metadata,
        tags: uniqueStrings(metadata.tags),
      },
    };
  }

  globalThis.__shiguangCollectorSiteMetadata = {
    resolveCollectionPayload,
    internals: {
      cleanTitle,
      mergeMetadata,
      normalizeText,
      normalizeUrl,
      parseFlickrPhotoId,
      parsePexelsPhotoId,
      parsePixabayPhotoId,
      parseUnsplashPhotoId,
      uniqueStrings,
    },
  };
})();
