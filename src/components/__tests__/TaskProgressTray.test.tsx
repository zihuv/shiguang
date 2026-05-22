import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelAiMetadataTask,
  cancelImportTask,
  cancelVisualIndexTask,
  getAiMetadataTask,
  getImportTask,
  getVisualIndexTask,
  startAiMetadataTask,
  startImportTask,
  startVisualIndexTask,
  listenDesktop,
} = vi.hoisted(() => ({
  cancelAiMetadataTask: vi.fn(),
  cancelImportTask: vi.fn(),
  cancelVisualIndexTask: vi.fn(),
  getAiMetadataTask: vi.fn(),
  getImportTask: vi.fn(),
  getVisualIndexTask: vi.fn(),
  startAiMetadataTask: vi.fn(),
  startImportTask: vi.fn(),
  startVisualIndexTask: vi.fn(),
  listenDesktop: vi.fn(),
}));

vi.mock("@/services/desktop/files", () => ({
  cancelAiMetadataTask,
  cancelImportTask,
  cancelVisualIndexTask,
  getAiMetadataTask,
  getImportTask,
  getVisualIndexTask,
  startAiMetadataTask,
  startImportTask,
  startVisualIndexTask,
}));

vi.mock("@/services/desktop/core", () => ({
  getErrorMessage: (error: unknown) => String(error),
  listenDesktop,
}));

const [
  { default: TaskProgressTray },
  { useAiBatchAnalyzeStore },
  { useImportStore },
  { useVisualIndexTaskStore },
] = await Promise.all([
  import("@/components/TaskProgressTray"),
  import("@/stores/aiBatchAnalyzeStore"),
  import("@/stores/importStore"),
  import("@/stores/visualIndexTaskStore"),
]);

describe("TaskProgressTray", () => {
  beforeEach(() => {
    cancelAiMetadataTask.mockReset();
    cancelImportTask.mockReset();
    cancelVisualIndexTask.mockReset();
    listenDesktop.mockReset();
    useImportStore.setState({ importTask: null });
    useAiBatchAnalyzeStore.setState({ aiMetadataTask: null });
    useVisualIndexTaskStore.setState({ visualIndexTask: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders active import, AI, and vector tasks", () => {
    useImportStore.setState({
      importTask: {
        id: "import-1",
        status: "running",
        total: 10,
        processed: 4,
        successCount: 4,
        failureCount: 0,
        results: [],
      },
    });
    useAiBatchAnalyzeStore.setState({
      aiMetadataTask: {
        id: "ai-1",
        status: "running",
        total: 3,
        processed: 1,
        successCount: 1,
        failureCount: 0,
        results: [],
      },
    });
    useVisualIndexTaskStore.setState({
      visualIndexTask: {
        id: "visual-1",
        status: "running",
        total: 8,
        processed: 2,
        indexedCount: 2,
        failureCount: 0,
        skippedCount: 0,
        currentFileId: 42,
        currentFileName: "poster.jpg",
        processUnindexedOnly: true,
      },
    });

    render(<TaskProgressTray />);

    expect(screen.getByText("导入")).toBeInTheDocument();
    expect(screen.getByText("4/10")).toBeInTheDocument();
    expect(screen.getByText("AI 分析")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("向量计算")).toBeInTheDocument();
    expect(screen.getByText("poster.jpg")).toBeInTheDocument();
  });

  it("cancels the selected task through its store", async () => {
    const user = userEvent.setup();
    useImportStore.setState({
      importTask: {
        id: "import-1",
        status: "running",
        total: 10,
        processed: 4,
        successCount: 4,
        failureCount: 0,
        results: [],
      },
    });

    render(<TaskProgressTray />);
    await user.click(screen.getByRole("button", { name: "取消导入" }));

    expect(cancelImportTask).toHaveBeenCalledWith("import-1");
  });

  it("stays hidden when all tasks are terminal", () => {
    useImportStore.setState({
      importTask: {
        id: "import-1",
        status: "completed",
        total: 10,
        processed: 10,
        successCount: 10,
        failureCount: 0,
        results: [],
      },
    });

    const { container } = render(<TaskProgressTray />);

    expect(container).toBeEmptyDOMElement();
  });
});
