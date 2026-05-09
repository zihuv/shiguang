import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAG_ICON_MAX_EDGE,
  createGenericFileDragIconPngBuffer,
  createImageDragPreviewPngBuffer,
} from "../drag-preview-icon";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "shiguang-drag-preview-"));
  tempDirs.push(tempDir);
  return tempDir;
}

async function writeTestImage(filePath: string, format: "avif" | "gif" | "tiff" | "webp") {
  const image = sharp({
    create: {
      width: 320,
      height: 180,
      channels: 4,
      background: "#22c55e",
    },
  });

  if (format === "avif") {
    await image.avif().toFile(filePath);
    return;
  }
  if (format === "gif") {
    await image.gif().toFile(filePath);
    return;
  }
  if (format === "tiff") {
    await image.tiff().toFile(filePath);
    return;
  }
  await image.webp().toFile(filePath);
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("drag preview icon helpers", () => {
  it("decodes common non-nativeImage image formats into small PNG buffers", async () => {
    const tempDir = makeTempDir();

    for (const ext of ["avif", "gif", "tiff", "webp"] as const) {
      const filePath = path.join(tempDir, `image.${ext}`);
      await writeTestImage(filePath, ext);

      const pngBuffer = await createImageDragPreviewPngBuffer(filePath, ext);
      expect(pngBuffer).toBeTruthy();

      const metadata = await sharp(pngBuffer!).metadata();
      expect(metadata.format).toBe("png");
      expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(
        DRAG_ICON_MAX_EDGE,
      );
    }
  });

  it("uses the injected HEIC thumbnail provider without writing cache files", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "image.heic");
    let calledWith: { filePath: string; maxEdge: number } | null = null;

    const pngBuffer = await createImageDragPreviewPngBuffer(filePath, "heic", {
      heifThumbnailProvider: async (nextFilePath, maxEdge) => {
        calledWith = { filePath: nextFilePath, maxEdge };
        return sharp({
          create: {
            width: 64,
            height: 64,
            channels: 4,
            background: "#0ea5e9",
          },
        })
          .png()
          .toBuffer();
      },
    });

    expect(calledWith).toEqual({ filePath, maxEdge: DRAG_ICON_MAX_EDGE });
    expect((await sharp(pngBuffer!).metadata()).format).toBe("png");
  });

  it("returns null for non-image files and keeps a generic icon fallback available", async () => {
    await expect(createImageDragPreviewPngBuffer("/tmp/file.txt", "txt")).resolves.toBeNull();
    await expect(createGenericFileDragIconPngBuffer("txt")).resolves.toBeInstanceOf(Buffer);
  });
});
