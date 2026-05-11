export const SKIP_SECONDS = 5;
export const HOVER_PREVIEW_DELAY_MS = 90;
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function formatVideoTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function clampTime(value: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, value);
  }

  return Math.max(0, Math.min(duration, value));
}

export function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getProgressPercent(currentTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}
