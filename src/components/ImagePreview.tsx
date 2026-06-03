import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { copyFilesToClipboard } from "@/lib/clipboard";
import { flattenFolders } from "@/components/image-preview/constants";
import { PreviewContextMenuContent } from "@/components/image-preview/PreviewContextMenu";
import {
  TextPreviewPane,
  UnsupportedPreviewState,
} from "@/components/image-preview/PreviewHelpers";
import {
  DEFAULT_IMAGE_TRANSFORM,
  getContainedImageLayout,
  getImageTransformValue,
  rotateImageTransform,
  type ImageTransformState,
} from "@/components/image-preview/imageTransform";
import {
  FullscreenPreviewShell,
  StandardPreviewShell,
} from "@/components/image-preview/PreviewShells";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { SKIP_SECONDS } from "@/components/video/videoPlayerModel";
import { usePreviewSource } from "@/components/image-preview/usePreviewSource";
import { usePreviewFullscreen } from "@/components/image-preview/usePreviewFullscreen";
import { usePreviewVideoSession } from "@/components/image-preview/usePreviewVideoSession";
import { usePreviewZoomPan } from "@/components/image-preview/usePreviewZoomPan";
import { getErrorMessage } from "@/services/desktop/core";
import { updateFileDimensions } from "@/services/desktop/files";
import { openFile, showInExplorer } from "@/services/desktop/system";
import { canAnalyzeImageMetadata } from "@/shared/file-formats";
import { useFolderStore } from "@/stores/folderStore";
import type { FileItem } from "@/stores/fileTypes";
import { useLibraryQueryStore } from "@/stores/libraryQueryStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTrashStore } from "@/stores/trashStore";
import { getFilePreviewMode, isVideoFile } from "@/utils";

function formatUnsupportedAiFormat(file: FileItem) {
  return `不支持格式：${(file.ext || "未知").toUpperCase()}`;
}

function formatAiAnalyzeError(error: unknown) {
  const message = getErrorMessage(error);
  return message.startsWith("不支持格式") ? message : `AI 分析失败: ${message}`;
}

