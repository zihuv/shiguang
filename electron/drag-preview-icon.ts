import sharp from "sharp";
import {
  getFileFormatDefinition,
  getFileKind,
  normalizeExtension,
  type FileKind,
} from "../src/shared/file-formats";

export const DRAG_ICON_MAX_EDGE = 128;

type HeifThumbnailProvider = (filePath: string, maxEdge: number) => Promise<Buffer | null>;

const dragIconColorMap: Record<FileKind, { accent: string; fill: string }> = {
  image: { accent: "#10b981", fill: "#ecfdf5" },
  video: { accent: "#3b82f6", fill: "#eff6ff" },
  pdf: { accent: "#ef4444", fill: "#fef2f2" },
  audio: { accent: "#f97316", fill: "#fff7ed" },
  archive: { accent: "#f59e0b", fill: "#fffbeb" },
  spreadsheet: { accent: "#16a34a", fill: "#f0fdf4" },
  presentation: { accent: "#eab308", fill: "#fefce8" },
  word: { accent: "#0ea5e9", fill: "#f0f9ff" },
  code: { accent: "#8b5cf6", fill: "#f5f3ff" },
  text: { accent: "#64748b", fill: "#f8fafc" },
  other: { accent: "#9ca3af", fill: "#f9fafb" },
};

function isHeifLikeExt(ext: string): boolean {
  const normalizedExt = normalizeExtension(ext);
  return normalizedExt === "heic" || normalizedExt === "heif";
}

function canAttemptImageDragPreview(ext: string): boolean {
  const definition = getFileFormatDefinition(ext);
  return definition?.kind === "image" && !!definition.backendDecodable;
}

export async function createImageDragPreviewPngBuffer(
  filePath: string,
  ext: string,
  options: {
    heifThumbnailProvider?: HeifThumbnailProvider;
    maxEdge?: number;
  } = {},
): Promise<Buffer | null> {
  const normalizedExt = normalizeExtension(ext);
  const maxEdge = options.maxEdge ?? DRAG_ICON_MAX_EDGE;

  if (!canAttemptImageDragPreview(normalizedExt)) {
    return null;
  }

  if (isHeifLikeExt(normalizedExt)) {
    return options.heifThumbnailProvider?.(filePath, maxEdge) ?? null;
  }

  return sharp(filePath, { animated: false })
    .rotate()
    .resize(maxEdge, maxEdge, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

export async function createGenericFileDragIconPngBuffer(ext: string): Promise<Buffer> {
  const kind = getFileKind(ext);
  const normalizedExt = normalizeExtension(ext);
  const color = dragIconColorMap[kind];
  const label = normalizedExt.slice(0, 5).toUpperCase() || "FILE";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="${color.fill}"/>
  <path d="M34 18h39l21 21v71H34z" fill="#fff" stroke="${color.accent}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M73 18v22h21" fill="none" stroke="${color.accent}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="34" y="76" width="60" height="26" rx="8" fill="${color.accent}"/>
  <text x="64" y="94" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="15" font-weight="700" fill="#fff">${label}</text>
</svg>`;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer()
    .catch(() =>
      sharp({
        create: {
          width: DRAG_ICON_MAX_EDGE,
          height: DRAG_ICON_MAX_EDGE,
          channels: 4,
          background: color.fill,
        },
      })
        .png()
        .toBuffer(),
    );
}
