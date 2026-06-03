import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileItem } from "@/stores/fileTypes";

const { getFilePreviewMode, getFileSrc, getGeneratedThumbnailSrc, rememberPreviewImageSrc } =
  vi.hoisted(() => ({
    getFilePreviewMode: vi.fn(),
    getFileSrc: vi.fn(),
    getGeneratedThumbnailSrc: vi.fn(),
    rememberPreviewImageSrc: vi.fn(),
  }));

vi.mock("@/utils", () => ({
  getFilePreviewMode,
  getFileSrc,
  getGeneratedThumbnailSrc,
  rememberPreviewImageSrc,
  resolveThumbnailRequestMaxEdge: vi.fn(() => 768),
}));

vi.mock("@/components/FileTypeIcon", () => ({
  default: ({ ext }: { ext: string }) => <span data-testid="file-type-icon">{ext}</span>,
}));

const { ThumbnailItem } = await import("@/components/image-preview/PreviewHelpers");

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

describe("ThumbnailItem", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getFilePreviewMode.mockReset();
    getFileSrc.mockReset();
    getGeneratedThumbnailSrc.mockReset();
    rememberPreviewImageSrc.mockReset();
    getFilePreviewMode.mockReturnValue("image");
  });

  it("loads generated thumbnails for large preview strip images", async () => {
    getGeneratedThumbnailSrc.mockResolvedValue("shiguang-file://asset/photo-thumbnail");

    render(
      <ThumbnailItem file={createFile({ size: 16 * 1024 * 1024, width: 8192, height: 5464 })} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "photo.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/photo-thumbnail",
      ),
    );
    expect(getGeneratedThumbnailSrc).toHaveBeenCalledWith(
      {
        path: "/library/photo.jpg",
        ext: "jpg",
        width: 8192,
        height: 5464,
        size: 16 * 1024 * 1024,
      },
      768,
    );
    expect(getFileSrc).not.toHaveBeenCalled();
    expect(rememberPreviewImageSrc).not.toHaveBeenCalled();
  });

  it("keeps cached strip thumbnails visible when remounted", async () => {
    getGeneratedThumbnailSrc.mockResolvedValue("shiguang-file://asset/cached-thumbnail");
    const file = createFile({
      id: 20,
      path: "/library/cached.jpg",
      name: "cached.jpg",
      size: 16 * 1024 * 1024,
      width: 8192,
      height: 5464,
    });

    const { unmount } = render(<ThumbnailItem file={file} />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "cached.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/cached-thumbnail",
      ),
    );

    unmount();
    getGeneratedThumbnailSrc.mockReturnValue(new Promise<string>(() => {}));
    render(<ThumbnailItem file={file} />);

    expect(screen.getByRole("img", { name: "cached.jpg" })).toHaveAttribute(
      "src",
      "shiguang-file://asset/cached-thumbnail",
    );
    expect(screen.queryByTestId("file-type-icon")).toBeNull();
  });

  it("falls back to original image sources when no strip thumbnail is generated", async () => {
    getGeneratedThumbnailSrc.mockResolvedValue("");
    getFileSrc.mockResolvedValue("shiguang-file://asset/original");

    render(<ThumbnailItem file={createFile()} />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "photo.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/original",
      ),
    );
    expect(getGeneratedThumbnailSrc).toHaveBeenCalled();
    expect(getFileSrc).toHaveBeenCalledWith("/library/photo.jpg");
    expect(rememberPreviewImageSrc).toHaveBeenCalledWith(
      "/library/photo.jpg",
      "shiguang-file://asset/original",
    );
  });

  it("does not use thumbhash while the preview strip image source is loading", async () => {
    let resolvePreviewSrc: (src: string) => void = () => {};
    getGeneratedThumbnailSrc.mockReturnValue(
      new Promise<string>((resolve) => {
        resolvePreviewSrc = resolve;
      }),
    );

    render(
      <ThumbnailItem
        file={createFile({
          id: 30,
          name: "loading.jpg",
          path: "/library/loading.jpg",
          thumbHash: "thumbhash",
        })}
      />,
    );

    expect(screen.queryByRole("img", { name: "loading.jpg" })).toBeNull();
    expect(screen.getByTestId("file-type-icon")).toHaveTextContent("jpg");

    resolvePreviewSrc("shiguang-file://asset/original");

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "loading.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/original",
      ),
    );
  });

  it("loads generated thumbnails for video strip items", async () => {
    getFilePreviewMode.mockReturnValue("video");
    getGeneratedThumbnailSrc.mockResolvedValue("shiguang-file://asset/video-thumbnail");

    render(
      <ThumbnailItem
        file={createFile({ ext: "mp4", name: "clip.mp4", path: "/library/clip.mp4" })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "clip.mp4" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/video-thumbnail",
      ),
    );
    expect(getFileSrc).not.toHaveBeenCalled();
    expect(getGeneratedThumbnailSrc).toHaveBeenCalledWith(
      {
        path: "/library/clip.mp4",
        ext: "mp4",
        width: 800,
        height: 600,
        size: 1024,
      },
      768,
    );
  });
});
