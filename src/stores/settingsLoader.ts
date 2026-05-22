import {
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  type ShortcutActionId,
  type ShortcutConfig,
} from "@/lib/shortcuts";
import {
  DEFAULT_BROWSER_COLLECTION_ICON_ID,
  isBrowserCollectionIconId,
  type BrowserCollectionIconId,
} from "@/lib/browserCollectionIcons";
import {
  getIndexPaths,
  getRecentIndexPaths,
  getSetting,
  setSetting,
} from "@/services/desktop/indexing";
import {
  getRecommendedVisualModelPath as getRecommendedVisualModelPathCommand,
  validateVisualModelPath as validateVisualModelPathCommand,
} from "@/services/desktop/files";
import { getDeleteMode } from "@/services/desktop/trash";
import {
  clampPreviewTrackpadZoomSpeed,
  cloneAiConfig,
  cloneVisualSearchConfig,
  DEFAULT_AI_CONFIG,
  DEFAULT_DETAIL_PANEL_WIDTH,
  DEFAULT_LIBRARY_VISIBLE_FIELDS,
  DEFAULT_LIBRARY_VIEW_MODE,
  DEFAULT_LIBRARY_VIEW_SCALES,
  DEFAULT_PREVIEW_TRACKPAD_ZOOM_SPEED,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_VISUAL_SEARCH_CONFIG,
  isLibraryViewMode,
  resolveAiConfig,
  resolveLibraryViewScales,
  resolveLibraryVisibleFields,
  resolvePanelLayout,
  resolveVisualSearchConfig,
  type AiConfig,
  type LibraryVisibleField,
  type LibraryViewMode,
  type VisualSearchConfig,
} from "@/stores/settingsStore.helpers";

export const SHORTCUTS_SETTING_KEY = "shortcuts";
export const PREVIEW_TRACKPAD_ZOOM_SPEED_SETTING_KEY = "previewTrackpadZoomSpeed";
export const LIBRARY_VIEW_PREFERENCES_SETTING_KEY = "libraryViewPreferences";
export const PANEL_LAYOUT_SETTING_KEY = "panelLayout";
export const AI_CONFIG_SETTING_KEY = "aiConfig";
export const VISUAL_SEARCH_SETTING_KEY = "visualSearch";
export const AI_AUTO_ANALYZE_ON_IMPORT_SETTING_KEY = "aiAutoAnalyzeOnImport";
export const AUTO_CHECK_UPDATES_SETTING_KEY = "autoCheckUpdates";
export const BROWSER_COLLECTION_ICON_SETTING_KEY = "browserCollectionIcon";

export interface LoadedSettings {
  theme: "light" | "dark";
  indexPaths: string[];
  recentIndexPaths: string[];
  useTrash: boolean;
  aiConfig: AiConfig;
  visualSearch: VisualSearchConfig;
  autoAnalyzeOnImport: boolean;
  autoCheckUpdates: boolean;
  shortcuts: ShortcutConfig;
  previewTrackpadZoomSpeed: number;
  libraryViewMode: LibraryViewMode;
  libraryViewScales: Record<LibraryViewMode, number>;
  libraryVisibleFields: LibraryVisibleField[];
  sidebarWidth: number;
  detailPanelWidth: number;
  isSidebarCollapsed: boolean;
  isDetailPanelCollapsed: boolean;
  browserCollectionIconId: BrowserCollectionIconId;
}

async function readSettingValue(key: string) {
  try {
    return await getSetting(key);
  } catch (error) {
    console.error(`Failed to load setting ${key}:`, error);
    return null;
  }
}

async function loadTheme(): Promise<LoadedSettings["theme"]> {
  const theme = await readSettingValue("theme");
  return theme === "light" || theme === "dark" ? theme : "dark";
}

