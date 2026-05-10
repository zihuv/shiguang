import {
  cleanTitle,
  findClosestAnchorUrl,
  firstText,
  getCanonicalUrl,
  getElement,
  getMetaContent,
  mergeMetadata,
  normalizeText,
  normalizeUrl,
  uniqueStrings,
} from "./site-metadata-utils";
import type { CollectionContext, CollectionMetadata, ResolvedCollectionPayload } from "../types";

interface ImageEnhancerRule {
  test: (url: string) => boolean;
  enhance: (url: string) => string;
}

interface ProviderResolver {
  match: (context: CollectionContext) => boolean;
  resolve: (
    context: CollectionContext,
    genericMetadata: CollectionMetadata,
  ) => ResolvedCollectionPayload;
}

function urlIncludes(value: string | null | undefined, pattern: string): boolean {
  return new RegExp(pattern, "i").test(value || "");
}

function joinedContext(context: CollectionContext): string {
  return [context.pageUrl, context.sourceUrl, context.imageUrl].filter(Boolean).join(" ");
}

function getSourceUrl(
  context: CollectionContext,
  predicate: (url: string) => boolean,
): string | null {
  return (
    context.sourceUrl ||
    findClosestAnchorUrl(context.target, predicate, context.pageUrl) ||
    (predicate(context.pageUrl) ? context.pageUrl : "")
  );
}

function getClosestText(
  target: EventTarget | Node | null,
  containerSelector: string,
  selectors: string[],
): string {
  const element = getElement(target);
  const container = element instanceof Element ? element.closest(containerSelector) : null;
  return container ? firstText(selectors, container) : "";
}

function dropSearchParams(url: string, params: string[]): string {
  const parsed = new URL(url);
  for (const param of params) {
    parsed.searchParams.delete(param);
  }
  return parsed.href;
}

function stripUrlSearch(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

export function parseUnsplashPhotoId(value: unknown): string {
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

export function parsePexelsPhotoId(value: unknown): string {
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

export function parsePixabayPhotoId(value: unknown): string {
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

export function parseFlickrPhotoId(value: unknown): string {
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

function isUnsplashDetailUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?unsplash\.com\/photos\/`);
}

function isPexelsDetailUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?pexels\.com\/photo\/`);
}

function isPixabayDetailUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?pixabay\.com\/[^?#]*-\d+\/?$`);
}

function isFlickrDetailUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?flickr\.com\/photos\/`);
}

function isCommonsFileUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/commons\.wikimedia\.org\/wiki\/File:`);
}

function isPinterestPinUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:[^/]+\.)?pinterest\.[^/]+\/pin\/`);
}

function isBehanceProjectUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:[^/]+\.)?behance\.net\/gallery\/`);
}

function isDribbbleShotUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/dribbble\.com\/shots\/`);
}

function isArtStationArtworkUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?artstation\.com\/artwork\/`);
}

function isPixivArtworkUrl(url: string): boolean {
  return urlIncludes(url, String.raw`https?:\/\/(?:www\.)?pixiv\.net\/(?:[^/]+\/)?artworks\/\d+`);
}

