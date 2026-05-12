import { create } from "zustand";
import {
  type FileSortField,
  type FilterCriteria,
  type SortDirection,
  initialFilterCriteria,
} from "@/features/filters/types";
import { getActiveFilterCount as getSchemaActiveFilterCount } from "@/features/filters/schema";
import { getSetting, setSetting } from "@/services/desktop/indexing";

export type { FileSortField, FilterCriteria, SortDirection } from "@/features/filters/types";

const SORT_PREFERENCES_SETTING_KEY = "librarySortPreferences";

type LegacyFileSortOption =
  | "imported_desc"
  | "imported_asc"
  | "modified_desc"
  | "created_desc"
  | "name_asc"
  | "name_desc"
  | "size_desc"
  | "size_asc";

type PersistedSortPreferences = {
  sortBy?: unknown;
  sortDirection?: unknown;
  sort?: unknown;
};

interface FilterStore {
  criteria: FilterCriteria;
  isFilterPanelOpen: boolean;
  hasLoadedPreferences: boolean;
  setSearchQuery: (query: string) => void;
  setTagIds: (tagIds: number[]) => void;
  setFileType: (fileType: FilterCriteria["fileType"]) => void;
  setDateRange: (range: FilterCriteria["dateRange"]) => void;
  setSizeRange: (range: FilterCriteria["sizeRange"]) => void;
  toggleTag: (tagId: number) => void;
  setMinRating: (rating: number) => void;
  clearFilters: () => void;
  setFilterPanelOpen: (open: boolean) => void;
  toggleFilterPanel: () => void;
  getActiveFilterCount: () => number;
  setDominantColor: (color: string | null) => void;
  setKeyword: (keyword: string) => void;
  setFolderId: (folderId: number | null) => void;
  setSortBy: (sortBy: FileSortField) => void;
  setSortDirection: (sortDirection: SortDirection) => void;
  setSort: (sortBy: FileSortField, sortDirection?: SortDirection) => void;
  loadPreferences: () => Promise<void>;
}

