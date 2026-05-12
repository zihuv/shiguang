import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileItem } from "@/stores/fileTypes";

const { getFilePreviewMode, getFileSrc, rememberPreviewImageSrc } = vi.hoisted(() => ({
  getFilePreviewMode: vi.fn(),
  getFileSrc: vi.fn(),
  rememberPreviewImageSrc: vi.fn(),
}));

vi.mock("@/utils", () => ({
  getFilePreviewMode,
  getFileSrc,
  rememberPreviewImageSrc,
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
    rememberPreviewImageSrc.mockReset();
    getFilePreviewMode.mockReturnValue("image");
  });

  it("loads original image sources for preview strip thumbnails", async () => {
    getFileSrc.mockResolvedValue("shiguang-file://asset/original");

    render(<ThumbnailItem file={createFile()} />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "photo.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/original",
      ),
    );
    expect(getFileSrc).toHaveBeenCalledWith("/library/photo.jpg");
  });

  it("does not use thumbhash while the original image source is loading", async () => {
    let resolvePreviewSrc: (src: string) => void = () => {};
    getFileSrc.mockReturnValue(
      new Promise<string>((resolve) => {
        resolvePreviewSrc = resolve;
      }),
    );

    render(<ThumbnailItem file={createFile({ thumbHash: "thumbhash" })} />);

    expect(screen.queryByRole("img", { name: "photo.jpg" })).toBeNull();
    expect(screen.getByTestId("file-type-icon")).toHaveTextContent("jpg");

    resolvePreviewSrc("shiguang-file://asset/original");

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "photo.jpg" })).toHaveAttribute(
        "src",
        "shiguang-file://asset/original",
      ),
    );
  });
});
