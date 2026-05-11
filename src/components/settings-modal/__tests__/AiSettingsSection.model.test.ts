import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_INTRA_THREADS,
  getCustomIntraThreadsInputValue,
  getIntraThreadsMode,
  getPercent,
  getVisualModelDownloadCountLabel,
  parseOptionalPositiveInteger,
  resolveCustomIntraThreadsValue,
  THREAD_MODE_AUTO,
  THREAD_MODE_CUSTOM,
} from "@/components/settings-modal/AiSettingsSection.model";
import type { VisualModelDownloadSnapshot } from "@/shared/desktop-types";

describe("AiSettingsSection model", () => {
  it("parses optional positive integer input", () => {
    expect(parseOptionalPositiveInteger(" 8 ")).toBe(8);
    expect(parseOptionalPositiveInteger("")).toBeNull();
    expect(parseOptionalPositiveInteger("0")).toBeNull();
    expect(parseOptionalPositiveInteger("-2")).toBeNull();
    expect(parseOptionalPositiveInteger("abc")).toBeNull();
  });

  it("derives intra-thread mode and fallback input values", () => {
    expect(getIntraThreadsMode("auto")).toBe(THREAD_MODE_AUTO);
    expect(getIntraThreadsMode(6)).toBe(THREAD_MODE_CUSTOM);
    expect(getCustomIntraThreadsInputValue("auto")).toBe(String(DEFAULT_CUSTOM_INTRA_THREADS));
    expect(getCustomIntraThreadsInputValue(6)).toBe("6");
  });

  it("resolves custom thread input without discarding the current numeric value", () => {
    expect(resolveCustomIntraThreadsValue(" 9 ", "auto")).toBe(9);
    expect(resolveCustomIntraThreadsValue("", 6)).toBe(6);
    expect(resolveCustomIntraThreadsValue("", "auto")).toBe(DEFAULT_CUSTOM_INTRA_THREADS);
  });

  it("normalizes progress and download file count labels", () => {
    expect(getPercent(25, 100)).toBe(25);
    expect(getPercent(120, 100)).toBe(100);
    expect(getPercent(10, 0)).toBe(0);
    expect(getPercent(undefined, undefined)).toBe(0);

    const task = {
      completedFiles: 3,
      totalFiles: 0,
    } as VisualModelDownloadSnapshot;
    expect(getVisualModelDownloadCountLabel(task)).toBe("3/0");
    expect(getVisualModelDownloadCountLabel(null)).toBe("0/0");
  });
});
