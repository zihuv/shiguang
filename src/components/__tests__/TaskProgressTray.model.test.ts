import { describe, expect, it } from "vitest";
import { getTaskProgressItem, getTaskProgressPercent } from "@/components/TaskProgressTray.model";

describe("TaskProgressTray model", () => {
  it("builds active task labels and clamps progress", () => {
    expect(
      getTaskProgressItem("ai-metadata", {
        status: "running",
        processed: 3,
        total: 10,
      }),
    ).toMatchObject({
      title: "AI 分析",
      countLabel: "3/10",
      progress: 30,
    });

    expect(getTaskProgressPercent(12, 10)).toBe(100);
    expect(getTaskProgressPercent(-1, 10)).toBe(0);
  });

  it("hides terminal tasks and shows preparing state before totals resolve", () => {
    expect(
      getTaskProgressItem("import", {
        status: "completed",
        processed: 10,
        total: 10,
      }),
    ).toBeNull();

    expect(
      getTaskProgressItem("visual-index", {
        status: "queued",
        processed: 0,
        total: 0,
        currentFileName: "photo.jpg",
      }),
    ).toMatchObject({
      countLabel: "准备中",
      detail: "photo.jpg",
      progress: 0,
    });
  });
});
