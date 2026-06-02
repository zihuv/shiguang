import { describe, expect, it } from "vitest";
import {
  buildImageFetchInit,
  isImageNotFoundError,
  resolveScreenshotSourceUrl,
  shouldUseFrameImageFetch,
} from "./runtime";

describe("background image fetch options", () => {
  it("keeps fetch options focused on cached browser credentials", () => {
    expect(buildImageFetchInit()).toEqual({
      cache: "force-cache",
      credentials: "include",
    });
  });

  it("uses the Eagle-style frame fetch only for Pixiv image hosts", () => {
    expect(
      shouldUseFrameImageFetch(
        "https://i.pximg.net/img-original/img/2022/09/13/16/22/07/101199573_p0.jpg",
      ),
    ).toBe(true);
    expect(shouldUseFrameImageFetch("https://example.com/image.jpg")).toBe(false);
  });

  it("recognizes missing image candidates before trying heavier fetch fallbacks", () => {
    expect(isImageNotFoundError(new Error("HTTP 404 Not Found"))).toBe(true);
    expect(isImageNotFoundError(new Error("HTTP 403 Forbidden"))).toBe(false);
  });
});

describe("screenshot source url", () => {
  it("prefers the page-provided source URL for screenshot imports", () => {
    expect(
      resolveScreenshotSourceUrl(
        "https://example.com/page?from=content",
        "https://example.com/page?from=tab",
      ),
    ).toBe("https://example.com/page?from=content");
  });

  it("falls back to the tab URL when screenshot payloads omit a source URL", () => {
    expect(resolveScreenshotSourceUrl(undefined, "https://example.com/page")).toBe(
      "https://example.com/page",
    );
  });
});
