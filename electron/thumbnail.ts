import crypto from "node:crypto";

export {
  decideThumbnailGeneration,
  decideThumbnailPlan,
  getThumbnailGenerationRuntimeForExt,
  isMainProcessThumbnailExt,
  isThumbnailSupportedExt,
  isVideoThumbnailExt,
  normalizeThumbnailExt,
  THUMBNAIL_EDGE_THRESHOLD,
  THUMBNAIL_PIXEL_THRESHOLD,
  THUMBNAIL_SIZE_THRESHOLD,
} from "../src/lib/thumbnailPolicy";
export type {
  ThumbnailDecision,
  ThumbnailDecisionInput,
  ThumbnailDecisionReason,
  ThumbnailGenerationRuntime,
  ThumbnailPlan,
} from "../src/lib/thumbnailPolicy";

export const THUMBNAIL_CACHE_VERSION = "v4";
export const THUMBNAIL_MAX_EDGE = 768;
export const THUMBNAIL_WEBP_QUALITY = 85;
export type ThumbnailStatus = "pending" | "ready" | "failed" | "skipped";

export interface ThumbnailCacheIdentity {
  size: number;
  modifiedAt: string;
  maxEdge?: number | null;
}

export function normalizeThumbnailMaxEdge(maxEdge?: number | null): number {
  if (typeof maxEdge === "number" && Number.isFinite(maxEdge) && maxEdge > 0) {
    return Math.round(maxEdge);
  }
  return THUMBNAIL_MAX_EDGE;
}

export function createThumbnailCacheKey(
  filePath: string,
  identity: ThumbnailCacheIdentity,
): string {
  const modifiedAt = identity.modifiedAt.trim();
  if (!Number.isFinite(identity.size) || identity.size < 0 || !modifiedAt) {
    throw new Error("Thumbnail cache identity requires file size and modified time");
  }

  return crypto
    .createHash("sha256")
    .update(THUMBNAIL_CACHE_VERSION)
    .update("\0")
    .update(filePath)
    .update("\0")
    .update(String(identity.size))
    .update("\0")
    .update(modifiedAt)
    .update("\0")
    .update(String(normalizeThumbnailMaxEdge(identity.maxEdge)))
    .digest("hex");
}

export function resolveThumbnailCacheKey(
  filePath: string,
  identity: ThumbnailCacheIdentity,
): string {
  return createThumbnailCacheKey(filePath, identity);
}
