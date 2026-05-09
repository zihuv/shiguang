import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractImageUrlFromDragEvent,
  getImageCandidateUrlsFromElement,
  getImageUrlFromElement,
  parseSrcset,
} from "./image-urls";

describe("content image url helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      backgroundImage: "none",
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects the largest srcset candidate", () => {
    expect(parseSrcset("/small.jpg 320w, /large.jpg 1200w")).toBe(
      "http://localhost:3000/large.jpg",
    );
    expect(parseSrcset("/one.jpg 1x, /two.jpg 2x")).toBe("http://localhost:3000/two.jpg");
  });

  it("resolves the same image candidates for direct and nested targets", () => {
    document.body.innerHTML = `
      <a id="card" href="/detail">
        <picture>
          <source srcset="/wide.jpg 1000w, /small.jpg 200w">
          <img id="image" data-original="/original.jpg" src="/thumb.jpg">
        </picture>
      </a>
    `;

    const card = document.getElementById("card")!;
    const image = document.getElementById("image")!;

    expect(getImageUrlFromElement(card)).toBe("http://localhost:3000/wide.jpg");
    expect(getImageUrlFromElement(image)).toBe("http://localhost:3000/original.jpg");
    expect(getImageCandidateUrlsFromElement(image)).toEqual([
      "http://localhost:3000/original.jpg",
      "http://localhost:3000/wide.jpg",
      "http://localhost:3000/thumb.jpg",
    ]);
  });

  it("extracts drag urls from uri-list data", () => {
    const event = new Event("dragstart") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        getData(type: string) {
          return type === "text/uri-list" ? "# comment\nhttps://example.com/image.jpg" : "";
        },
      },
    });

    expect(extractImageUrlFromDragEvent(event)).toBe("https://example.com/image.jpg");
  });
});
