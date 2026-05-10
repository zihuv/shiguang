import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCollector } from "./collector";

const DATA_URL = "data:image/png;base64,cmVuZGVyZWQ=";

function markImageLoaded(image: HTMLImageElement, width = 640, height = 480) {
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalHeight: { configurable: true, value: height },
    naturalWidth: { configurable: true, value: width },
  });
}

describe("collector rendered image reuse", () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    document.body.innerHTML = "";
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(async () => ({ success: true })),
      },
    });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends rendered image data when reusing a loaded page image", async () => {
    document.body.innerHTML = `<img id="target" src="https://sns-webpic-qc.xhscdn.com/image-webp" />`;
    const image = document.getElementById("target") as HTMLImageElement;
    markImageLoaded(image);
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => DATA_URL);

    const collector = createCollector();
    const result = await collector.requestCollectImage(image.src, {
      target: image,
    });

    expect(result).toEqual({ success: true });
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 640, 480);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "collectImage",
        payload: expect.objectContaining({
          imageUrl: image.src,
          candidateUrls: [image.src],
          renderedImageDataUrl: DATA_URL,
        }),
      }),
    );
  });

  it("falls back to url collection when rendered pixels cannot be exported", async () => {
    document.body.innerHTML = `<img id="target" src="https://sns-webpic-qc.xhscdn.com/image-webp" />`;
    const image = document.getElementById("target") as HTMLImageElement;
    markImageLoaded(image);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
      throw new DOMException("Tainted canvas", "SecurityError");
    });

    const collector = createCollector();
    const result = await collector.requestCollectImage(image.src, {
      target: image,
    });

    expect(result).toEqual({ success: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "collectImage",
        payload: expect.objectContaining({
          imageUrl: image.src,
          renderedImageDataUrl: null,
        }),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips rendered pixel reuse for Pixiv images", async () => {
    document.body.innerHTML = `<img id="target" src="https://i.pximg.net/img-master/img/2022/09/13/16/22/07/101199573_p0_master1200.jpg" />`;
    const image = document.getElementById("target") as HTMLImageElement;
    markImageLoaded(image, 3056, 6767);
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => DATA_URL);

    const collector = createCollector();
    const result = await collector.requestCollectImage(image.src, {
      target: image,
      referer: "https://www.pixiv.net/artworks/101199573#1",
    });

    expect(result).toEqual({ success: true });
    expect(drawImage).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "collectImage",
        payload: expect.objectContaining({
          imageUrl: image.src,
          renderedImageDataUrl: null,
        }),
      }),
    );
  });
});
