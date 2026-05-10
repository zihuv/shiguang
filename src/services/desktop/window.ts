import { getDesktopBridge, listenDesktop } from "@/services/desktop/core";

export interface WindowFullscreenChangedPayload {
  isFullscreen: boolean;
}

export function setWindowFullscreen(enabled: boolean) {
  return getDesktopBridge().window.setFullscreen(enabled);
}

export function isWindowFullscreen() {
  return getDesktopBridge().window.isFullscreen();
}

export function minimizeWindow() {
  return getDesktopBridge().window.minimize();
}

export function toggleMaximizeWindow() {
  return getDesktopBridge().window.toggleMaximize();
}

export function closeWindow() {
  return getDesktopBridge().window.close();
}

export function listenWindowFullscreenChanged(
  callback: (payload: WindowFullscreenChangedPayload) => void,
) {
  return listenDesktop<WindowFullscreenChangedPayload>("window-fullscreen-changed", (event) =>
    callback(event.payload),
  );
}