export default function ImagePreview() {
  const previewMode = usePreviewStore((state) => state.previewMode);
  const previewIndex = usePreviewStore((state) => state.previewIndex);
  const previewFiles = usePreviewStore((state) => state.previewFiles);
  const setPreviewIndex = usePreviewStore((state) => state.setPreviewIndex);
  const closePreview = usePreviewStore((state) => state.closePreview);
  const setSelectedFile = useSelectionStore((state) => state.setSelectedFile);
  const moveFiles = useLibraryQueryStore((state) => state.moveFiles);
  const copyFiles = useLibraryQueryStore((state) => state.copyFiles);
  const analyzeFileMetadata = useLibraryQueryStore((state) => state.analyzeFileMetadata);
  const touchFileLastAccessed = useLibraryQueryStore((state) => state.touchFileLastAccessed);
  const deleteFile = useTrashStore((state) => state.deleteFile);

  const { folders } = useFolderStore();
  const previewTrackpadZoomSpeed = useSettingsStore((state) => state.previewTrackpadZoomSpeed);

  const [imageTransform, setImageTransform] =
    useState<ImageTransformState>(DEFAULT_IMAGE_TRANSFORM);
  const lastMenuActionRef = useRef<{ key: string; timestamp: number } | null>(null);
  const persistedDimensionsRef = useRef<Record<number, string>>({});
  const { closePreviewWithFullscreenExit, isFullscreen, setPreviewFullscreen } =
    usePreviewFullscreen({
      closePreview,
      previewMode,
    });

  const currentFile = previewFiles[previewIndex];
  const previewType = currentFile ? getFilePreviewMode(currentFile.ext) : "none";
  const isVideo = currentFile ? isVideoFile(currentFile.ext) : false;
  const isImageLike = previewType === "image" || previewType === "thumbnail";
  const canAnalyzeWithAi = currentFile ? canAnalyzeImageMetadata(currentFile.ext) : false;
  const {
    imageSrc,
    textContent,
    imageError,
    isPlaceholderImageSrc,
    isLoading,
    loadedImageSize,
    setLoadedImageSize,
  } = usePreviewSource({
    currentFile,
    previewFiles,
    previewIndex,
    previewMode,
    previewType,
  });
  const {
    viewportRef,
    viewportSize,
    supportsZoom,
    isFitMode,
    canPanImage,
    isPanning,
    scaledImageWidth,
    scaledImageHeight,
    handleZoomOut,
    handleZoomIn,
    handleFitToView,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePreviewZoomPan({
    currentFile,
    loadedImageSize,
    isFullscreen,
    isImageLike,
    previewIndex,
    previewMode,
    previewTrackpadZoomSpeed,
  });

  const handleCopyFileToClipboard = useCallback(async () => {
    try {
      await copyFilesToClipboard([currentFile.id]);
    } catch (error) {
      console.error("Failed to copy file to clipboard:", error);
    }
  }, [currentFile]);

  const handleAnalyzeMetadata = async () => {
    if (!currentFile || !canAnalyzeWithAi) {
      toast.error(
        currentFile ? formatUnsupportedAiFormat(currentFile) : "当前仅支持对图片执行 AI 分析",
      );
      return;
    }

    const loadingToast = toast.loading("AI 分析中...");
    try {
      await analyzeFileMetadata(currentFile.id);
      toast.dismiss(loadingToast);
    } catch (error) {
      console.error("Failed to analyze file metadata:", error);
      toast.error(formatAiAnalyzeError(error), { id: loadingToast });
    }
  };

  useEffect(() => {
    if (currentFile) {
      setSelectedFile(currentFile);
    }
  }, [currentFile, previewIndex, setSelectedFile]);

  useEffect(() => {
    setImageTransform(DEFAULT_IMAGE_TRANSFORM);
  }, [currentFile?.id]);

  useEffect(() => {
    if (!currentFile?.id) {
      return;
    }

    void touchFileLastAccessed(currentFile.id);
  }, [currentFile?.id, touchFileLastAccessed]);

  const goToPrev = useCallback(() => {
    if (previewIndex > 0) {
      setPreviewIndex(previewIndex - 1);
    }
  }, [previewIndex, setPreviewIndex]);

  const goToNext = useCallback(() => {
    if (previewIndex < previewFiles.length - 1) {
      setPreviewIndex(previewIndex + 1);
    }
  }, [previewFiles.length, previewIndex, setPreviewIndex]);

  const {
    currentVideoSnapshot,
    handleFullscreenNext,
    handleFullscreenPrev,
    handleVideoPlaybackSnapshotChange,
    handleVideoUserPlaybackStart,
    isVideoSeekNavigationActive,
    skipCurrentVideoBy,
    videoSeekRequest,
  } = usePreviewVideoSession({
    currentFile,
    goToNext,
    goToPrev,
    isFullscreen,
    isVideo,
    previewFiles,
  });

  useEffect(() => {
    if (!previewMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const eventTarget = event.target as HTMLElement | null;
      const isVideoPlayerTarget = Boolean(eventTarget?.closest("[data-video-player]"));

      if (
        isVideoPlayerTarget &&
        [" ", "Enter", "ArrowLeft", "ArrowRight", "k", "K", "m", "M"].includes(event.key)
      ) {
        return;
      }

      switch (event.key) {
        case "Escape":
          if (isFullscreen) {
            void setPreviewFullscreen(false);
          } else {
            closePreviewWithFullscreenExit();
          }
          break;
        case "ArrowLeft":
          if (isVideoSeekNavigationActive) {
            skipCurrentVideoBy(-SKIP_SECONDS);
          } else {
            goToPrev();
          }
          break;
        case "ArrowRight":
          if (isVideoSeekNavigationActive) {
            skipCurrentVideoBy(SKIP_SECONDS);
          } else {
            goToNext();
          }
          break;
        case "f":
        case "F":
          if (previewType !== "none") {
            void setPreviewFullscreen(!isFullscreen);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closePreviewWithFullscreenExit,
    goToNext,
    goToPrev,
    isFullscreen,
    isVideoSeekNavigationActive,
    previewMode,
    previewType,
    setPreviewFullscreen,
    skipCurrentVideoBy,
  ]);

  const flatFolders = flattenFolders(folders);

  const handleOpenFile = async () => {
    try {
      await openFile(currentFile.id);
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  const handleShowInExplorer = async () => {
    try {
      await showInExplorer(currentFile.id);
    } catch (error) {
      console.error("Failed to open directory:", error);
    }
  };

  const dismissContextMenu = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  const triggerMenuAction = (key: string, action: () => void | Promise<void>) => {
    const now = Date.now();
    const lastAction = lastMenuActionRef.current;
    if (lastAction && lastAction.key === key && now - lastAction.timestamp < 250) {
      return;
    }

    lastMenuActionRef.current = { key, timestamp: now };
    dismissContextMenu();
    void action();
  };

  const handleCopyFile = async (targetFolderId: number | null) => {
    try {
      await copyFiles([currentFile.id], targetFolderId);
    } catch (error) {
      console.error("Failed to copy file:", error);
      toast.error(`复制文件失败: ${String(error)}`);
    }
  };

  const handleMoveFile = async (targetFolderId: number | null) => {
    try {
      await moveFiles([currentFile.id], targetFolderId);
    } catch (error) {
      console.error("Failed to move file:", error);
      toast.error(`移动文件失败: ${String(error)}`);
    }
  };

  const handleDeleteFile = async () => {
    try {
      await deleteFile(currentFile.id);
      closePreviewWithFullscreenExit();
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const toggleFullscreen = () => {
    void setPreviewFullscreen(!isFullscreen);
  };

  const handleRotateLeft = useCallback(() => {
    setImageTransform((current) => rotateImageTransform(current, -90));
  }, []);

  const hydrateCurrentFileDimensions = useCallback(
    (width: number, height: number) => {
      if (!currentFile || width <= 0 || height <= 0) return;

      setLoadedImageSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });

      if (currentFile.width === width && currentFile.height === height) {
        return;
      }

      const patch = { width, height };

      usePreviewStore.setState((state) => ({
        previewFiles: state.previewFiles.map((file) =>
          file.id === currentFile.id ? { ...file, ...patch } : file,
        ),
      }));

      useLibraryQueryStore.setState((state) => ({
        files: state.files.map((file) =>
          file.id === currentFile.id ? { ...file, ...patch } : file,
        ),
      }));

      const { selectedFile } = useSelectionStore.getState();
      if (selectedFile?.id === currentFile.id) {
        useSelectionStore.getState().setSelectedFile({
          ...selectedFile,
          ...patch,
        });
      }

      const persistedKey = `${width}x${height}`;
      if (
        (currentFile.width <= 0 || currentFile.height <= 0) &&
        persistedDimensionsRef.current[currentFile.id] !== persistedKey
      ) {
        persistedDimensionsRef.current[currentFile.id] = persistedKey;
        void updateFileDimensions({
          fileId: currentFile.id,
          width,
          height,
        }).catch((error) => {
          console.error("Failed to persist file dimensions:", error);
          delete persistedDimensionsRef.current[currentFile.id];
        });
      }
    },
    [currentFile, setLoadedImageSize],
  );

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const target = event.currentTarget;

      if (previewType === "thumbnail") {
        setLoadedImageSize((current) => {
          if (current.width === target.naturalWidth && current.height === target.naturalHeight) {
            return current;
          }
          return { width: target.naturalWidth, height: target.naturalHeight };
        });
        return;
      }

      if (isPlaceholderImageSrc) {
        return;
      }

      hydrateCurrentFileDimensions(target.naturalWidth, target.naturalHeight);
    },
    [hydrateCurrentFileDimensions, isPlaceholderImageSrc, previewType, setLoadedImageSize],
  );

  if (!previewMode || !currentFile) return null;

  const totalFiles = previewFiles.length;
  const currentNum = previewIndex + 1;
  const canGoPrev = previewIndex > 0;
  const canGoNext = previewIndex < totalFiles - 1;
  const canTransformImage = supportsZoom && Boolean(imageSrc) && !imageError;
  const imageNaturalWidth =
    currentFile.width > 0
      ? currentFile.width
      : loadedImageSize.width > 0
        ? loadedImageSize.width
        : 0;
  const imageNaturalHeight =
    currentFile.height > 0
      ? currentFile.height
      : loadedImageSize.height > 0
        ? loadedImageSize.height
        : 0;
  const fitImagePadding = isFullscreen ? 0 : 32;
  const fitImageLayout = getContainedImageLayout({
    containerHeight: Math.max(1, viewportSize.height - fitImagePadding),
    containerWidth: Math.max(1, viewportSize.width - fitImagePadding),
    imageHeight: imageNaturalHeight,
    imageWidth: imageNaturalWidth,
    rotation: imageTransform.rotation,
  });
  const scaledImageBounds =
    scaledImageWidth !== null && scaledImageHeight !== null
      ? { width: scaledImageWidth, height: scaledImageHeight }
      : null;
  const imageTransformValue = getImageTransformValue(imageTransform);

  const renderedPreviewContent = isLoading ? (
    <div className="h-full min-h-full" />
  ) : imageError ? (
    <div className="flex h-full min-h-full flex-col items-center justify-center p-4 text-gray-400">
      <svg className="mb-2 h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <p>无法加载预览</p>
    </div>
  ) : previewType === "none" ? (
    <div className="flex h-full min-h-full items-center justify-center p-4">
      <UnsupportedPreviewState file={currentFile} onOpenFile={handleOpenFile} />
    </div>
  ) : previewType === "text" ? (
    <TextPreviewPane content={textContent} />
  ) : imageSrc ? (
    isVideo ? (
      <div
        className={`flex h-full min-h-full items-center justify-center ${isFullscreen ? "p-0" : "p-4"}`}
      >
        <VideoPlayer
          src={imageSrc}
          fit={isFullscreen ? "cover" : "contain"}
          initialCurrentTime={currentVideoSnapshot?.currentTime}
          initialDuration={currentVideoSnapshot?.duration}
          initialIsMuted={currentVideoSnapshot?.isMuted}
          initialIsPlaying={currentVideoSnapshot?.isPlaying}
          initialPlaybackRate={currentVideoSnapshot?.playbackRate}
          initialVolume={currentVideoSnapshot?.volume}
          isFullscreen={isFullscreen}
          onPlaybackSnapshotChange={handleVideoPlaybackSnapshotChange}
          onToggleFullscreen={toggleFullscreen}
          onUserPlaybackStart={handleVideoUserPlaybackStart}
          seekRequest={videoSeekRequest}
          className={`max-h-full bg-black ${
            isFullscreen ? "h-full w-full max-w-full" : "w-full max-w-5xl rounded-lg shadow-lg"
          }`}
        />
      </div>
    ) : isImageLike ? (
      isFitMode || scaledImageWidth === null || scaledImageHeight === null ? (
        <div
          className={`flex h-full min-h-full items-center justify-center ${isFullscreen ? "p-0" : "p-4"}`}
        >
          {fitImageLayout ? (
            <div
              className="grid place-items-center"
              style={{
                height: `${fitImageLayout.boundsHeight}px`,
                width: `${fitImageLayout.boundsWidth}px`,
              }}
            >
              <img
                src={imageSrc}
                alt={currentFile.name}
                className="block cursor-grab select-none active:cursor-grabbing"
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  height: `${fitImageLayout.imageHeight}px`,
                  transform: imageTransformValue,
                  transformOrigin: "center",
                  width: `${fitImageLayout.imageWidth}px`,
                }}
              />
            </div>
          ) : (
            <img
              src={imageSrc}
              alt={currentFile.name}
              className="max-h-full max-w-full cursor-grab select-none object-contain active:cursor-grabbing"
              onLoad={handleImageLoad}
              draggable={false}
              style={{ transform: imageTransformValue, transformOrigin: "center" }}
            />
          )}
        </div>
      ) : (
        <div
          className="grid place-items-center"
          style={{
            width: `${scaledImageBounds?.width ?? scaledImageWidth}px`,
            height: `${scaledImageBounds?.height ?? scaledImageHeight}px`,
            minWidth: "100%",
            minHeight: "100%",
          }}
        >
          <img
            src={imageSrc}
            alt={currentFile.name}
            draggable={false}
            className="block select-none"
            onLoad={handleImageLoad}
            style={{
              width: `${scaledImageWidth}px`,
              height: `${scaledImageHeight}px`,
              transform: imageTransformValue,
              transformOrigin: "center",
            }}
          />
        </div>
      )
    ) : null
  ) : null;

  const previewContextMenu = (
    <PreviewContextMenuContent
      flatFolders={flatFolders}
      canAnalyzeWithAi={canAnalyzeWithAi}
      triggerMenuAction={triggerMenuAction}
      onOpenFile={handleOpenFile}
      onShowInExplorer={handleShowInExplorer}
      onCopyFileToClipboard={handleCopyFileToClipboard}
      onAnalyzeMetadata={handleAnalyzeMetadata}
      onCopyFile={handleCopyFile}
      onMoveFile={handleMoveFile}
      onDeleteFile={handleDeleteFile}
    />
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <FullscreenPreviewShell
        currentNum={currentNum}
        totalFiles={totalFiles}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        supportsZoom={supportsZoom}
        previewType={previewType}
        isFitMode={isFitMode}
        canTransformImage={canTransformImage}
        canPanImage={canPanImage}
        isPanning={isPanning}
        viewportRef={viewportRef}
        renderedPreviewContent={renderedPreviewContent}
        previewContextMenu={previewContextMenu}
        onZoomOut={handleZoomOut}
        onZoomIn={handleZoomIn}
        onFitToView={handleFitToView}
        onRotateLeft={handleRotateLeft}
        onToggleFullscreen={toggleFullscreen}
        onGoPrev={handleFullscreenPrev}
        onGoNext={handleFullscreenNext}
        useVideoSeekNavigation={isVideoSeekNavigationActive}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />,
      document.body,
    );
  }

  return (
    <StandardPreviewShell
      currentFileName={currentFile.name}
      currentNum={currentNum}
      totalFiles={totalFiles}
      canGoPrev={canGoPrev}
      canGoNext={canGoNext}
      supportsZoom={supportsZoom}
      previewType={previewType}
      isFullscreen={isFullscreen}
      isFitMode={isFitMode}
      canTransformImage={canTransformImage}
      canPanImage={canPanImage}
      isPanning={isPanning}
      viewportRef={viewportRef}
      renderedPreviewContent={renderedPreviewContent}
      previewContextMenu={previewContextMenu}
      previewFiles={previewFiles}
      previewIndex={previewIndex}
      onZoomOut={handleZoomOut}
      onZoomIn={handleZoomIn}
      onFitToView={handleFitToView}
      onRotateLeft={handleRotateLeft}
      onToggleFullscreen={toggleFullscreen}
      onClose={closePreviewWithFullscreenExit}
      onGoPrev={goToPrev}
      onGoNext={goToNext}
      onSelectPreviewIndex={setPreviewIndex}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
