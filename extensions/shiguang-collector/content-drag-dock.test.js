import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setupCollectorGlobals(preferences = {}) {
  document.body.innerHTML = "";
  delete globalThis.__shiguangCollector;
  delete globalThis.__shiguangCollectorDragDock;

  window.matchMedia = vi.fn(() => ({ matches: false }));
  globalThis.chrome = {
    storage: {
      sync: {
        get: vi.fn((_key, callback) => {
          callback({ shiguangCollectorPreferences: preferences });
        }),
      },
      onChanged: {
        addListener: vi.fn(),
      },
    },
  };
  globalThis.__shiguangCollector = {
    extractImageUrlFromDragEvent: vi.fn(() => null),
    getLastImageUrl: vi.fn(() => null),
    requestCollectImage: vi.fn(),
    showToast: vi.fn(),
    getErrorMessage: vi.fn((error) => error?.message || String(error)),
  };
}

async function loadDragDockScript() {
  vi.resetModules();
  await import("./content-drag-dock.js");
  return globalThis.__shiguangCollectorDragDock;
}

describe("collector drag dock", () => {
  beforeEach(() => {
    setupCollectorGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.__shiguangCollector;
    delete globalThis.__shiguangCollectorDragDock;
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
    expect(root.style.display).toBe("flex");
    expect(root).toHaveTextContent("拖到这里发送到拾光");

    dragDock.hideDragDock(true);

    expect(root.style.display).toBe("none");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.style.userSelect).toBe("none");
  });
});
