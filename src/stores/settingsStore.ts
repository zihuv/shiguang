import { create } from "zustand";
import { DEFAULT_SHORTCUTS, type ShortcutActionId, type ShortcutConfig } from "@/lib/shortcuts";
import {
  DEFAULT_BROWSER_COLLECTION_ICON_ID,
  type BrowserCollectionIconId,
} from "@/lib/browserCollectionIcons";
import { useFolderStore } from "@/stores/folderStore";
import { useLibraryQueryStore } from "@/stores/libraryQueryStore";
import {
  clampDetailPanelWidth,
  clampLibraryViewScale,
  clampPreviewTrackpadZoomSpeed,
  clampSidebarWidth,
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
  isSharedTileViewMode,
  serializeLibraryViewPreferences,
  serializePanelLayout,
  type AiConfig,
  type AiConfigTarget,
  type AiServiceConfig,
  type LibraryVisibleField,
  type LibraryViewMode,
  type VisualSearchConfig,
  type VisualSearchRuntimeConfig,
} from "@/stores/settingsStore.helpers";
import {
  rebuildLibraryIndex,
  setSetting,
  switchIndexPathAndRestart,
} from "@/services/desktop/indexing";
import { scanFolders } from "@/services/desktop/folders";
import {
  getVisualIndexStatus as getVisualIndexStatusCommand,
  validateVisualModelPath as validateVisualModelPathCommand,
  type VisualIndexStatus,
  type VisualModelValidationResult,
} from "@/services/desktop/files";
import { setDeleteMode as setDeleteModeCommand } from "@/services/desktop/trash";
import {
  AI_AUTO_ANALYZE_ON_IMPORT_SETTING_KEY,
  AI_CONFIG_SETTING_KEY,
  AUTO_CHECK_UPDATES_SETTING_KEY,
  BROWSER_COLLECTION_ICON_SETTING_KEY,
  LIBRARY_VIEW_PREFERENCES_SETTING_KEY,
  loadSettingsSnapshot,
  PANEL_LAYOUT_SETTING_KEY,
  PREVIEW_TRACKPAD_ZOOM_SPEED_SETTING_KEY,
  SHORTCUTS_SETTING_KEY,
  VISUAL_SEARCH_SETTING_KEY,
} from "@/stores/settingsLoader";

export {
  clampDetailPanelWidth,
  clampLibraryViewScale,
  clampPreviewTrackpadZoomSpeed,
  clampSidebarWidth,
  DEFAULT_AI_CONFIG,
  DEFAULT_DETAIL_PANEL_WIDTH,
  DEFAULT_LIBRARY_VISIBLE_FIELDS,
  DEFAULT_LIBRARY_VIEW_MODE,
  DEFAULT_LIBRARY_VIEW_SCALES,
  DEFAULT_PREVIEW_TRACKPAD_ZOOM_SPEED,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_VISUAL_SEARCH_CONFIG,
  LIBRARY_VIEW_SCALE_STEP,
  MAX_DETAIL_PANEL_WIDTH,
  MAX_SIDEBAR_WIDTH,
  PREVIEW_TRACKPAD_ZOOM_SPEED_MAX,
  PREVIEW_TRACKPAD_ZOOM_SPEED_MIN,
  PREVIEW_TRACKPAD_ZOOM_SPEED_STEP,
  getLibraryViewScaleRange,
  type AiConfig,
  type AiConfigTarget,
  type AiServiceConfig,
  type LibraryVisibleField,
  type LibraryViewMode,
  type VisualSearchConfig,
  type VisualSearchProviderPolicy,
  type VisualSearchRuntimeConfig,
  type VisualSearchRuntimeDevice,
} from "@/stores/settingsStore.helpers";

export type {
  AiMetadataAnalysisConfig,
  AiMetadataAnalysisField,
  AiMetadataAnalysisFieldConfig,
} from "@/stores/settingsStore.helpers";