function parsePixivArtworkId(value: unknown): string {
  const href = normalizeUrl(value);
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/artworks\/(\d+)/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function parsePixivPageIndex(value: unknown): string {
  const href = normalizeUrl(value);
  const match = href?.match(/_p(\d+)(?:_[^/.]+)?\.[a-z0-9]+(?:[?#].*)?$/i);
  return match?.[1] || "";
}

function isXiaohongshuNoteUrl(url: string): boolean {
  return urlIncludes(
    url,
    String.raw`https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item|search_result)\/?`,
  );
}

function enhanceUnsplashUrl(imageUrl: string): string {
  return dropSearchParams(imageUrl, ["w", "h", "width", "height", "crop", "fit", "rect", "dpr"]);
}

function enhancePexelsUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  parsed.search = "";
  parsed.searchParams.set("auto", "compress");
  return parsed.href;
}

function enhancePixabayUrl(imageUrl: string): string {
  return imageUrl
    .replace(/_640(?=\.[a-z]+(?:\?|#|$))/i, "_1280")
    .replace(/_960_720(?=\.[a-z]+(?:\?|#|$))/i, "_1280");
}

function enhanceFlickrUrl(imageUrl: string): string {
  return stripUrlSearch(imageUrl).replace(/_[nmstwzc](?=\.[a-z]+$)/i, "_b");
}

function enhanceWikimediaUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  const thumbIndex = parsed.pathname.indexOf("/thumb/");
  if (thumbIndex === -1) {
    return imageUrl;
  }

  const withoutThumb = parsed.pathname.replace("/thumb/", "/");
  parsed.pathname = withoutThumb.replace(/\/[^/]+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function enhancePinterestUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  parsed.pathname = parsed.pathname
    .replace(/\/(?:75x75(?:_RS)?|170x|236x|474x|564x|736x|1200x|originals?)\//i, "/originals/")
    .replace("/enabled/", "/")
    .replace("/enabled_lo/", "/")
    .replace("/enabled_hi/", "/")
    .replace("/control/", "/");
  parsed.search = "";
  return parsed.href;
}

function enhanceBehanceUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  parsed.pathname = parsed.pathname.replace(
    /\/project_modules\/(?:disp|fs|max_\d+|hd|source|1400_opt_1)\//i,
    "/project_modules/source/",
  );
  parsed.search = "";
  return parsed.href;
}

function enhanceDribbbleUrl(imageUrl: string): string {
  return stripUrlSearch(imageUrl)
    .replace(/_teaser(?=\.[a-z]+$)/i, "")
    .replace(/_1x(?=\.[a-z]+$)/i, "")
    .replace(/_2x(?=\.[a-z]+$)/i, "")
    .replace(/_4x(?=\.[a-z]+$)/i, "");
}

function enhanceArtStationUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  parsed.pathname = parsed.pathname.replace(
    /\/(?:micro_square|smaller_square|small_square|medium|large)\//i,
    "/large/",
  );
  parsed.search = "";
  return parsed.href;
}

function enhancePixivUrl(imageUrl: string): string {
  const parsed = new URL(imageUrl);
  parsed.pathname = parsed.pathname
    .replace(/\/c\/\d+x\d+(?:_\d+)?(?:_[A-Za-z0-9]{2})?\//, "/")
    .replace("/img-master/", "/img-original/")
    .replace("/custom-thumb/", "/img-original/")
    .replace(/_(?:master|square|custom)1200(?=\.[a-z]+$)/i, "");
  parsed.search = "";
  return parsed.href;
}

function enhanceXiaohongshuUrl(imageUrl: string): string {
  return imageUrl
    .replace(
      /:\/\/[^/]+(\.xhscdn\.com\/+)[0-9]+\/+[0-9a-f]{10,}\/+([^?#!]+)(?:[?#!].*)?$/i,
      "://sns-img-al$1$2",
    )
    .split("!")[0];
}

function maybeEnhanceImageUrl(imageUrl: string, rules: ImageEnhancerRule[]): string {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  for (const rule of rules) {
    try {
      if (rule.test(imageUrl)) {
        return normalizeUrl(rule.enhance(imageUrl)) || imageUrl;
      }
    } catch {
      return imageUrl;
    }
  }

  return imageUrl;
}

function safeEnhanceImageUrl(imageUrl: string, enhance: (url: string) => string): string {
  return maybeEnhanceImageUrl(imageUrl, [{ test: () => true, enhance }]);
}

const imageEnhancers: ImageEnhancerRule[] = [
  { test: (url) => /images\.unsplash\.com/i.test(url), enhance: enhanceUnsplashUrl },
  { test: (url) => /images\.pexels\.com/i.test(url), enhance: enhancePexelsUrl },
  { test: (url) => /cdn\.pixabay\.com/i.test(url), enhance: enhancePixabayUrl },
  {
    test: (url) => /staticflickr\.com|live\.staticflickr\.com/i.test(url),
    enhance: enhanceFlickrUrl,
  },
  { test: (url) => /upload\.wikimedia\.org/i.test(url), enhance: enhanceWikimediaUrl },
  { test: (url) => /pinimg\.com/i.test(url), enhance: enhancePinterestUrl },
  { test: (url) => /behance\.net/i.test(url), enhance: enhanceBehanceUrl },
  { test: (url) => /dribbble\.com/i.test(url), enhance: enhanceDribbbleUrl },
  { test: (url) => /artstation\.com/i.test(url), enhance: enhanceArtStationUrl },
  { test: (url) => /i\.pximg\.net/i.test(url), enhance: enhancePixivUrl },
  { test: (url) => /xhscdn\.com/i.test(url), enhance: enhanceXiaohongshuUrl },
];

function resolveUnsplash(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isUnsplashDetailUrl);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceUnsplashUrl),
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

function resolvePexels(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isPexelsDetailUrl);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhancePexelsUrl),
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

function resolvePixabay(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isPixabayDetailUrl);
  const tags: string[] = [];
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
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhancePixabayUrl),
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

function resolveFlickr(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isFlickrDetailUrl);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceFlickrUrl),
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

function resolveWikimediaCommons(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isCommonsFileUrl);
  const license =
    normalizeText(
      document.querySelector(".licensetpl_short")?.textContent ||
        document.querySelector("#mw-imagepage-license .licensetpl")?.textContent ||
        "",
    ) || "Wikimedia Commons";

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceWikimediaUrl),
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

function resolvePinterest(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isPinterestPinUrl);
  const title =
    getClosestText(context.target, "[data-grid-item], [data-test-id*='pin'], article", [
      "[data-test-id='closeup-title']",
      "[data-test-id='pinrep-title']",
      "h1",
      "h2",
    ]) || cleanTitle(getMetaContent("meta[property='og:title']") || document.title);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhancePinterestUrl),
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "Pinterest",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title,
      description: getMetaContent("meta[property='og:description']"),
    }),
  };
}

function resolveBehance(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isBehanceProjectUrl);
  const title =
    firstText([
      'figcaption[class^="Project-caption"] span[class^="Project-title"]',
      "h1",
      "[data-testid='project-title']",
    ]) || cleanTitle(getMetaContent("meta[property='og:title']") || document.title);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceBehanceUrl),
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "Behance",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title,
      description: getMetaContent("meta[property='og:description']"),
      author:
        firstText(["[data-testid='owner-name']", ".Project-ownerName", ".OwnerInfo-name"]) ||
        getMetaContent("meta[name='author']"),
    }),
  };
}

