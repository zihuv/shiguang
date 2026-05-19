import { describe, expect, it } from "vitest";
import {
  importTaskSource,
  isFilePathImportItem,
  normalizeImportTaskItem,
  normalizeImportTaskItems,
} from "../commands/import-task-items";

describe("import task item normalization", () => {
  it("normalizes the supported import item shapes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const items = normalizeImportTaskItems([
      { kind: "file_path", path: "/library/a.png", folderId: 4 },
      { kind: "base64_image", base64Data: "Zm9v", ext: "png" },
      {
        kind: "binary_image",
        bytes,
        ext: "jpg",
        rating: 3,
        description: "From clipboard",
        sourceUrl: "https://example.com/image",
        tagIds: [1, 2],
      },
      { kind: "clipboard_file", sourcePath: "/tmp/copy.webp", ext: "webp" },
    ]);

    expect(items).toEqual([
      { kind: "file_path", path: "/library/a.png", folderId: 4 },
      { kind: "base64_image", base64Data: "Zm9v", ext: "png" },
      {
        kind: "binary_image",
        bytes,
        ext: "jpg",
        rating: 3,
        description: "From clipboard",
        sourceUrl: "https://example.com/image",
        tagIds: [1, 2],
      },
      { kind: "clipboard_file", sourcePath: "/tmp/copy.webp", ext: "webp" },
    ]);
  });

  it("rejects legacy aliases and malformed values at the boundary", () => {
    expect(() =>
      normalizeImportTaskItem({ kind: "base64_image", base64_data: "Zm9v", ext: "png" }),
    ).toThrow(/missing base64Data/);
    expect(() => normalizeImportTaskItem({ kind: "file_path", path: "/a", folderId: 0 })).toThrow(
      /folderId/,
    );
    expect(() =>
      normalizeImportTaskItem({ kind: "binary_image", bytes: [0, 300], ext: "png" }),
    ).toThrow(/bytes/);
    expect(() =>
      normalizeImportTaskItem({ kind: "binary_image", bytes: [0], ext: "png", tagIds: [1, -2] }),
    ).toThrow(/tagIds/);
  });

  it("keeps source labels tied to normalized item intent", () => {
    const fileItem = normalizeImportTaskItem({ kind: "file_path", path: "/library/a.png" });
    const binaryItem = normalizeImportTaskItem({
      kind: "binary_image",
      bytes: [1, 2],
      ext: "png",
    });

    expect(isFilePathImportItem(fileItem)).toBe(true);
    expect(isFilePathImportItem(binaryItem)).toBe(false);
    expect(importTaskSource(fileItem)).toBe("/library/a.png");
    expect(importTaskSource(binaryItem)).toBe("clipboard.png");
  });
});
