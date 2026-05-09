import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getImageUrlFromElement } from "./image-urls";
import { scanPageImages } from "./panel-utils";
import type { CollectionPayload, Collector } from "../types";

function normalizeImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function createCollector(): Collector {
  return {
    state: {
      lastCollectionPayload: null,
      lastImageUrl: null,
      lastRightClickTarget: null,
      lastSourceUrl: null,
    },
    extractImageUrlFromDragEvent: vi.fn(() => null),
    getImageUrlFromElement,
    getImageUrlFromPoint: vi.fn(() => null),
    getLastImageUrl: vi.fn(() => null),
    getLastSourceUrl: vi.fn(() => null),
    getLastCollectionPayload: vi.fn(() => null),
    getLastRightClickTarget: vi.fn(() => null),
    getRenderedImageDataUrl: vi.fn(() => null),
    normalizeImageUrl,
    requestCollectImage: vi.fn(async () => ({ success: true })),
    resolveSourceUrlFromElement: vi.fn(() => null),
    resolveCollectionPayload: vi.fn((_target, url) => {
      const imageUrl = normalizeImageUrl(url);
      if (!imageUrl) {
        return null;
      }

      return {
        imageUrl,
        candidateUrls: [imageUrl],
        sourceUrl: window.location.href,
        metadata: null,
      } satisfies CollectionPayload;
    }),
    registerSourceUrlResolver: vi.fn(),
    setLastImageContext: vi.fn(() => null),
    showToast: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  };
}

describe("panel page image scanning", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundImage: "none",
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the shared srcset parser when collecting page images", () => {
    document.body.innerHTML = `
      <img
        id="target"
        src="/thumb.jpg"
        srcset="/small.jpg 320w, /large.jpg 1200w"
        data-srcset="/data-small.jpg 1x, /data-large.jpg 2x"
      >
    `;

    const images = scanPageImages(createCollector());
    const urls = images.map((image) => image.url);

    expect(urls).toContain("http://localhost:3000/large.jpg");
    expect(urls).toContain("http://localhost:3000/data-large.jpg");
    expect(urls).toContain("http://localhost:3000/thumb.jpg");
  });
});