function resolveDribbble(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isDribbbleShotUrl);
  const title =
    getClosestText(context.target, "[data-thumbnail-id], article, main", [
      ".shot-thumbnail-title",
      ".shot-title",
      "h1",
    ]) || cleanTitle(getMetaContent("meta[property='og:title']") || document.title);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceDribbbleUrl),
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "Dribbble",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title,
      description: getMetaContent("meta[property='og:description']"),
      author: firstText([".shot-user-name", ".profile-name", "a[rel='author']"]),
    }),
  };
}

function resolveArtStation(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isArtStationArtworkUrl);

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceArtStationUrl),
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "ArtStation",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title: cleanTitle(
        firstText(["h1", ".artwork-title"]) || getMetaContent("meta[property='og:title']"),
      ),
      description: getMetaContent("meta[property='og:description']"),
      author: firstText([".user-name", ".artist-name", "a[href*='/users/']"]),
      tags: Array.from(document.querySelectorAll("a[href*='/search?sort_by=relevance&query=']"))
        .map((item) => item.textContent)
        .filter(Boolean),
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePixivValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return normalizeText(value);
}

function getPixivPreloadAuthor(sourceUrl: string | null): { author: string; authorUrl: string } {
  const artworkId = parsePixivArtworkId(sourceUrl);
  const preloadContent =
    document.querySelector<HTMLMetaElement>("meta#meta-preload-data")?.content || "";
  if (!artworkId || !preloadContent) {
    return { author: "", authorUrl: "" };
  }

  try {
    const preload = asRecord(JSON.parse(preloadContent));
    const illusts = asRecord(preload?.illust);
    const illust = asRecord(illusts?.[artworkId]);
    const user = asRecord(illust?.user);
    const userId =
      normalizePixivValue(illust?.userId) ||
      normalizePixivValue(illust?.user_id) ||
      normalizePixivValue(user?.id) ||
      normalizePixivValue(user?.userId);
    const author =
      normalizePixivValue(illust?.userName) ||
      normalizePixivValue(illust?.user_name) ||
      normalizePixivValue(user?.name);

    return {
      author,
      authorUrl: userId ? `https://www.pixiv.net/users/${userId}` : "",
    };
  } catch {
    return { author: "", authorUrl: "" };
  }
}

