// Xiaohongshu Site Integration

import type { Collector } from "../types";

let initialized = false;

export function initXiaohongshu(collector: Collector): void {
  if (!window.location.hostname.includes("xiaohongshu.com")) {
    return;
  }

  if (initialized) {
    return;
  }
  initialized = true;

  const NOTE_LINK_SELECTORS = [
    "a.cover[href]",
    "a[href^='/explore/']",
    "a[href*='xiaohongshu.com/explore/']",
    "a[href^='/discovery/item/']",
    "a[href*='xiaohongshu.com/discovery/item/']",
    "a[href^='/search_result/']",
    "a[href*='xiaohongshu.com/search_result/']",
  ];

  function normalizeXiaohongshuSourceUrl(href: unknown): string | null {
    if (typeof href !== "string" || !href.trim()) {
      return null;
    }

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return null;
    }

    if (!url.hostname.includes("xiaohongshu.com")) {
      return null;
    }

    if (["/explore", "/discovery/item", "/search_result"].includes(url.pathname)) {
      return url.href;
    }

    if (
      url.pathname.startsWith("/explore/") ||
      url.pathname.startsWith("/discovery/item/") ||
      url.pathname.startsWith("/search_result/")
    ) {
      return url.href;
    }

    return null;
  }

  function getSourceUrlFromLink(link: Element | null): string | null {
    if (!(link instanceof HTMLAnchorElement)) {
      return null;
    }

    return normalizeXiaohongshuSourceUrl(link.getAttribute("href") || link.href);
  }

  function findNoteSourceUrl(target: EventTarget | Node | null): string | null {
    const element =
      target instanceof Node && target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (!(element instanceof Element)) {
      return normalizeXiaohongshuSourceUrl(window.location.href);
    }

    const closestLink = element.closest("a[href]");
    const closestSourceUrl = getSourceUrlFromLink(closestLink);
    if (closestSourceUrl) {
      return closestSourceUrl;
    }

    const noteContainer = element.closest(
      "section.note-item, article, [class*='note-item'], [data-id], [data-note-id]",
    );
    for (const selector of NOTE_LINK_SELECTORS) {
      const link = noteContainer?.querySelector(selector) || element.querySelector?.(selector);
      const sourceUrl = getSourceUrlFromLink(link);
      if (sourceUrl) {
        return sourceUrl;
      }
    }

    return normalizeXiaohongshuSourceUrl(window.location.href);
  }

  collector.registerSourceUrlResolver(findNoteSourceUrl);
}
