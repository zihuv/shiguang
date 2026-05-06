import { describe, expect, it } from "vitest";
import {
  THUMBNAIL_MAX_EDGE,
  createThumbnailCacheKey,
  resolveThumbnailCacheKey,
} from "../thumbnail";

describe("thumbnail cache keys", () => {
  it("uses file stat identity for thumbnail cache keys", () => {
    const identity = {
      size: 100,
      modifiedAt: "2026-04-29 10:00:00",
    };

    expect(resolveThumbnailCacheKey("/library/file.pdf", identity)).toBe(
      createThumbnailCacheKey("/library/file.pdf", identity),
    );
  });

  it("changes the key when file stat identity changes", () => {
    const first = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 100,
      modifiedAt: "2026-04-29 10:00:00",
    });
    const second = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 100,
      modifiedAt: "2026-04-29 10:01:00",
    });
    const third = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 101,
      modifiedAt: "2026-04-29 10:00:00",
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
  });

  it("includes thumbnail size in the key", () => {
    const defaultSize = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 100,
      modifiedAt: "2026-04-29 10:00:00",
    });
    const explicitDefaultSize = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 100,
      modifiedAt: "2026-04-29 10:00:00",
      maxEdge: THUMBNAIL_MAX_EDGE,
    });
    const customSize = resolveThumbnailCacheKey("/library/file.pdf", {
      size: 100,
      modifiedAt: "2026-04-29 10:00:00",
      maxEdge: 320,
    });

    expect(defaultSize).toBe(explicitDefaultSize);
    expect(defaultSize).not.toBe(customSize);
  });

  it("requires a complete file stat identity", () => {
    expect(() =>
      resolveThumbnailCacheKey("/library/file.pdf", {
        size: 100,
        modifiedAt: "",
      }),
    ).toThrow("Thumbnail cache identity requires file size and modified time");
  });
});
