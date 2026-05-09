import { describe, expect, it } from "vitest";
import { buildImageFetchInit, shouldUseFrameImageFetch } from "./runtime";

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
});
