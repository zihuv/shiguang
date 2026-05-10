import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collector } from "../types";

function createCollector(): Collector {
  return {
    state: {
      lastCollectionPayload: null,
      lastImageUrl: null,
      lastRightClickTarget: null,
      lastSourceUrl: null,
    },
    extractImageUrlFromDragEvent: vi.fn(() => null),
    getImageUrlFromElement: vi.fn(() => null),
    getImageUrlFromPoint: vi.fn(() => null),
    getLastImageUrl: vi.fn(() => null),
    getLastSourceUrl: vi.fn(() => null),
    getLastCollectionPayload: vi.fn(() => null),
    getLastRightClickTarget: vi.fn(() => null),
    getRenderedImageDataUrl: vi.fn(() => null),
    normalizeImageUrl: vi.fn((url: unknown) => (typeof url === "string" ? url : null)),
    requestCollectImage: vi.fn(async () => ({ success: true })),
    resolveSourceUrlFromElement: vi.fn(() => null),
    resolveCollectionPayload: vi.fn(() => null),
    registerSourceUrlResolver: vi.fn(),
    setLastImageContext: vi.fn(() => null),
    showToast: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  };
}

function setupDom(preferences = {}, foldersResponse: unknown = null) {
  document.body.innerHTML = "";
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal("chrome", {
    runtime: {
      lastError: null,
      sendMessage: vi.fn((_message, callback) => {
        callback(
          foldersResponse || {
            success: true,
            default_folder_id: 1,
            folders: [{ id: 1, name: "浏览器采集", parentId: null, children: [] }],
          },
        );
      }),
    },
  });

  vi.doMock("@wxt-dev/storage", () => ({
    storage: {
      defineItem: () => ({
        key: "sync:shiguangCollectorPreferences",
        fallback: {},
        defaultValue: {},
        getValue: vi.fn(async () => preferences),
        watch: vi.fn(),
      }),
    },
  }));
}

function flushPromises() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

async function loadDragDockScript(collector = createCollector()) {
  vi.resetModules();
  const module = await import("./drag-dock");
  return {
    collector,
    dragDock: module.createDragDock(collector),
  };
}

