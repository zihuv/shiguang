import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileItem } from "@/stores/fileTypes";

const {
  getFilePreviewMode,
  getFileSrc,
  getRememberedPreviewImageSrc,
  getTextPreviewContent,
  getThumbnailImageSrc,
  preloadFileImage,
} = vi.hoisted(() => ({
  getFilePreviewMode: vi.fn(),
  getFileSrc: vi.fn(),
  getRememberedPreviewImageSrc: vi.fn(),
  getTextPreviewContent: vi.fn(),
  getThumbnailImageSrc: vi.fn(),
  preloadFileImage: vi.fn(),
}));

vi.mock("@/utils", () => ({
  getFilePreviewMode,
  getFileSrc,
  getRememberedPreviewImageSrc,
  getTextPreviewContent,
  getThumbnailImageSrc,
  preloadFileImage,
}));

const { shouldPreloadOriginalPreviewImage, usePreviewSource } =
  await import("@/components/image-preview/usePreviewSource");

function createFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 1,
    path: "/library/photo.jpg",
    name: "photo.jpg",
    ext: "jpg",
    size: 1024,
    width: 800,
    height: 600,
    folderId: null,
    createdAt: "2026-05-12T00:00:00.000Z",
    modifiedAt: "2026-05-12T00:00:00.000Z",
    importedAt: "2026-05-12T00:00:00.000Z",
    lastAccessedAt: null,
    rating: 0,
    description: "",
    sourceUrl: "",
    dominantColor: "",
    colorDistribution: [],
    thumbHash: "",
    contentHash: null,
    tags: [],
    deletedAt: null,
    missingAt: null,
    ...overrides,
  };
}

describe("usePreviewSource", () => {
  beforeEach(() => {
    getFilePreviewMode.mockReset();
    getFileSrc.mockReset();
    getRememberedPreviewImageSrc.mockReset();
    getTextPreviewContent.mockReset();
    getThumbnailImageSrc.mockReset();
    preloadFileImage.mockReset();
  });

  it("ignores remembered generated thumbnails for main image previews", async () => {
    const file = createFile({
      size: 16 * 1024 * 1024,
      width: 8192,
      height: 5464,
    });
    getRememberedPreviewImageSrc.mockReturnValue(
      "shiguang-file://asset/opaque-generated-thumbnail",
    );
    preloadFileImage.mockResolvedValue({
      height: 5464,
      src: "shiguang-file://asset/original",
      width: 8192,
    });

    const { result } = renderHook(() =>
      usePreviewSource({
        currentFile: file,
        previewFiles: [file],
        previewIndex: 0,
        previewMode: true,
        previewType: "image",
      }),
    );

    expect(result.current.imageSrc).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.imageSrc).toBe("shiguang-file://asset/original");
    });
    expect(result.current.isPlaceholderImageSrc).toBe(false);
  });
});

describe("shouldPreloadOriginalPreviewImage", () => {
  it("keeps original preloading for small direct-preview images", () => {
    expect(shouldPreloadOriginalPreviewImage(createFile())).toBe(true);
  });

  it("skips original preloading for images that should use generated thumbnails", () => {
    expect(
      shouldPreloadOriginalPreviewImage(
        createFile({
          size: 16 * 1024 * 1024,
          width: 8192,
          height: 5464,
        }),
      ),
    ).toBe(false);
  });
});
