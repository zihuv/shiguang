import path from "node:path";
import { promises as fs } from "node:fs";
import {
  isHighFidelityDocxThumbnailExt,
  isVisuallyBlankImage,
  renderDocxPreviewThumbnailPngBuffer,
} from "./docx-preview";
import { extractDocumentPage } from "./extractors";
import { renderDocumentPageThumbnail } from "./render";

const DOCUMENT_THUMBNAIL_EXTENSIONS = new Set([
  "doc",
  "docx",
  "rtf",
  "odt",
  "htm",
  "html",
  "pptx",
  "ppsx",
  "odp",
]);

export function isDocumentThumbnailExt(ext: string): boolean {
  return DOCUMENT_THUMBNAIL_EXTENSIONS.has(ext.trim().replace(/^\./, "").toLowerCase());
}

export async function buildDocumentThumbnailPngBuffer(
  filePath: string,
  ext: string,
  maxEdge: number,
): Promise<Buffer> {
  const buffer = await fs.readFile(filePath);
  if (isHighFidelityDocxThumbnailExt(ext)) {
    try {
      return await renderDocxPreviewThumbnailPngBuffer(buffer);
    } catch {
      // Keep thumbnails available even when a DOCX uses markup the preview renderer cannot handle.
    }
  }

  const page = extractDocumentPage(buffer, ext, { fileName: path.basename(filePath) });
  return renderDocumentPageThumbnail(page, { maxEdge });
}

export { extractDocumentPage, renderDocumentPageThumbnail };
export { isHighFidelityDocxThumbnailExt };
export { isVisuallyBlankImage };
export type { DocumentBlock, DocumentPageModel } from "./model";
