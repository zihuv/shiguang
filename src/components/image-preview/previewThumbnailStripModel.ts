export const PREVIEW_THUMBNAIL_SIZE = 56;
export const PREVIEW_THUMBNAIL_GAP = 4;
export const PREVIEW_THUMBNAIL_OVERSCAN = 10;

export interface PreviewThumbnailRangeInput {
  itemCount: number;
  scrollLeft: number;
  viewportWidth: number;
  itemSize?: number;
  gap?: number;
  overscan?: number;
}

export interface PreviewThumbnailRange {
  startIndex: number;
  endIndex: number;
  totalWidth: number;
  itemSize: number;
  itemStride: number;
}

export function getPreviewThumbnailRange({
  itemCount,
  scrollLeft,
  viewportWidth,
  itemSize = PREVIEW_THUMBNAIL_SIZE,
  gap = PREVIEW_THUMBNAIL_GAP,
  overscan = PREVIEW_THUMBNAIL_OVERSCAN,
}: PreviewThumbnailRangeInput): PreviewThumbnailRange {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  const safeItemSize = Math.max(1, Math.floor(itemSize));
  const safeGap = Math.max(0, Math.floor(gap));
  const itemStride = safeItemSize + safeGap;

  if (safeItemCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      totalWidth: 0,
      itemSize: safeItemSize,
      itemStride,
    };
  }

  const safeScrollLeft = Math.max(0, Number.isFinite(scrollLeft) ? scrollLeft : 0);
  const safeViewportWidth = Math.max(0, Number.isFinite(viewportWidth) ? viewportWidth : 0);
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const visibleStartIndex = Math.floor(safeScrollLeft / itemStride);
  const visibleEndIndex = Math.ceil((safeScrollLeft + safeViewportWidth) / itemStride);

  return {
    startIndex: Math.max(0, visibleStartIndex - safeOverscan),
    endIndex: Math.min(safeItemCount, visibleEndIndex + safeOverscan),
    totalWidth: safeItemCount * itemStride - safeGap,
    itemSize: safeItemSize,
    itemStride,
  };
}

export function getCenteredPreviewThumbnailScrollLeft({
  index,
  itemCount,
  itemSize = PREVIEW_THUMBNAIL_SIZE,
  gap = PREVIEW_THUMBNAIL_GAP,
  viewportWidth,
}: {
  index: number;
  itemCount: number;
  itemSize?: number;
  gap?: number;
  viewportWidth: number;
}) {
  const range = getPreviewThumbnailRange({
    itemCount,
    itemSize,
    gap,
    scrollLeft: 0,
    viewportWidth,
  });
  const safeIndex = Math.max(0, Math.min(Math.floor(index), Math.max(0, itemCount - 1)));
  const itemLeft = safeIndex * range.itemStride;
  const targetLeft = itemLeft - (Math.max(0, viewportWidth) - range.itemSize) / 2;
  return Math.max(0, Math.min(targetLeft, Math.max(0, range.totalWidth - viewportWidth)));
}
