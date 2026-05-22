import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_CONFIG_SETTING_KEY,
  LIBRARY_VIEW_PREFERENCES_SETTING_KEY,
  PANEL_LAYOUT_SETTING_KEY,
  SHORTCUTS_SETTING_KEY,
  VISUAL_SEARCH_SETTING_KEY,
  loadSettingsSnapshot,
} from "@/stores/settingsLoader";
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_LIBRARY_VIEW_MODE,
  DEFAULT_LIBRARY_VIEW_SCALES,
  DEFAULT_LIBRARY_VISIBLE_FIELDS,
  DEFAULT_VISUAL_SEARCH_CONFIG,
} from "@/stores/settingsStore.helpers";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getIndexPaths: vi.fn(),
  getRecentIndexPaths: vi.fn(),
  validateVisualModelPath: vi.fn(),
  getRecommendedVisualModelPath: vi.fn(),
  getDeleteMode: vi.fn(),
}));

vi.mock("@/services/desktop/indexing", () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
  getIndexPaths: mocks.getIndexPaths,
  getRecentIndexPaths: mocks.getRecentIndexPaths,
}));

vi.mock("@/services/desktop/files", () => ({
  validateVisualModelPath: mocks.validateVisualModelPath,
  getRecommendedVisualModelPath: mocks.getRecommendedVisualModelPath,
}));

vi.mock("@/services/desktop/trash", () => ({
  getDeleteMode: mocks.getDeleteMode,
}));

describe("settingsLoader", () => {
  beforeEach(() => {
    mocks.settings.clear();
    vi.clearAllMocks();
    mocks.getSetting.mockImplementation(async (key: string) => mocks.settings.get(key) ?? null);
    mocks.setSetting.mockImplementation(async (key: string, value: string) => {
      mocks.settings.set(key, value);
    });
    mocks.getIndexPaths.mockResolvedValue(["/library/current"]);
    mocks.getRecentIndexPaths.mockResolvedValue(["/library/old", "/library/current"]);
    mocks.validateVisualModelPath.mockResolvedValue({
      valid: true,
      normalizedModelPath: "/models/current.onnx",
      modelId: "current",
    });
    mocks.getRecommendedVisualModelPath.mockResolvedValue(null);
    mocks.getDeleteMode.mockResolvedValue(true);
  });

  it("loads a coherent snapshot while falling back from malformed persisted JSON", async () => {
    mocks.settings.set("theme", "light");
    mocks.settings.set(AI_CONFIG_SETTING_KEY, "{");
    mocks.settings.set(SHORTCUTS_SETTING_KEY, "{");
    mocks.settings.set(LIBRARY_VIEW_PREFERENCES_SETTING_KEY, "{");
    mocks.settings.set(PANEL_LAYOUT_SETTING_KEY, "{");
    mocks.getRecommendedVisualModelPath.mockResolvedValue("/models/recommended.onnx");

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.theme).toBe("light");
    expect(snapshot.recentIndexPaths).toEqual(["/library/old"]);
    expect(snapshot.aiConfig).toEqual(DEFAULT_AI_CONFIG);
    expect(snapshot.visualSearch).toEqual({
      ...DEFAULT_VISUAL_SEARCH_CONFIG,
      modelPath: "/models/recommended.onnx",
    });
    expect(snapshot.libraryViewMode).toBe(DEFAULT_LIBRARY_VIEW_MODE);
    expect(snapshot.libraryViewScales).toEqual(DEFAULT_LIBRARY_VIEW_SCALES);
    expect(snapshot.libraryVisibleFields).toEqual(DEFAULT_LIBRARY_VISIBLE_FIELDS);
    expect(mocks.setSetting).toHaveBeenCalledWith(
      VISUAL_SEARCH_SETTING_KEY,
      JSON.stringify({
        ...DEFAULT_VISUAL_SEARCH_CONFIG,
        modelPath: "/models/recommended.onnx",
      }),
    );
  });

  it("persists normalized visual model paths without asking for recommendations", async () => {
    mocks.settings.set(
      VISUAL_SEARCH_SETTING_KEY,
      JSON.stringify({
        enabled: true,
        modelPath: "/models/raw.onnx",
        autoVectorizeOnImport: true,
        processUnindexedOnly: false,
      }),
    );
    mocks.validateVisualModelPath.mockResolvedValue({
      valid: true,
      normalizedModelPath: "/models/normalized.onnx",
      modelId: "normalized",
    });

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.visualSearch.modelPath).toBe("/models/normalized.onnx");
    expect(mocks.getRecommendedVisualModelPath).not.toHaveBeenCalled();
    expect(mocks.setSetting).toHaveBeenCalledWith(
      VISUAL_SEARCH_SETTING_KEY,
      expect.stringContaining("/models/normalized.onnx"),
    );
  });
});