describe("collector drag dock", () => {
  beforeEach(() => {
    setupDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@wxt-dev/storage");
    vi.unstubAllGlobals();
  });

  it("does not create hidden text when hide is requested before the dock is shown", async () => {
    const { dragDock } = await loadDragDockScript();

    dragDock.hideDragDock(true);

    expect(document.getElementById("shiguang-drag-dock")).toBeNull();
  });

  it("removes dock text from the document flow when hidden after showing", async () => {
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    expect(root).not.toBeNull();
    expect(root).toHaveClass("shiguang-drag-dock--visible");
    expect(document.getElementById("shiguang-drag-dock-style")).not.toBeNull();
    expect(root).toHaveTextContent("拖拽到这里收藏");
    expect(root).toHaveTextContent("拖到左侧或文件夹");

    dragDock.hideDragDock(true);

    expect(root).not.toHaveClass("shiguang-drag-dock--visible");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("shiguang-drag-dock");
  });

  it("hides immediately after dropping while the send continues in the background", async () => {
    let resolveSend: (value: { success: boolean }) => void = () => {};
    const collector = createCollector();
    collector.requestCollectImage = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    const { dragDock } = await loadDragDockScript(collector);

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    const leftTarget = document.querySelector<HTMLElement>(".shiguang-drag-dock__default-target");
    expect(root).toHaveClass("shiguang-drag-dock--visible");
    expect(leftTarget).not.toBeNull();

    leftTarget?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(collector.requestCollectImage).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      expect.objectContaining({
        folderId: "",
        notifyOnError: true,
        notifyOnSuccess: true,
        targetFolderResolved: true,
        waitForCompletion: false,
      }),
    );
    expect(root).not.toHaveClass("shiguang-drag-dock--visible");
    expect(root).toHaveAttribute("aria-hidden", "true");

    resolveSend({ success: true });
    await flushPromises();
    expect(collector.showToast).not.toHaveBeenCalled();
  });

  it("positions the dock to the right of the drag point when there is room", async () => {
    setViewportSize(900, 700);
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg", undefined, undefined, null, {
      clientX: 120,
      clientY: 260,
    });
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    expect(Number.parseInt(root?.style.left || "0", 10)).toBeGreaterThan(120);
    expect(Number.parseInt(root?.style.top || "0", 10)).toBeGreaterThanOrEqual(12);
  });

  it("positions the dock to the left when the right side would be clipped", async () => {
    setViewportSize(900, 700);
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg", undefined, undefined, null, {
      clientX: 820,
      clientY: 260,
    });
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    const left = Number.parseInt(root?.style.left || "0", 10);
    expect(left).toBeLessThan(820);
    expect(left).toBeGreaterThanOrEqual(12);
  });

  it("clamps the dock inside the viewport when the drag point is near the edge", async () => {
    setViewportSize(420, 260);
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg", undefined, undefined, null, {
      clientX: 405,
      clientY: 252,
    });
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    const left = Number.parseInt(root?.style.left || "0", 10);
    const top = Number.parseInt(root?.style.top || "0", 10);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(left).toBeLessThanOrEqual(68);
    expect(top).toBeLessThanOrEqual(28);
  });

  it("keeps the dock fixed after it is shown", async () => {
    setViewportSize(900, 700);
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg", undefined, undefined, null, {
      clientX: 120,
      clientY: 260,
    });
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    const initialLeft = root?.style.left;
    const initialTop = root?.style.top;

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 700 },
      clientY: { value: 620 },
    });
    root?.dispatchEvent(dragoverEvent);

    expect(root?.style.left).toBe(initialLeft);
    expect(root?.style.top).toBe(initialTop);
  });

  it("auto-scrolls the folder list while dragging near its bottom edge", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 80 },
      clientY: { value: 196 },
    });
    folderList.dispatchEvent(dragoverEvent);

    expect(folderList.scrollTop).toBeGreaterThan(0);
    dragDock.hideDragDock(true);
  });

  it("auto-scrolls the folder list upward while dragging near its top edge", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    folderList.scrollTop = 120;
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 80 },
      clientY: { value: 104 },
    });
    folderList.dispatchEvent(dragoverEvent);

    expect(folderList.scrollTop).toBeLessThan(120);
    dragDock.hideDragDock(true);
  });

  it("auto-scrolls upward when dragging over the right title area", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const rightPanel = document.querySelector<HTMLElement>(".shiguang-drag-dock__right")!;
    const rightTitle = document.querySelector<HTMLElement>(".shiguang-drag-dock__right-title")!;
    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    folderList.scrollTop = 120;
    rightPanel.getBoundingClientRect = vi.fn(() => ({
      top: 60,
      bottom: 242,
      height: 182,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 60,
      toJSON: () => ({}),
    }));
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 80 },
      clientY: { value: 80 },
    });
    rightTitle.dispatchEvent(dragoverEvent);

    expect(folderList.scrollTop).toBeLessThan(120);
    dragDock.hideDragDock(true);
  });

  it("auto-scrolls downward when dragging over the right footer area", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const rightPanel = document.querySelector<HTMLElement>(".shiguang-drag-dock__right")!;
    const rightFooter = document.querySelector<HTMLElement>(".shiguang-drag-dock__footer")!;
    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    rightPanel.getBoundingClientRect = vi.fn(() => ({
      top: 60,
      bottom: 242,
      height: 182,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 60,
      toJSON: () => ({}),
    }));
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 80 },
      clientY: { value: 228 },
    });
    rightFooter.dispatchEvent(dragoverEvent);

    expect(folderList.scrollTop).toBeGreaterThan(0);
    dragDock.hideDragDock(true);
  });

  it("does not auto-scroll when hovering over the body of the last visible folder target", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    const folderTarget = folderList.querySelector<HTMLElement>(
      '[data-shiguang-folder-target-id="19"]',
    )!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const dragoverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(dragoverEvent, {
      clientX: { value: 80 },
      clientY: { value: 184 },
    });
    folderTarget.dispatchEvent(dragoverEvent);

    expect(folderList.scrollTop).toBe(0);
    dragDock.hideDragDock(true);
  });

  it("auto-scrolls after intent is clear at the bottom edge of a folder target", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: Array.from({ length: 18 }, (_, index) => ({
          id: index + 2,
          name: `文件夹 ${index + 1}`,
          parentId: null,
          children: [],
        })),
      },
    );
    const nowSpy = vi.spyOn(window.performance, "now").mockReturnValue(0);
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const folderList = document.querySelector<HTMLElement>('[data-shiguang-folder-list="true"]')!;
    const folderTarget = folderList.querySelector<HTMLElement>(
      '[data-shiguang-folder-target-id="19"]',
    )!;
    Object.defineProperties(folderList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    folderList.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }));

    const firstDragover = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(firstDragover, {
      clientX: { value: 80 },
      clientY: { value: 196 },
    });
    folderTarget.dispatchEvent(firstDragover);

    expect(folderList.scrollTop).toBe(0);

    nowSpy.mockReturnValue(200);
    const currentFolderTarget = folderList.querySelector<HTMLElement>(
      '[data-shiguang-folder-target-id="19"]',
    )!;
    const secondDragover = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(secondDragover, {
      clientX: { value: 80 },
      clientY: { value: 197 },
    });
    currentFolderTarget.dispatchEvent(secondDragover);

    expect(folderList.scrollTop).toBeGreaterThan(0);
    dragDock.hideDragDock(true);
  });

  it("renders folder drop targets from the collector folder tree", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: [
          {
            id: 1,
            name: "浏览器采集",
            parentId: null,
            children: [{ id: 12, name: "灵感", parentId: 1, children: [] }],
          },
          { id: 42, name: "设计", parentId: null, children: [] },
        ],
      },
    );
    const { dragDock } = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const root = document.getElementById("shiguang-drag-dock");
    expect(root).toHaveTextContent("浏览器采集");
    expect(root).toHaveTextContent("灵感");
    expect(root).toHaveTextContent("设计");
  });

  it("passes the dropped folder id to image collection", async () => {
    setupDom(
      {},
      {
        success: true,
        default_folder_id: 1,
        folders: [
          { id: 1, name: "浏览器采集", parentId: null, children: [] },
          { id: 42, name: "设计", parentId: null, children: [] },
        ],
      },
    );
    const collector = createCollector();
    const { dragDock } = await loadDragDockScript(collector);

    dragDock.showDragDock("https://example.com/image.jpg");
    await flushPromises();

    const designTarget = document.querySelector<HTMLElement>('[data-shiguang-folder-id="42"]')!;
    expect(designTarget).not.toBeUndefined();

    designTarget.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(collector.requestCollectImage).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      expect.objectContaining({
        folderId: "42",
        targetFolderResolved: true,
        successMessage: "已发送到 设计",
      }),
    );
  });
});
