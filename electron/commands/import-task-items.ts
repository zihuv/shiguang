import type { ImportTaskItem } from "../types";

type ImportTaskItemKind = ImportTaskItem["kind"];
type ImportTaskMetadata = Pick<
  Extract<ImportTaskItem, { kind: "binary_image" }>,
  "rating" | "description" | "sourceUrl" | "tagIds"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, index: number): string {
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw new Error(`Invalid import item ${index}: missing ${key}`);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function optionalFolderId(record: Record<string, unknown>): number | null | undefined {
  const value = record.folderId;
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new Error("Invalid import item: folderId must be a positive integer");
}

function optionalTagIds(record: Record<string, unknown>, index: number): number[] | undefined {
  const value = record.tagIds;
  if (value === undefined) {
    return undefined;
  }
  if (
    Array.isArray(value) &&
    value.every((tagId) => typeof tagId === "number" && Number.isInteger(tagId) && tagId > 0)
  ) {
    return value;
  }
  throw new Error(`Invalid import item ${index}: tagIds must be positive integers`);
}

function optionalFolder(record: Record<string, unknown>) {
  const folderId = optionalFolderId(record);
  return folderId === undefined ? {} : { folderId };
}

function optionalMetadata(record: Record<string, unknown>, index: number) {
  const metadata: Partial<ImportTaskMetadata> = {};
  if (typeof record.rating === "number") {
    metadata.rating = record.rating;
  }
  const description = optionalString(record, "description");
  if (description !== undefined) {
    metadata.description = description;
  }
  const sourceUrl = optionalString(record, "sourceUrl");
  if (sourceUrl !== undefined) {
    metadata.sourceUrl = sourceUrl;
  }
  const tagIds = optionalTagIds(record, index);
  if (tagIds !== undefined) {
    metadata.tagIds = tagIds;
  }
  return metadata;
}

function requiredBytes(record: Record<string, unknown>, index: number): Uint8Array {
  const value = record.bytes;
  if (value instanceof Uint8Array) {
    return value;
  }
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return new Uint8Array(value);
  }
  throw new Error(`Invalid import item ${index}: missing bytes`);
}

function requiredKind(record: Record<string, unknown>, index: number): ImportTaskItemKind {
  const value = record.kind;
  if (
    value === "file_path" ||
    value === "base64_image" ||
    value === "binary_image" ||
    value === "clipboard_file"
  ) {
    return value;
  }
  throw new Error(`Invalid import item ${index}: unsupported kind`);
}

export function normalizeImportTaskItem(value: unknown, index = 0): ImportTaskItem {
  if (!isRecord(value)) {
    throw new Error(`Invalid import item ${index}: expected object`);
  }

  const kind = requiredKind(value, index);
  const folder = optionalFolder(value);

  switch (kind) {
    case "file_path":
      return {
        kind,
        path: requiredString(value, "path", index),
        ...folder,
      };
    case "base64_image":
      return {
        kind,
        base64Data: requiredString(value, "base64Data", index),
        ext: requiredString(value, "ext", index),
        ...folder,
      };
    case "binary_image":
      return {
        kind,
        bytes: requiredBytes(value, index),
        ext: requiredString(value, "ext", index),
        ...folder,
        ...optionalMetadata(value, index),
      };
    case "clipboard_file": {
      const ext = optionalString(value, "ext");
      return {
        kind,
        sourcePath: requiredString(value, "sourcePath", index),
        ...(ext === undefined ? {} : { ext }),
        ...folder,
        ...optionalMetadata(value, index),
      };
    }
  }
}

export function normalizeImportTaskItems(items: unknown[]): ImportTaskItem[] {
  return items.map((item, index) => normalizeImportTaskItem(item, index));
}

export function importTaskSource(item: ImportTaskItem): string {
  switch (item.kind) {
    case "base64_image":
    case "binary_image":
      return `clipboard.${item.ext}`;
    case "clipboard_file":
      return item.sourcePath;
    case "file_path":
      return item.path;
  }
}

export function isFilePathImportItem(
  item: ImportTaskItem,
): item is Extract<ImportTaskItem, { kind: "file_path" }> {
  return item.kind === "file_path";
}