function getPixivPreloadIllust(sourceUrl: string | null): Record<string, unknown> | null {
  const artworkId = parsePixivArtworkId(sourceUrl);
  const preloadContent =
    document.querySelector<HTMLMetaElement>("meta#meta-preload-data")?.content || "";
  if (!artworkId || !preloadContent) {
    return null;
  }

  try {
    const preload = asRecord(JSON.parse(preloadContent));
    const illusts = asRecord(preload?.illust);
    return asRecord(illusts?.[artworkId]);
  } catch {
    return null;
  }
}

function getPixivPreloadImageUrls(context: CollectionContext, sourceUrl: string | null): string[] {
  const illust = getPixivPreloadIllust(sourceUrl);
  const urls = asRecord(illust?.urls);
  if (!urls) {
    return [];
  }

  const pageIndex = parsePixivPageIndex(context.imageUrl);
  return [urls.original, urls.regular, urls.small, urls.thumb, urls.mini]
    .map((url) => normalizeUrl(url, context.pageUrl))
    .filter((url): url is string => Boolean(url))
    .map((url) => {
      if (!pageIndex) {
        return url;
      }
      return url.replace(/_p\d+(?=\.[a-z0-9]+(?:[?#]|$))/i, `_p${pageIndex}`);
    });
}

function getPixivOriginalExtensionCandidates(imageUrl: string): string[] {
  const enhancedUrl = safeEnhanceImageUrl(imageUrl, enhancePixivUrl);
  const match = enhancedUrl.match(/^(.*_p\d+)\.([a-z0-9]+)([?#].*)?$/i);
  if (!match || !/\/img-original\//i.test(enhancedUrl)) {
    return [enhancedUrl];
  }

  const [, base, extension, suffix = ""] = match;
  return [extension, "jpg", "png", "jpeg"]
    .map((item) => item.toLowerCase())
    .filter((item, index, values) => values.indexOf(item) === index)
    .map((item) => `${base}.${item}${suffix}`);
}

function getPixivAuthorText(anchor: HTMLAnchorElement): string {
  const titledElement = Array.from(anchor.querySelectorAll<HTMLElement>("[title]"))
    .map((item) => normalizeText(item.getAttribute("title")))
    .find(Boolean);
  return titledElement || normalizeText(anchor.textContent || anchor.getAttribute("title") || "");
}

function getPixivDomAuthor(context: CollectionContext): { author: string; authorUrl: string } {
  const candidates = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/users/']"))
    .map((anchor) => {
      const href = normalizeUrl(anchor.getAttribute("href") || anchor.href, context.pageUrl) || "";
      const author = getPixivAuthorText(anchor);
      if (!author || !/\/users\/\d+/i.test(href)) {
        return null;
      }

      if (anchor.closest("header, nav, [role='banner']")) {
        return null;
      }

      let score = 0;
      if (anchor.closest("aside")) {
        score += 40;
      }
      if (anchor.closest("main, article")) {
        score += 25;
      }
      if (anchor.querySelector("[title]")) {
        score += 10;
      }

      const targetElement = getElement(context.target);
      const targetContainer =
        targetElement?.closest("article, section, figure, li, [role='listitem']") || null;
      if (targetContainer?.contains(anchor)) {
        score += 30;
      }

      return { author, authorUrl: href, score };
    })
    .filter((item): item is { author: string; authorUrl: string; score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  return best ? { author: best.author, authorUrl: best.authorUrl } : { author: "", authorUrl: "" };
}

function resolvePixiv(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isPixivArtworkUrl);
  const title = cleanTitle(firstText(["h1", "figcaption", "main h2"]) || document.title);
  const preloadAuthor = getPixivPreloadAuthor(sourceUrl);
  const domAuthor = preloadAuthor.author ? preloadAuthor : getPixivDomAuthor(context);
  const candidateUrls = uniqueStrings([
    ...getPixivPreloadImageUrls(context, sourceUrl),
    ...getPixivOriginalExtensionCandidates(context.imageUrl),
  ]);

  return {
    imageUrl: candidateUrls[0] || safeEnhanceImageUrl(context.imageUrl, enhancePixivUrl),
    candidateUrls,
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "pixiv",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title,
      description: getMetaContent("meta[property='og:description']"),
      author: domAuthor.author,
      authorUrl: domAuthor.authorUrl,
      tags: Array.from(document.querySelectorAll("a[href*='/tags/']"))
        .map((item) => item.textContent)
        .filter(Boolean),
    }),
  };
}

function resolveXiaohongshu(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  const sourceUrl = getSourceUrl(context, isXiaohongshuNoteUrl);
  const title =
    getClosestText(context.target, "section.note-item, article, [class*='note-container']", [
      "a.title",
      ".title",
      ".desc",
    ]) || cleanTitle(getMetaContent("meta[property='og:title']") || document.title);
  const author = getClosestText(
    context.target,
    "section.note-item, article, [class*='note-container']",
    ["a.author", "a.name", ".author", ".name"],
  );

  return {
    imageUrl: safeEnhanceImageUrl(context.imageUrl, enhanceXiaohongshuUrl),
    sourceUrl: sourceUrl || context.pageUrl,
    metadata: mergeMetadata(genericMetadata, {
      provider: "小红书",
      canonicalUrl: sourceUrl || getCanonicalUrl(),
      title,
      description: getMetaContent("meta[property='og:description']"),
      author,
    }),
  };
}

const providerResolvers: ProviderResolver[] = [
  {
    match: (context) => /unsplash\.com|images\.unsplash\.com/i.test(joinedContext(context)),
    resolve: resolveUnsplash,
  },
  {
    match: (context) => /pexels\.com|images\.pexels\.com/i.test(joinedContext(context)),
    resolve: resolvePexels,
  },
  {
    match: (context) => /pixabay\.com|cdn\.pixabay\.com/i.test(joinedContext(context)),
    resolve: resolvePixabay,
  },
  {
    match: (context) =>
      /flickr\.com|staticflickr\.com|live\.staticflickr\.com/i.test(joinedContext(context)),
    resolve: resolveFlickr,
  },
  {
    match: (context) =>
      /commons\.wikimedia\.org|upload\.wikimedia\.org/i.test(joinedContext(context)),
    resolve: resolveWikimediaCommons,
  },
  {
    match: (context) => /pinterest\.[^/ ]+|pinimg\.com/i.test(joinedContext(context)),
    resolve: resolvePinterest,
  },
  {
    match: (context) => /behance\.net/i.test(joinedContext(context)),
    resolve: resolveBehance,
  },
  {
    match: (context) => /dribbble\.com/i.test(joinedContext(context)),
    resolve: resolveDribbble,
  },
  {
    match: (context) => /artstation\.com/i.test(joinedContext(context)),
    resolve: resolveArtStation,
  },
  {
    match: (context) => /pixiv\.net|pximg\.net/i.test(joinedContext(context)),
    resolve: resolvePixiv,
  },
  {
    match: (context) => /xiaohongshu\.com|xhscdn\.com/i.test(joinedContext(context)),
    resolve: resolveXiaohongshu,
  },
];

export function resolveProvider(
  context: CollectionContext,
  genericMetadata: CollectionMetadata,
): ResolvedCollectionPayload {
  for (const resolver of providerResolvers) {
    if (resolver.match(context)) {
      return resolver.resolve(context, genericMetadata);
    }
  }

  return {
    imageUrl: maybeEnhanceImageUrl(context.imageUrl, imageEnhancers),
    sourceUrl: context.sourceUrl || context.pageUrl,
    metadata: genericMetadata,
  };
}

export const internals = {
  enhanceArtStationUrl,
  enhanceBehanceUrl,
  enhanceDribbbleUrl,
  enhanceFlickrUrl,
  enhancePexelsUrl,
  enhancePinterestUrl,
  enhancePixabayUrl,
  enhancePixivUrl,
  enhanceUnsplashUrl,
  enhanceWikimediaUrl,
  enhanceXiaohongshuUrl,
  isArtStationArtworkUrl,
  isBehanceProjectUrl,
  isDribbbleShotUrl,
  isPinterestPinUrl,
  parsePixivArtworkId,
  isPixivArtworkUrl,
  parseFlickrPhotoId,
  parsePexelsPhotoId,
  parsePixabayPhotoId,
  parseUnsplashPhotoId,
};