let libraryViewPreferencesPersistTimer: ReturnType<typeof setTimeout> | null = null;
let panelLayoutPersistTimer: ReturnType<typeof setTimeout> | null = null;
let aiConfigPersistTimer: ReturnType<typeof setTimeout> | null = null;
let visualSearchPersistTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLibraryViewPreferencesPersist(
  get: () => {
    libraryViewMode: LibraryViewMode;
    libraryViewScales: Record<LibraryViewMode, number>;
    libraryVisibleFields: LibraryVisibleField[];
  },
) {
  if (libraryViewPreferencesPersistTimer) {
    clearTimeout(libraryViewPreferencesPersistTimer);
  }

  libraryViewPreferencesPersistTimer = setTimeout(() => {
    const { libraryViewMode, libraryViewScales, libraryVisibleFields } = get();
    void setSetting(
      LIBRARY_VIEW_PREFERENCES_SETTING_KEY,
      serializeLibraryViewPreferences(libraryViewMode, libraryViewScales, libraryVisibleFields),
    ).catch((error) => {
      console.error("Failed to persist library view preferences:", error);
    });
  }, 120);
}

function schedulePanelLayoutPersist(
  get: () => {
    sidebarWidth: number;
    detailPanelWidth: number;
    isSidebarCollapsed: boolean;
    isDetailPanelCollapsed: boolean;
  },
) {
  if (panelLayoutPersistTimer) {
    clearTimeout(panelLayoutPersistTimer);
  }

  panelLayoutPersistTimer = setTimeout(() => {
    const { sidebarWidth, detailPanelWidth, isSidebarCollapsed, isDetailPanelCollapsed } = get();
    void setSetting(
      PANEL_LAYOUT_SETTING_KEY,
      serializePanelLayout(
        sidebarWidth,
        detailPanelWidth,
        isSidebarCollapsed,
        isDetailPanelCollapsed,
      ),
    ).catch((error) => {
      console.error("Failed to persist panel layout:", error);
    });
  }, 120);
}

function scheduleAiConfigPersist(
  get: () => {
    aiConfig: AiConfig;
  },
) {
  if (aiConfigPersistTimer) {
    clearTimeout(aiConfigPersistTimer);
  }

  aiConfigPersistTimer = setTimeout(() => {
    void setSetting(AI_CONFIG_SETTING_KEY, JSON.stringify(get().aiConfig)).catch((error) => {
      console.error("Failed to persist AI config:", error);
    });
  }, 180);
}

function scheduleVisualSearchPersist(
  get: () => {
    visualSearch: VisualSearchConfig;
  },
) {
  if (visualSearchPersistTimer) {
    clearTimeout(visualSearchPersistTimer);
  }

  visualSearchPersistTimer = setTimeout(() => {
    void setSetting(VISUAL_SEARCH_SETTING_KEY, JSON.stringify(get().visualSearch)).catch(
      (error) => {
        console.error("Failed to persist visual search config:", error);
      },
    );
  }, 180);
}

const loadFilesInCurrentFolder = async () => {
  const libraryStore = useLibraryQueryStore.getState();
  await libraryStore.runCurrentQuery(libraryStore.selectedFolderId);
};