async function loadBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
  const value = await readSettingValue(key);
  if (value === null) {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

async function loadDeleteMode() {
  try {
    return await getDeleteMode();
  } catch (error) {
    console.error("Failed to load delete mode:", error);
    return true;
  }
}

async function loadIndexPaths() {
  try {
    return await getIndexPaths();
  } catch (error) {
    console.error("Failed to load index paths:", error);
    return [];
  }
}

async function loadRecentIndexPaths() {
  try {
    return await getRecentIndexPaths();
  } catch (error) {
    console.error("Failed to load recent index paths:", error);
    return [];
  }
}

async function loadAiConfig() {
  const value = await readSettingValue(AI_CONFIG_SETTING_KEY);
  if (!value) {
    return cloneAiConfig(DEFAULT_AI_CONFIG);
  }

  try {
    return resolveAiConfig(JSON.parse(value));
  } catch (error) {
    console.error("Failed to parse AI config:", error);
    return cloneAiConfig(DEFAULT_AI_CONFIG);
  }
}

async function normalizeVisualModelPath(visualSearch: VisualSearchConfig) {
  const currentModelPath = visualSearch.modelPath.trim();
  const nextModelPath = currentModelPath
    ? await validateVisualModelPathCommand(currentModelPath).then((validation) =>
        validation.valid ? validation.normalizedModelPath || currentModelPath : "",
      )
    : await getRecommendedVisualModelPathCommand();

  if (!nextModelPath || nextModelPath === currentModelPath) {
    return visualSearch;
  }

  const nextVisualSearch = { ...visualSearch, modelPath: nextModelPath };
  await setSetting(VISUAL_SEARCH_SETTING_KEY, JSON.stringify(nextVisualSearch));
  return nextVisualSearch;
}

async function loadVisualSearchConfig() {
  const value = await readSettingValue(VISUAL_SEARCH_SETTING_KEY);
  let visualSearch = cloneVisualSearchConfig(DEFAULT_VISUAL_SEARCH_CONFIG);

  if (value) {
    try {
      visualSearch = resolveVisualSearchConfig(JSON.parse(value));
    } catch (error) {
      console.error("Failed to parse visual search config:", error);
    }
  }

  try {
    return await normalizeVisualModelPath(visualSearch);
  } catch (error) {
    console.error("Failed to detect recommended visual model path:", error);
    return visualSearch;
  }
}

async function loadShortcuts() {
  const value = await readSettingValue(SHORTCUTS_SETTING_KEY);
  if (!value) {
    return { ...DEFAULT_SHORTCUTS };
  }

  try {
    return resolveShortcuts(JSON.parse(value) as Partial<Record<ShortcutActionId, string | null>>);
  } catch (error) {
    console.error("Failed to parse shortcuts:", error);
    return { ...DEFAULT_SHORTCUTS };
  }
}

async function loadPreviewTrackpadZoomSpeed() {
  const value = await readSettingValue(PREVIEW_TRACKPAD_ZOOM_SPEED_SETTING_KEY);
  return value === null
    ? DEFAULT_PREVIEW_TRACKPAD_ZOOM_SPEED
    : clampPreviewTrackpadZoomSpeed(Number.parseFloat(value));
}

async function loadLibraryViewPreferences() {
  const value = await readSettingValue(LIBRARY_VIEW_PREFERENCES_SETTING_KEY);
  if (!value) {
    return {
      libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
      libraryViewScales: { ...DEFAULT_LIBRARY_VIEW_SCALES },
      libraryVisibleFields: [...DEFAULT_LIBRARY_VISIBLE_FIELDS],
    };
  }

  try {
    const parsedPreferences = JSON.parse(value) as {
      mode?: unknown;
      scales?: Partial<Record<LibraryViewMode, unknown>>;
      visibleFields?: unknown;
      visibleFieldsVersion?: unknown;
    };
    return {
      libraryViewMode: isLibraryViewMode(parsedPreferences.mode)
        ? parsedPreferences.mode
        : DEFAULT_LIBRARY_VIEW_MODE,
      libraryViewScales: resolveLibraryViewScales(parsedPreferences.scales),
      libraryVisibleFields: resolveLibraryVisibleFields(
        parsedPreferences.visibleFields,
        parsedPreferences.visibleFieldsVersion,
      ),
    };
  } catch (error) {
    console.error("Failed to parse library view preferences:", error);
    return {
      libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
      libraryViewScales: { ...DEFAULT_LIBRARY_VIEW_SCALES },
      libraryVisibleFields: [...DEFAULT_LIBRARY_VISIBLE_FIELDS],
    };
  }
}

async function loadPanelLayout() {
  const value = await readSettingValue(PANEL_LAYOUT_SETTING_KEY);
  if (!value) {
    return {
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      detailPanelWidth: DEFAULT_DETAIL_PANEL_WIDTH,
      isSidebarCollapsed: false,
      isDetailPanelCollapsed: false,
    };
  }

  try {
    return resolvePanelLayout(JSON.parse(value));
  } catch (error) {
    console.error("Failed to parse panel layout:", error);
    return {
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      detailPanelWidth: DEFAULT_DETAIL_PANEL_WIDTH,
      isSidebarCollapsed: false,
      isDetailPanelCollapsed: false,
    };
  }
}

async function loadBrowserCollectionIconId() {
  const value = await readSettingValue(BROWSER_COLLECTION_ICON_SETTING_KEY);
  return isBrowserCollectionIconId(value) ? value : DEFAULT_BROWSER_COLLECTION_ICON_ID;
}

export async function loadSettingsSnapshot(): Promise<LoadedSettings> {
  const [
    theme,
    indexPaths,
    recentIndexPaths,
    useTrash,
    aiConfig,
    visualSearch,
    autoAnalyzeOnImport,
    autoCheckUpdates,
    shortcuts,
    previewTrackpadZoomSpeed,
    libraryViewPreferences,
    panelLayout,
    browserCollectionIconId,
  ] = await Promise.all([
    loadTheme(),
    loadIndexPaths(),
    loadRecentIndexPaths(),
    loadDeleteMode(),
    loadAiConfig(),
    loadVisualSearchConfig(),
    loadBooleanSetting(AI_AUTO_ANALYZE_ON_IMPORT_SETTING_KEY, false),
    loadBooleanSetting(AUTO_CHECK_UPDATES_SETTING_KEY, false),
    loadShortcuts(),
    loadPreviewTrackpadZoomSpeed(),
    loadLibraryViewPreferences(),
    loadPanelLayout(),
    loadBrowserCollectionIconId(),
  ]);

  return {
    theme,
    indexPaths,
    recentIndexPaths: recentIndexPaths.filter((item) => item !== (indexPaths[0] ?? null)),
    useTrash,
    aiConfig,
    visualSearch,
    autoAnalyzeOnImport,
    autoCheckUpdates,
    shortcuts,
    previewTrackpadZoomSpeed,
    ...libraryViewPreferences,
    ...panelLayout,
    browserCollectionIconId,
  };
}
