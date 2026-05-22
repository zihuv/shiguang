import { useCallback, useEffect, useRef, useState } from "react";
import type { FileItem } from "@/stores/fileTypes";
import { type VideoPlaybackSnapshot, type VideoSeekRequest } from "@/components/video/VideoPlayer";
import { SKIP_SECONDS } from "@/components/video/videoPlayerModel";

function getVideoPlaybackSnapshotKey(file: FileItem) {
  return `${file.id}:${file.modifiedAt}:${file.size}`;
}

export function usePreviewVideoSession({
  currentFile,
  goToNext,
  goToPrev,
  isFullscreen,
  isVideo,
  previewFiles,
}: {
  currentFile: FileItem | undefined;
  goToNext: () => void;
  goToPrev: () => void;
  isFullscreen: boolean;
  isVideo: boolean;
  previewFiles: FileItem[];
}) {
  const [videoSeekRequest, setVideoSeekRequest] = useState<VideoSeekRequest | null>(null);
  const [videoPlaybackActivatedKeys, setVideoPlaybackActivatedKeys] = useState<
    Record<string, boolean>
  >({});
  const videoPlaybackSnapshotsRef = useRef<Record<string, VideoPlaybackSnapshot>>({});
  const currentVideoKey = currentFile && isVideo ? getVideoPlaybackSnapshotKey(currentFile) : null;
  const currentVideoSnapshot = currentVideoKey
    ? videoPlaybackSnapshotsRef.current[currentVideoKey]
    : undefined;
  const isVideoSeekNavigationActive =
    isFullscreen && Boolean(currentVideoKey && videoPlaybackActivatedKeys[currentVideoKey]);

  useEffect(() => {
    const activeSnapshotKeys = new Set(previewFiles.map(getVideoPlaybackSnapshotKey));
    for (const snapshotKey of Object.keys(videoPlaybackSnapshotsRef.current)) {
      if (!activeSnapshotKeys.has(snapshotKey)) {
        delete videoPlaybackSnapshotsRef.current[snapshotKey];
      }
    }
    setVideoPlaybackActivatedKeys((current) => {
      let changed = false;
      const next = { ...current };

      for (const snapshotKey of Object.keys(next)) {
        if (!activeSnapshotKeys.has(snapshotKey)) {
          delete next[snapshotKey];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [previewFiles]);

  const handleVideoPlaybackSnapshotChange = useCallback(
    (snapshot: VideoPlaybackSnapshot) => {
      if (!currentFile) {
        return;
      }

      videoPlaybackSnapshotsRef.current[getVideoPlaybackSnapshotKey(currentFile)] = snapshot;
    },
    [currentFile],
  );

  const handleVideoUserPlaybackStart = useCallback(() => {
    if (!currentVideoKey) {
      return;
    }

    setVideoPlaybackActivatedKeys((current) =>
      current[currentVideoKey] ? current : { ...current, [currentVideoKey]: true },
    );
  }, [currentVideoKey]);

  const skipCurrentVideoBy = useCallback((offset: number) => {
    setVideoSeekRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      offset,
    }));
  }, []);

  const handleFullscreenPrev = useCallback(() => {
    if (isVideoSeekNavigationActive) {
      skipCurrentVideoBy(-SKIP_SECONDS);
      return;
    }

    goToPrev();
  }, [goToPrev, isVideoSeekNavigationActive, skipCurrentVideoBy]);

  const handleFullscreenNext = useCallback(() => {
    if (isVideoSeekNavigationActive) {
      skipCurrentVideoBy(SKIP_SECONDS);
      return;
    }

    goToNext();
  }, [goToNext, isVideoSeekNavigationActive, skipCurrentVideoBy]);

  return {
    currentVideoSnapshot,
    handleFullscreenNext,
    handleFullscreenPrev,
    handleVideoPlaybackSnapshotChange,
    handleVideoUserPlaybackStart,
    isVideoSeekNavigationActive,
    skipCurrentVideoBy,
    videoSeekRequest,
  };
}