interface Settings {
  theme: "light" | "dark";
  indexPaths: string[];
  recentIndexPaths: string[];
  useTrash: boolean;
  aiConfig: AiConfig;
  visualSearch: VisualSearchConfig;
  autoAnalyzeOnImport: boolean;
  autoCheckUpdates: boolean;
  visualIndexStatus: VisualIndexStatus | null;
  visualModelValidation: VisualModelValidationResult | null;
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

interface SettingsStore extends Settings {
  setTheme: (theme: "light" | "dark") => Promise<void>;
  switchIndexPath: (path: string) => Promise<void>;
  setDeleteMode: (useTrash: boolean) => Promise<void>;
  setAiConfigField: <K extends keyof AiServiceConfig>(
    target: AiConfigTarget,
    key: K,
    value: AiServiceConfig[K],
  ) => void;
  setVisualSearchField: <K extends keyof VisualSearchConfig>(
    key: K,
    value: VisualSearchConfig[K],
  ) => void;
  setVisualSearchRuntimeField: <K extends keyof VisualSearchRuntimeConfig>(
    key: K,
    value: VisualSearchRuntimeConfig[K],
  ) => void;
  setAutoAnalyzeOnImport: (enabled: boolean) => Promise<void>;
  setAutoCheckUpdates: (enabled: boolean) => Promise<void>;
  setShortcut: (actionId: ShortcutActionId, shortcut: string) => Promise<void>;
  resetShortcut: (actionId: ShortcutActionId) => Promise<void>;
  setPreviewTrackpadZoomSpeed: (speed: number) => Promise<void>;
  setLibraryViewMode: (mode: LibraryViewMode) => void;
  setLibraryViewScale: (viewMode: LibraryViewMode, scale: number) => void;
  resetLibraryViewScale: (viewMode: LibraryViewMode) => void;
  toggleLibraryVisibleField: (field: LibraryVisibleField) => void;
  setSidebarWidth: (width: number) => void;
  setDetailPanelWidth: (width: number) => void;
  setSidebarCollapsed: (isCollapsed: boolean) => void;
  setDetailPanelCollapsed: (isCollapsed: boolean) => void;
  setBrowserCollectionIconId: (iconId: BrowserCollectionIconId) => Promise<void>;
  loadSettings: () => Promise<void>;
  rebuildIndex: () => Promise<void>;
  refreshVisualSearchStatus: () => Promise<void>;
  validateVisualModelPath: (modelPath?: string) => Promise<VisualModelValidationResult>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: "dark",
  indexPaths: [],
  recentIndexPaths: [],
  useTrash: true,
  aiConfig: cloneAiConfig(DEFAULT_AI_CONFIG),
  visualSearch: cloneVisualSearchConfig(DEFAULT_VISUAL_SEARCH_CONFIG),
  autoAnalyzeOnImport: false,
  autoCheckUpdates: false,
  visualIndexStatus: null,
  visualModelValidation: null,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  previewTrackpadZoomSpeed: DEFAULT_PREVIEW_TRACKPAD_ZOOM_SPEED,
  libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
  libraryViewScales: { ...DEFAULT_LIBRARY_VIEW_SCALES },
  libraryVisibleFields: [...DEFAULT_LIBRARY_VISIBLE_FIELDS],
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  detailPanelWidth: DEFAULT_DETAIL_PANEL_WIDTH,
  isSidebarCollapsed: false,
  isDetailPanelCollapsed: false,
  browserCollectionIconId: DEFAULT_BROWSER_COLLECTION_ICON_ID,

  setTheme: async (theme) => {
    await setSetting("theme", theme);
    set({ theme });
  },

  setDeleteMode: async (useTrash: boolean) => {
    await setDeleteModeCommand(useTrash);
    set({ useTrash });
  },

  setAiConfigField: (target, key, value) => {
    set((state) => ({
      aiConfig: {
        ...state.aiConfig,
        [target]: {
          ...state.aiConfig[target],
          [key]: value,
        },
      },
    }));
    scheduleAiConfigPersist(get);
  },

  setVisualSearchField: (key, value) => {
    set((state) => ({
      visualSearch: {
        ...state.visualSearch,
        [key]: value,
      },
      ...(key === "modelPath"
        ? {
            visualModelValidation: null,
            visualIndexStatus: null,
          }
        : {}),
    }));
    scheduleVisualSearchPersist(get);
  },

  setVisualSearchRuntimeField: (key, value) => {
    set((state) => ({
      visualSearch: {
        ...state.visualSearch,
        runtime: {
          ...state.visualSearch.runtime,
          [key]: value,
        },
      },
    }));
    scheduleVisualSearchPersist(get);
  },

  setAutoAnalyzeOnImport: async (enabled) => {
    await setSetting(AI_AUTO_ANALYZE_ON_IMPORT_SETTING_KEY, enabled ? "true" : "false");
    set({ autoAnalyzeOnImport: enabled });
  },

  setAutoCheckUpdates: async (enabled) => {
    await setSetting(AUTO_CHECK_UPDATES_SETTING_KEY, enabled ? "true" : "false");
    set({ autoCheckUpdates: enabled });
  },

