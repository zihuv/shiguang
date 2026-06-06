import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportTaskSnapshot } from "@/stores/fileTypes";

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
  cancelImportTask: vi.fn(),
  getImportTask: vi.fn(),
  startImportTask: vi.fn(),
}));

const { notifyImportTaskResult } = await import("@/stores/importStore");

function createImportTaskSnapshot(patch: Partial<ImportTaskSnapshot> = {}): ImportTaskSnapshot {
  return {
    id: "import-1",
    status: "completed",
    total: 3,
    processed: 3,
    successCount: 3,
    failureCount: 0,
    results: [],
    ...patch,
  };
}

describe("notifyImportTaskResult", () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("stays quiet after all files import", () => {
    notifyImportTaskResult(createImportTaskSnapshot());

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows one failure summary when some files fail", () => {
    notifyImportTaskResult(
      createImportTaskSnapshot({
        status: "completed_with_errors",
        successCount: 2,
        failureCount: 1,
      }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("有 1 个素材导入失败");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows one failure summary when no files import", () => {
    notifyImportTaskResult(
      createImportTaskSnapshot({
        status: "completed_with_errors",
        successCount: 0,
        failureCount: 3,
      }),
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("有 3 个素材导入失败");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