function isFileSortField(value: unknown): value is FileSortField {
  return (
    value === "imported_at" ||
    value === "created_at" ||
    value === "modified_at" ||
    value === "name" ||
    value === "ext" ||
    value === "size"
  );
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isLegacyFileSortOption(value: unknown): value is LegacyFileSortOption {
  return (
    value === "imported_desc" ||
    value === "imported_asc" ||
    value === "modified_desc" ||
    value === "created_desc" ||
    value === "name_asc" ||
    value === "name_desc" ||
    value === "size_desc" ||
    value === "size_asc"
  );
}

function getLegacySortConfig(sort: LegacyFileSortOption) {
  switch (sort) {
    case "imported_asc":
      return { sortBy: "imported_at" as const, sortDirection: "asc" as const };
    case "modified_desc":
      return { sortBy: "modified_at" as const, sortDirection: "desc" as const };
    case "created_desc":
      return { sortBy: "created_at" as const, sortDirection: "desc" as const };
    case "name_asc":
      return { sortBy: "name" as const, sortDirection: "asc" as const };
    case "name_desc":
      return { sortBy: "name" as const, sortDirection: "desc" as const };
    case "size_desc":
      return { sortBy: "size" as const, sortDirection: "desc" as const };
    case "size_asc":
      return { sortBy: "size" as const, sortDirection: "asc" as const };
    case "imported_desc":
    default:
      return { sortBy: "imported_at" as const, sortDirection: "desc" as const };
  }
}

function serializeSortPreferences(criteria: FilterCriteria) {
  return JSON.stringify({
    sortBy: criteria.sortBy,
    sortDirection: criteria.sortDirection,
  });
}

function persistSortPreferences(
  get: () => { criteria: FilterCriteria; hasLoadedPreferences: boolean },
) {
  if (!get().hasLoadedPreferences) {
    return;
  }

  void setSetting(SORT_PREFERENCES_SETTING_KEY, serializeSortPreferences(get().criteria)).catch(
    (error) => {
      console.error("Failed to persist sort preferences:", error);
    },
  );
}

function restoreSortPreferences(
  criteria: FilterCriteria,
  value: PersistedSortPreferences,
): FilterCriteria {
  const legacySort = isLegacyFileSortOption(value.sort)
    ? getLegacySortConfig(value.sort)
    : {
        sortBy: criteria.sortBy,
        sortDirection: criteria.sortDirection,
      };

  return {
    ...criteria,
    sortBy: isFileSortField(value.sortBy) ? value.sortBy : legacySort.sortBy,
    sortDirection: isSortDirection(value.sortDirection)
      ? value.sortDirection
      : legacySort.sortDirection,
  };
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  criteria: { ...initialFilterCriteria },
  isFilterPanelOpen: false,
  hasLoadedPreferences: false,

  setSearchQuery: (query) => {
    set((state) => ({
      criteria: { ...state.criteria, searchQuery: query },
    }));
  },

  setFileType: (fileType) => {
    set((state) => ({
      criteria: { ...state.criteria, fileType },
    }));
  },

  setDateRange: (range) => {
    set((state) => ({
      criteria: { ...state.criteria, dateRange: range },
    }));
  },

  setSizeRange: (range) => {
    set((state) => ({
      criteria: { ...state.criteria, sizeRange: range },
    }));
  },

  toggleTag: (tagId) => {
    set((state) => {
      const tagIds = state.criteria.tagIds.includes(tagId)
        ? state.criteria.tagIds.filter((id) => id !== tagId)
        : [...state.criteria.tagIds, tagId];
      return {
        criteria: { ...state.criteria, tagIds },
      };
    });
  },

  setTagIds: (tagIds) => {
    set((state) => ({
      criteria: { ...state.criteria, tagIds },
    }));
  },

  setMinRating: (rating) => {
    set((state) => ({
      criteria: { ...state.criteria, minRating: rating },
    }));
  },

  clearFilters: () => {
    set((state) => ({
      criteria: {
        ...initialFilterCriteria,
        searchQuery: state.criteria.searchQuery,
        sortBy: state.criteria.sortBy,
        sortDirection: state.criteria.sortDirection,
      },
    }));
  },

  setFilterPanelOpen: (open) => {
    set({ isFilterPanelOpen: open });
  },

  toggleFilterPanel: () => {
    set((state) => ({ isFilterPanelOpen: !state.isFilterPanelOpen }));
  },

  setDominantColor: (color) => {
    set((state) => ({
      criteria: { ...state.criteria, dominantColor: color },
    }));
  },

  setKeyword: (keyword) => {
    set((state) => ({
      criteria: { ...state.criteria, keyword },
    }));
  },

  setFolderId: (folderId) => {
    set((state) => ({
      criteria: { ...state.criteria, folderId },
    }));
  },

  setSortBy: (sortBy) => {
    set((state) => ({
      criteria: { ...state.criteria, sortBy },
    }));
    persistSortPreferences(get);
  },

  setSortDirection: (sortDirection) => {
    set((state) => ({
      criteria: { ...state.criteria, sortDirection },
    }));
    persistSortPreferences(get);
  },

  setSort: (sortBy, sortDirection) => {
    set((state) => ({
      criteria: {
        ...state.criteria,
        sortBy,
        sortDirection: sortDirection ?? state.criteria.sortDirection,
      },
    }));
    persistSortPreferences(get);
  },

  getActiveFilterCount: () => {
    return getSchemaActiveFilterCount(get().criteria);
  },

  loadPreferences: async () => {
    let nextCriteria = { ...get().criteria };

    try {
      const rawValue = await getSetting(SORT_PREFERENCES_SETTING_KEY);
      if (rawValue) {
        const parsed = JSON.parse(rawValue) as PersistedSortPreferences;
        nextCriteria = restoreSortPreferences(nextCriteria, parsed);
      }
    } catch (error) {
      console.error("Failed to load sort preferences:", error);
    }

    set((state) => ({
      criteria: {
        ...state.criteria,
        sortBy: nextCriteria.sortBy,
        sortDirection: nextCriteria.sortDirection,
      },
      hasLoadedPreferences: true,
    }));
  },
}));
