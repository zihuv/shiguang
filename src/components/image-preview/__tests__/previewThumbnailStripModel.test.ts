import { describe, expect, it } from "vitest";
import {
  getCenteredPreviewThumbnailScrollLeft,
  getPreviewThumbnailRange,
} from "@/components/image-preview/previewThumbnailStripModel";

describe("preview thumbnail strip model", () => {
  it("returns only the visible thumbnail window plus overscan", () => {
    const range = getPreviewThumbnailRange({
      itemCount: 1000,
      itemSize: 56,
      gap: 4,
      overscan: 2,
      scrollLeft: 60 * 120,
      viewportWidth: 300,
    });

    expect(range.startIndex).toBe(118);
    expect(range.endIndex).toBe(127);
    expect(range.totalWidth).toBe(59_996);
    expect(range.endIndex - range.startIndex).toBeLessThan(1000);
  });

  it("clamps centered scroll targets to the strip bounds", () => {
    expect(
      getCenteredPreviewThumbnailScrollLeft({
        index: 0,
        itemCount: 20,
        itemSize: 56,
        gap: 4,
        viewportWidth: 300,
      }),
    ).toBe(0);

    expect(
      getCenteredPreviewThumbnailScrollLeft({
        index: 19,
        itemCount: 20,
        itemSize: 56,
        gap: 4,
        viewportWidth: 300,
      }),
    ).toBe(896);
  });
});
