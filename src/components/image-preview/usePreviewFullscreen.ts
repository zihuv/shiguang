import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isWindowFullscreen,
  listenWindowFullscreenChanged,
  setWindowFullscreen,
} from "@/services/desktop/window";

const FULLSCREEN_EVENT_TIMEOUT_MS = 2200;

function waitForWindowFullscreenEvent(expectedFullscreen: boolean) {
  return new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe?.();
      resolve();
    };

    const timeoutId = window.setTimeout(finish, FULLSCREEN_EVENT_TIMEOUT_MS);

    void listenWindowFullscreenChanged((payload) => {
      if (payload.isFullscreen === expectedFullscreen) {
        finish();
      }
    })
      .then((nextUnsubscribe) => {
        if (settled) {
          nextUnsubscribe();
          return;
        }

        unsubscribe = nextUnsubscribe;
      })
      .catch((error) => {
        console.error("Failed to wait for native fullscreen event:", error);
        finish();
      });
  });
}

export function usePreviewFullscreen({
  closePreview,
  previewMode,
}: {
  closePreview: () => void;
  previewMode: boolean;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const nativeFullscreenRestoreRef = useRef<boolean | null>(null);

  const setPreviewFullscreen = useCallback(async (enabled: boolean) => {
    if (enabled) {
      setIsFullscreen(true);

      try {
        if (nativeFullscreenRestoreRef.current === null) {
          nativeFullscreenRestoreRef.current = await isWindowFullscreen();
        }
        await setWindowFullscreen(true);
      } catch (error) {
        console.error("Failed to enter native fullscreen:", error);
        nativeFullscreenRestoreRef.current = null;
        setIsFullscreen(false);
      }
      return;
    }

    const restoreFullscreen = nativeFullscreenRestoreRef.current ?? false;

    try {
      const shouldWaitForNativeExit = !restoreFullscreen && (await isWindowFullscreen());
      const waitForNativeExit = shouldWaitForNativeExit
        ? waitForWindowFullscreenEvent(false)
        : null;

      await setWindowFullscreen(restoreFullscreen);
      await waitForNativeExit;
    } catch (error) {
      console.error("Failed to leave native fullscreen:", error);
    } finally {
      nativeFullscreenRestoreRef.current = null;
      setIsFullscreen(false);
    }
  }, []);

  const closePreviewWithFullscreenExit = useCallback(() => {
    if (isFullscreen) {
      void setPreviewFullscreen(false).finally(closePreview);
      return;
    }
    closePreview();
  }, [closePreview, isFullscreen, setPreviewFullscreen]);

  useEffect(() => {
    if (!previewMode || !isFullscreen) {
      return;
    }

    let cleanup: (() => void) | null = null;
    let disposed = false;

    void listenWindowFullscreenChanged((payload) => {
      if (!payload.isFullscreen && nativeFullscreenRestoreRef.current !== null) {
        flushSync(() => {
          nativeFullscreenRestoreRef.current = null;
          setIsFullscreen(false);
        });
      }
    })
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }
        cleanup = unsubscribe;
      })
      .catch((error) => {
        console.error("Failed to listen for native fullscreen changes:", error);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [isFullscreen, previewMode]);

  useEffect(() => {
    if (previewMode || !isFullscreen) {
      return;
    }

    void setPreviewFullscreen(false);
  }, [isFullscreen, previewMode, setPreviewFullscreen]);

  useEffect(
    () => () => {
      const restoreFullscreen = nativeFullscreenRestoreRef.current;
      if (restoreFullscreen === null) {
        return;
      }

      nativeFullscreenRestoreRef.current = null;
      void setWindowFullscreen(restoreFullscreen).catch((error) => {
        console.error("Failed to restore native fullscreen:", error);
      });
    },
    [],
  );

  return {
    closePreviewWithFullscreenExit,
    isFullscreen,
    setPreviewFullscreen,
  };
}
