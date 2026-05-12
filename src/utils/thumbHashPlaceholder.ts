import { thumbHashBase64ToBytes, thumbHashToDataUrl } from "@/lib/thumbhash";

const THUMB_HASH_PLACEHOLDER_CACHE_LIMIT = 256;
const thumbHashPlaceholderCache = new Map<string, string>();

function trimThumbHashPlaceholderCache() {
  while (thumbHashPlaceholderCache.size > THUMB_HASH_PLACEHOLDER_CACHE_LIMIT) {
    const oldestKey = thumbHashPlaceholderCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    thumbHashPlaceholderCache.delete(oldestKey);
  }
}

export function getThumbHashPlaceholderSrc(thumbHash: string | null | undefined): string {
  const normalized = thumbHash?.trim() ?? "";
  if (!normalized) {
    return "";
  }

  const cached = thumbHashPlaceholderCache.get(normalized);
  if (cached) {
    thumbHashPlaceholderCache.delete(normalized);
    thumbHashPlaceholderCache.set(normalized, cached);
    return cached;
  }

  try {
    const placeholderSrc = thumbHashToDataUrl(thumbHashBase64ToBytes(normalized));
    thumbHashPlaceholderCache.set(normalized, placeholderSrc);
    trimThumbHashPlaceholderCache();
    return placeholderSrc;
  } catch (error) {
    console.error("Failed to decode thumb hash placeholder:", error);
    return "";
  }
}
