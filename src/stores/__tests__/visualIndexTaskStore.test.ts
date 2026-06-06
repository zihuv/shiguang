import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisualIndexTaskSnapshot } from "@/stores/fileTypes";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@/services/desktop/files", () => ({
  cancelVisualIndexTask: vi.fn(),
  getVisualIndexTask: vi.fn(),
  startVisualIndexTask: vi.fn(),
}));

vi.mock("@/services/desktop/core", () => ({
  getErrorMessage: (error: unknown) => String(error),
  listenDesktop: vi.fn(),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      refreshVisualSearchStatus: vi.fn(),
    }),
  },
}));

const { notifyVisualIndexTaskResult } = await import("@/stores/visualIndexTaskStore");

function createVisualIndexTaskSnapshot(
  patch: Partial<VisualIndexTaskSnapshot> = {},
): VisualIndexTaskSnapshot {
  return {
    id: "visual-index-1",
    status: "completed",
    total: 1,
    processed: 1,
    indexedCount: 1,
    failureCount: 0,
    skippedCount: 0,
    currentFileId: null,
    currentFileName: null,
    processUnindexedOnly: true,
    origin: "manual",
    ...patch,
  };
}

describe("notifyVisualIndexTaskResult", () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("does not toast automatic background indexing results", () => {
    notifyVisualIndexTaskResult(createVisualIndexTaskSnapshot({ origin: "auto" }));

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("stays quiet after manual visual indexing succeeds", () => {
    notifyVisualIndexTaskResult(createVisualIndexTaskSnapshot());

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows manual visual indexing failures", () => {
    notifyVisualIndexTaskResult(
      createVisualIndexTaskSnapshot({
        status: "completed_with_errors",
        indexedCount: 2,
        failureCount: 1,
        total: 3,
      }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("未索引图片处理有 1 张处理失败");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
