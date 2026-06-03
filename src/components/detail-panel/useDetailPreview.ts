import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/stores/fileTypes";
import { useThumbnailRefreshStore } from "@/stores/thumbnailRefreshStore";
import {
  getFilePreviewMode,
  getFileSrc,
  getGeneratedThumbnailSrc,
  getTextPreviewContent,
  resolveThumbnailRequestMaxEdge,
} from "@/utils";

const DETAIL_PREVIEW_SRC_CACHE_LIMIT = 256;
const detailPreviewSrcCache = new Map<string, string>();

function canCacheDetailPreviewSrc(src: string) {
  return Boolean(src) && !src.startsWith("blob:") && !src.startsWith("data:");
}

function getDetailPreviewCacheKey(file: FileItem, maxEdge: number) {
  return `${file.path}:${file.modifiedAt}:${file.size}:${file.width}x${file.height}:${maxEdge}`;
}

function getCachedDetailPreviewSrc(cacheKey: string) {
  const cached = detailPreviewSrcCache.get(cacheKey);
  if (!cached) {
    return "";
  }

  detailPreviewSrcCache.delete(cacheKey);
  detailPreviewSrcCache.set(cacheKey, cached);
  return cached;
}

function cacheDetailPreviewSrc(cacheKey: string, src: string) {
  if (!canCacheDetailPreviewSrc(src)) {
    return;
  }

  detailPreviewSrcCache.delete(cacheKey);
  detailPreviewSrcCache.set(cacheKey, src);

  while (detailPreviewSrcCache.size > DETAIL_PREVIEW_SRC_CACHE_LIMIT) {
    const oldestKey = detailPreviewSrcCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    detailPreviewSrcCache.delete(oldestKey);
  }
}

export function useDetailPreview({ file, width }: { file: FileItem; width: number }) {
  const [imageState, setImageState] = useState({ cacheKey: "", src: "" });
  const [videoPosterSrc, setVideoPosterSrc] = useState("");
  const [textContent, setTextContent] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [isImageOriginalOpen, setIsImageOriginalOpen] = useState(false);
  const [isImageOriginalLoading, setIsImageOriginalLoading] = useState(false);
  const previewType = getFilePreviewMode(file.ext);
  const usesThumbnailPreview = previewType === "image" || previewType === "thumbnail";
  const thumbnailRefreshVersion = useThumbnailRefreshStore(
    (state) => state.fileVersions[file.id] ?? 0,
  );
  const imageLoadVersionRef = useRef(0);
  const previewWidth = Math.max(160, width - 28);
  const previewHeight = Math.round((previewWidth * 9) / 16);
  const previewThumbnailMaxEdge = resolveThumbnailRequestMaxEdge(previewWidth, previewHeight, {
    devicePixelRatioCap: 2,
  });
  const previewCacheKey = getDetailPreviewCacheKey(file, previewThumbnailMaxEdge);
  const imageSrc = imageState.cacheKey === previewCacheKey ? imageState.src : "";

  useEffect(() => {
    let mounted = true;
    setPreviewError(false);
    setIsImageOriginalOpen(false);
    setIsImageOriginalLoading(false);
    imageLoadVersionRef.current += 1;

    const cachedPreviewSrc = usesThumbnailPreview ? getCachedDetailPreviewSrc(previewCacheKey) : "";
    setImageState({ cacheKey: previewCacheKey, src: cachedPreviewSrc });

    if (previewType !== "video") {
      setVideoPosterSrc("");
    }

    if (previewType !== "text") {
      setTextContent("");
    }

    if (previewType === "none") {
      return () => {
        mounted = false;
      };
    }

    if (previewType === "text") {
      getTextPreviewContent(file.path, file.size).then((content) => {
        if (mounted) {
          setTextContent(content);
        }
      });

      return () => {
        mounted = false;
      };
    }

    if (usesThumbnailPreview) {
      void (async () => {
        const thumbnailFile = {
          path: file.path,
          ext: file.ext,
          width: file.width,
          height: file.height,
          size: file.size,
        };
        const thumbnailSrc = await getGeneratedThumbnailSrc(thumbnailFile, previewThumbnailMaxEdge);
        if (!mounted) {
          if (thumbnailSrc.startsWith("blob:")) {
            URL.revokeObjectURL(thumbnailSrc);
          }
          return;
        }

        if (thumbnailSrc) {
          cacheDetailPreviewSrc(previewCacheKey, thumbnailSrc);
          setImageState({ cacheKey: previewCacheKey, src: thumbnailSrc });
          return;
        }

        if (previewType !== "image") {
          setPreviewError(true);
          return;
        }

        const originalSrc = await getFileSrc(file.path);
        if (!mounted) {
          if (originalSrc.startsWith("blob:")) {
            URL.revokeObjectURL(originalSrc);
          }
          return;
        }

        if (originalSrc) {
          setImageState({ cacheKey: previewCacheKey, src: originalSrc });
          setIsImageOriginalOpen(true);
        } else {
          setPreviewError(true);
        }
      })();

      return () => {
        mounted = false;
      };
    }

    if (previewType === "video") {
      const thumbnailFile = {
        path: file.path,
        ext: file.ext,
        width: file.width,
        height: file.height,
        size: file.size,
      };
      getGeneratedThumbnailSrc(thumbnailFile, previewThumbnailMaxEdge).then((src) => {
        if (mounted && src) {
          setVideoPosterSrc(src);
        }
      });
      return () => {
        mounted = false;
      };
    }

    getFileSrc(file.path).then((src) => {
      if (!mounted) return;

      if (src) {
        setImageState({ cacheKey: previewCacheKey, src });
      } else {
        setPreviewError(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [
    file.path,
    file.size,
    file.width,
    file.height,
    previewType,
    file.ext,
    previewThumbnailMaxEdge,
    previewCacheKey,
    thumbnailRefreshVersion,
    usesThumbnailPreview,
  ]);

  useEffect(() => {
    return () => {
      if (imageSrc.startsWith("blob:")) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  useEffect(() => {
    return () => {
      if (videoPosterSrc.startsWith("blob:")) {
        URL.revokeObjectURL(videoPosterSrc);
      }
    };
  }, [videoPosterSrc]);

  const handleOpenOriginalImage = async () => {
    if (previewType !== "image" || isImageOriginalOpen || isImageOriginalLoading) {
      return;
    }

    const requestVersion = ++imageLoadVersionRef.current;
    setPreviewError(false);
    setIsImageOriginalLoading(true);

    try {
      const src = await getFileSrc(file.path);
      if (imageLoadVersionRef.current !== requestVersion) {
        if (src.startsWith("blob:")) {
          URL.revokeObjectURL(src);
        }
        return;
      }

      if (src) {
        setImageState({ cacheKey: previewCacheKey, src });
        setIsImageOriginalOpen(true);
      } else {
        setPreviewError(true);
      }
    } finally {
      if (imageLoadVersionRef.current === requestVersion) {
        setIsImageOriginalLoading(false);
      }
    }
  };

  return {
    handleOpenOriginalImage,
    imageSrc,
    isImageOriginalOpen,
    previewError,
    previewType,
    textContent,
    usesThumbnailPreview,
    videoPosterSrc,
  };
}
