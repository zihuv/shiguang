import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/stores/fileTypes";
import FileTypeIcon from "@/components/FileTypeIcon";
import {
  getFilePreviewMode,
  getFileSrc,
  getGeneratedThumbnailSrc,
  rememberPreviewImageSrc,
  resolveThumbnailRequestMaxEdge,
} from "@/utils";

function revokeBlobUrl(src: string | null) {
  if (src?.startsWith("blob:")) {
    URL.revokeObjectURL(src);
  }
}

const THUMBNAIL_ITEM_SRC_CACHE_LIMIT = 256;
type ThumbnailItemSrcCacheValue = {
  rememberForPreview: boolean;
  src: string;
};
const thumbnailItemSrcCache = new Map<string, ThumbnailItemSrcCacheValue>();

function canCacheThumbnailItemSrc(src: string) {
  return Boolean(src) && !src.startsWith("blob:") && !src.startsWith("data:");
}

function getThumbnailItemCacheKey(file: FileItem, maxEdge: number) {
  return `${file.path}:${file.modifiedAt}:${file.size}:${file.width}x${file.height}:${maxEdge}`;
}

function getCachedThumbnailItemSrc(cacheKey: string) {
  const cached = thumbnailItemSrcCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  thumbnailItemSrcCache.delete(cacheKey);
  thumbnailItemSrcCache.set(cacheKey, cached);
  return cached;
}

function cacheThumbnailItemSrc(cacheKey: string, value: ThumbnailItemSrcCacheValue) {
  if (!canCacheThumbnailItemSrc(value.src)) {
    return;
  }

  thumbnailItemSrcCache.delete(cacheKey);
  thumbnailItemSrcCache.set(cacheKey, value);

  while (thumbnailItemSrcCache.size > THUMBNAIL_ITEM_SRC_CACHE_LIMIT) {
    const oldestKey = thumbnailItemSrcCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    thumbnailItemSrcCache.delete(oldestKey);
  }
}

export function ThumbnailItem({ file }: { file: FileItem }) {
  const { path, ext } = file;
  const previewType = getFilePreviewMode(ext);
  const thumbnailMaxEdge = resolveThumbnailRequestMaxEdge(56, 56, { devicePixelRatioCap: 2 });
  const cacheKey = getThumbnailItemCacheKey(file, thumbnailMaxEdge);
  const [imageState, setImageState] = useState<{ cacheKey: string; src: string | null }>(() => {
    const cached = getCachedThumbnailItemSrc(cacheKey);
    return { cacheKey, src: cached?.src ?? null };
  });
  const src = imageState.cacheKey === cacheKey ? imageState.src : null;
  const srcRef = useRef<string | null>(src);

  useEffect(() => {
    let mounted = true;
    const cached = getCachedThumbnailItemSrc(cacheKey);
    if (cached) {
      revokeBlobUrl(srcRef.current);
      srcRef.current = cached.src;
      setImageState({ cacheKey, src: cached.src });
    } else {
      revokeBlobUrl(srcRef.current);
      srcRef.current = null;
      setImageState({ cacheKey, src: null });
    }

    if (previewType !== "image" && previewType !== "thumbnail" && previewType !== "video") {
      return () => {
        mounted = false;
      };
    }

    const thumbnailSrcPromise: Promise<{ rememberForPreview: boolean; src: string }> =
      previewType === "image"
        ? getGeneratedThumbnailSrc(
            {
              path: file.path,
              ext: file.ext,
              width: file.width,
              height: file.height,
              size: file.size,
            },
            thumbnailMaxEdge,
          ).then(async (generatedSrc) => {
            if (generatedSrc) {
              return { rememberForPreview: false, src: generatedSrc };
            }
            return { rememberForPreview: true, src: await getFileSrc(path) };
          })
        : getGeneratedThumbnailSrc(
            {
              path: file.path,
              ext: file.ext,
              width: file.width,
              height: file.height,
              size: file.size,
            },
            thumbnailMaxEdge,
          ).then((generatedSrc) => ({ rememberForPreview: false, src: generatedSrc }));

    thumbnailSrcPromise.then(({ rememberForPreview, src: imageSrc }) => {
      if (!mounted) {
        revokeBlobUrl(imageSrc);
        return;
      }

      if (!imageSrc) {
        return;
      }

      revokeBlobUrl(srcRef.current);
      srcRef.current = imageSrc;
      cacheThumbnailItemSrc(cacheKey, { rememberForPreview, src: imageSrc });
      if (rememberForPreview) {
        rememberPreviewImageSrc(path, imageSrc);
      }
      setImageState({ cacheKey, src: imageSrc });
    });

    return () => {
      mounted = false;
      revokeBlobUrl(srcRef.current);
      srcRef.current = null;
    };
  }, [
    file.ext,
    file.height,
    file.path,
    file.size,
    file.width,
    cacheKey,
    path,
    previewType,
    thumbnailMaxEdge,
  ]);

  if (!src || (previewType !== "image" && previewType !== "thumbnail" && previewType !== "video")) {
    return (
      <div className="h-full w-full bg-gray-900/90">
        <UnsupportedThumbnail ext={ext} />
      </div>
    );
  }

  return <img src={src} alt={file.name} className="h-full w-full object-cover" />;
}

export function UnsupportedPreviewState({
  file,
  onOpenFile,
}: {
  file: FileItem;
  onOpenFile: () => Promise<void>;
}) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white/90 px-8 py-10 text-center shadow-lg dark:border-dark-border dark:bg-dark-surface">
      <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-bg">
        <FileTypeIcon ext={file.ext} className="h-12 w-12" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-medium text-gray-800 dark:text-gray-100">{file.name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">此文件暂不支持内置预览</p>
      </div>
      <button
        onClick={() => void onOpenFile()}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
      >
        使用默认应用打开
      </button>
    </div>
  );
}

export function TextPreviewPane({ content }: { content: string }) {
  return (
    <div className="flex h-full w-full max-w-5xl justify-center">
      <div className="h-full w-full overflow-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-dark-border dark:bg-dark-surface">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-gray-800 dark:text-gray-100">
          {content || "空文本文件"}
        </pre>
      </div>
    </div>
  );
}

export function UnsupportedThumbnail({ ext }: { ext: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-gray-800 to-gray-900 text-gray-300">
      <FileTypeIcon ext={ext} className="h-5 w-5" />
      <span className="text-[9px] font-medium">{ext.toUpperCase()}</span>
    </div>
  );
}
