import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileItem } from "@/stores/fileTypes";

const {
  getFilePreviewMode,
  getFileSrc,
  getGeneratedThumbnailSrc,
  getTextPreviewContent,
  resolveThumbnailRequestMaxEdge,
} = vi.hoisted(() => ({
  getFilePreviewMode: vi.fn(),
  getFileSrc: vi.fn(),
  getGeneratedThumbnailSrc: vi.fn(),
  getTextPreviewContent: vi.fn(),
  resolveThumbnailRequestMaxEdge: vi.fn(),
}));

vi.mock("@/stores/thumbnailRefreshStore", () => ({
  useThumbnailRefreshStore: (
    selector: (state: { fileVersions: Record<number, number> }) => number,
  ) => selector({ fileVersions: {} }),
}));

vi.mock("@/utils", () => ({
  getFilePreviewMode,
  getFileSrc,
  getGeneratedThumbnailSrc,
  getTextPreviewContent,
  resolveThumbnailRequestMaxEdge,
}));

const { useDetailPreview } = await import("@/components/detail-panel/useDetailPreview");

function createFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 1,
    path: "/library/photo-a.jpg",
    name: "photo-a.jpg",
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

describe("useDetailPreview", () => {
  beforeEach(() => {
    getFilePreviewMode.mockReset();
    getFileSrc.mockReset();
    getGeneratedThumbnailSrc.mockReset();
    getTextPreviewContent.mockReset();
    resolveThumbnailRequestMaxEdge.mockReset();
    getFilePreviewMode.mockReturnValue("image");
    resolveThumbnailRequestMaxEdge.mockReturnValue(768);
  });

  it("does not expose the previous file image while the next detail thumbnail loads", async () => {
    const firstFile = createFile();
    const secondFile = createFile({
      id: 2,
      name: "photo-b.jpg",
      path: "/library/photo-b.jpg",
      size: 2048,
    });
    getGeneratedThumbnailSrc.mockImplementation((file: Pick<FileItem, "path">) =>
      Promise.resolve(
        file.path === firstFile.path
          ? "shiguang-file://asset/detail-a"
          : "shiguang-file://asset/detail-b",
      ),
    );

    const { rerender, result } = renderHook(({ file }) => useDetailPreview({ file, width: 320 }), {
      initialProps: { file: firstFile },
    });

    await waitFor(() => {
      expect(result.current.imageSrc).toBe("shiguang-file://asset/detail-a");
    });

    rerender({ file: secondFile });

    expect(result.current.imageSrc).toBe("");

    await waitFor(() => {
      expect(result.current.imageSrc).toBe("shiguang-file://asset/detail-b");
    });
  });
});
