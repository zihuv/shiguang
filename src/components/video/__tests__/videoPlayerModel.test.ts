import { describe, expect, it } from "vitest";
import {
  clampTime,
  clampVolume,
  formatVideoTime,
  getProgressPercent,
} from "@/components/video/videoPlayerModel";

describe("videoPlayerModel", () => {
  it("formats video times for short and long durations", () => {
    expect(formatVideoTime(Number.NaN)).toBe("0:00");
    expect(formatVideoTime(-1)).toBe("0:00");
    expect(formatVideoTime(4.9)).toBe("0:04");
    expect(formatVideoTime(65)).toBe("1:05");
    expect(formatVideoTime(3661)).toBe("1:01:01");
  });

  it("clamps seek time with and without a known duration", () => {
    expect(clampTime(-5, 120)).toBe(0);
    expect(clampTime(150, 120)).toBe(120);
    expect(clampTime(42, Number.NaN)).toBe(42);
    expect(clampTime(-2, 0)).toBe(0);
  });

  it("clamps volume and progress percentages", () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(2)).toBe(1);

    expect(getProgressPercent(25, 100)).toBe(25);
    expect(getProgressPercent(-5, 100)).toBe(0);
    expect(getProgressPercent(150, 100)).toBe(100);
    expect(getProgressPercent(25, 0)).toBe(0);
  });
});
