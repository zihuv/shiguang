import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createCollector() {
  return {
    extractImageUrlFromDragEvent: vi.fn(() => null),
    getLastImageUrl: vi.fn(() => null),
    requestCollectImage: vi.fn(),
    showToast: vi.fn(),
    getErrorMessage: vi.fn((error) => error?.message || String(error)),
  };
}

function setupDom(preferences = {}) {
  document.body.innerHTML = "";
  window.matchMedia = vi.fn(() => ({ matches: false }));

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

async function loadDragDockScript() {
  vi.resetModules();
  const module = await import("./drag-dock");
  return module.createDragDock(createCollector());
}

describe("collector drag dock", () => {
  beforeEach(() => {
    setupDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@wxt-dev/storage");
  });

  it("does not create hidden text when hide is requested before the dock is shown", async () => {
    const dragDock = await loadDragDockScript();

    dragDock.hideDragDock(true);

    expect(document.getElementById("shiguang-drag-dock")).toBeNull();
  });

  it("removes dock text from the document flow when hidden after showing", async () => {
    const dragDock = await loadDragDockScript();

    dragDock.showDragDock("https://example.com/image.jpg");

    const root = document.getElementById("shiguang-drag-dock");
    expect(root).not.toBeNull();
    expect(root?.style.display).toBe("flex");
    expect(root).toHaveTextContent("拖到这里发送到拾光");

    dragDock.hideDragDock(true);

    expect(root?.style.display).toBe("none");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.style.userSelect).toBe("none");
  });
});
