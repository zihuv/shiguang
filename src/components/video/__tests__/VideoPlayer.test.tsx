import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { HOVER_PREVIEW_DELAY_MS } from "@/components/video/videoPlayerModel";

function mockElementRect(element: HTMLElement, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.bottom ?? 0,
      height: rect.height ?? 0,
      left: rect.left ?? 0,
      right: rect.right ?? 0,
      top: rect.top ?? 0,
      width: rect.width ?? 0,
      x: rect.x ?? rect.left ?? 0,
      y: rect.y ?? rect.top ?? 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function mockProgressTrackRect(track: HTMLElement) {
  mockElementRect(track, {
    bottom: 8,
    height: 8,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
  });
}

function mockPlayerAndProgressRects(player: HTMLElement, track: HTMLElement) {
  mockElementRect(player, {
    bottom: 320,
    height: 320,
    left: 0,
    right: 960,
    top: 0,
    width: 960,
  });
  mockElementRect(track, {
    bottom: 292,
    height: 8,
    left: 164,
    right: 844,
    top: 284,
    width: 680,
  });
}

function getProgressTrack() {
  const progressInput = screen.getByRole("slider", { name: "播放进度" });
  const progressTrack = progressInput.parentElement;

  expect(progressTrack).not.toBeNull();
  return progressTrack!;
}

function getHoverPreview(container: HTMLElement) {
  const hoverPreview = container.querySelector<HTMLElement>("[data-video-hover-preview]");

  expect(hoverPreview).not.toBeNull();
  return hoverPreview!;
}

function parsePixelValue(value: string) {
  return Number.parseFloat(value.replace("px", ""));
}

function mockHoverVideoMetadata(video: HTMLVideoElement) {
  Object.defineProperty(video, "duration", { configurable: true, value: 100 });
  Object.defineProperty(video, "readyState", { configurable: true, value: 1 });
}

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("updates hover preview seeking with the latest pointer position while moving", () => {
    const { container } = render(
      <VideoPlayer src="shiguang-file://asset/clip.mp4" initialDuration={100} />,
    );
    const progressTrack = getProgressTrack();
    mockProgressTrackRect(progressTrack);

    act(() => {
      fireEvent.pointerMove(progressTrack, { clientX: 20 });
    });

    const hoverVideo = container.querySelectorAll("video")[1] as HTMLVideoElement | undefined;
    expect(hoverVideo).toBeDefined();
    mockHoverVideoMetadata(hoverVideo!);

    act(() => {
      vi.advanceTimersByTime(HOVER_PREVIEW_DELAY_MS / 2);
      fireEvent.pointerMove(progressTrack, { clientX: 60 });
      vi.advanceTimersByTime(HOVER_PREVIEW_DELAY_MS / 2);
    });

    expect(hoverVideo!.currentTime).toBe(60);
  });

  it("centers the hover preview over the pointer when there is player space beside the track", () => {
    const { container } = render(
      <VideoPlayer src="shiguang-file://asset/clip.mp4" initialDuration={100} />,
    );
    const player = container.querySelector<HTMLElement>("[data-video-player]");
    const progressTrack = getProgressTrack();

    expect(player).not.toBeNull();
    mockPlayerAndProgressRects(player!, progressTrack);

    act(() => {
      fireEvent.pointerMove(progressTrack, { clientX: 164 });
    });

    const hoverPreview = getHoverPreview(container);

    expect(parsePixelValue(hoverPreview.style.left)).toBeCloseTo(0);
  });
});