  setShortcut: async (actionId, shortcut) => {
    const nextShortcuts = {
      ...get().shortcuts,
      [actionId]: shortcut,
    };
    await setSetting(SHORTCUTS_SETTING_KEY, JSON.stringify(nextShortcuts));
    set({ shortcuts: nextShortcuts });
  },

  resetShortcut: async (actionId) => {
    await get().setShortcut(actionId, DEFAULT_SHORTCUTS[actionId]);
  },

  setPreviewTrackpadZoomSpeed: async (speed) => {
    const nextSpeed = clampPreviewTrackpadZoomSpeed(speed);
    await setSetting(PREVIEW_TRACKPAD_ZOOM_SPEED_SETTING_KEY, String(nextSpeed));
    set({ previewTrackpadZoomSpeed: nextSpeed });
  },

  setLibraryViewMode: (mode) => {
    set({ libraryViewMode: mode });
    scheduleLibraryViewPreferencesPersist(get);
  },

  setLibraryViewScale: (viewMode, scale) => {
    const normalizedScale = clampLibraryViewScale(viewMode, scale);
    set((state) => ({
      libraryViewScales: {
        ...state.libraryViewScales,
        ...(isSharedTileViewMode(viewMode)
          ? {
              grid: normalizedScale,
              adaptive: normalizedScale,
            }
          : {
              [viewMode]: normalizedScale,
            }),
      },
    }));
    scheduleLibraryViewPreferencesPersist(get);
  },

  resetLibraryViewScale: (viewMode) => {
    get().setLibraryViewScale(viewMode, DEFAULT_LIBRARY_VIEW_SCALES[viewMode]);
  },

  toggleLibraryVisibleField: (field) => {
    set((state) => ({
      libraryVisibleFields: state.libraryVisibleFields.includes(field)
        ? state.libraryVisibleFields.filter((item) => item !== field)
        : [...state.libraryVisibleFields, field],
    }));
    scheduleLibraryViewPreferencesPersist(get);
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: clampSidebarWidth(width) });
    schedulePanelLayoutPersist(get);
  },

  setDetailPanelWidth: (width) => {
    set({ detailPanelWidth: clampDetailPanelWidth(width) });
    schedulePanelLayoutPersist(get);
  },

  setSidebarCollapsed: (isCollapsed) => {
    set({ isSidebarCollapsed: isCollapsed });
    schedulePanelLayoutPersist(get);
  },

  setDetailPanelCollapsed: (isCollapsed) => {
    set({ isDetailPanelCollapsed: isCollapsed });
    schedulePanelLayoutPersist(get);
  },

  setBrowserCollectionIconId: async (iconId) => {
    try {
      await setSetting(BROWSER_COLLECTION_ICON_SETTING_KEY, iconId);
      set({ browserCollectionIconId: iconId });
    } catch (error) {
      console.error("Failed to persist browser collection icon:", error);
    }
  },

  switchIndexPath: async (path) => {
    const nextPath = path.trim();
    if (!nextPath || get().indexPaths[0] === nextPath) {
      return;
    }

    await switchIndexPathAndRestart(nextPath);
  },

  loadSettings: async () => {
    set(await loadSettingsSnapshot());

    void get().refreshVisualSearchStatus();
  },

  rebuildIndex: async () => {
    await rebuildLibraryIndex();
    await scanFolders();
    await useFolderStore.getState().loadFolders();
    await loadFilesInCurrentFolder();
  },

  refreshVisualSearchStatus: async () => {
    try {
      const [validation, status] = await Promise.all([
        validateVisualModelPathCommand(get().visualSearch.modelPath),
        getVisualIndexStatusCommand(),
      ]);

      set({
        visualModelValidation: validation,
        visualIndexStatus: status,
      });
    } catch (error) {
      console.error("Failed to refresh visual search status:", error);
      set({
        visualModelValidation: null,
        visualIndexStatus: null,
      });
    }
  },

  validateVisualModelPath: async (modelPath) => {
    const validation = await validateVisualModelPathCommand(
      modelPath ?? get().visualSearch.modelPath,
    );
    set({ visualModelValidation: validation });
    return validation;
  },
}));
