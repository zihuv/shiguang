import { create } from "zustand";
import type { SmartCollectionId } from "@/stores/fileTypes";

export type LibraryHistoryEntry =
  | { type: "folder"; folderId: number }
  | { type: "smart"; smartCollection: SmartCollectionId };

const MAX_HISTORY_ENTRIES = 60;

function isSameEntry(a: LibraryHistoryEntry, b: LibraryHistoryEntry) {
  if (a.type !== b.type) {
    return false;
  }

  return a.type === "folder"
    ? a.folderId === (b as { type: "folder"; folderId: number }).folderId
    : a.smartCollection ===
        (b as { type: "smart"; smartCollection: SmartCollectionId }).smartCollection;
}

interface LibraryNavigationHistoryStore {
  entries: LibraryHistoryEntry[];
  index: number;
  canGoBack: boolean;
  canGoForward: boolean;
  visit: (entry: LibraryHistoryEntry, previousEntry?: LibraryHistoryEntry) => void;
  goBack: () => LibraryHistoryEntry | null;
  goForward: () => LibraryHistoryEntry | null;
  reset: () => void;
}

function deriveState(entries: LibraryHistoryEntry[], index: number) {
  return {
    entries,
    index,
    canGoBack: index > 0,
    canGoForward: index >= 0 && index < entries.length - 1,
  };
}

export const useLibraryNavigationHistoryStore = create<LibraryNavigationHistoryStore>(
  (set, get) => ({
    entries: [],
    index: -1,
    canGoBack: false,
    canGoForward: false,

    visit: (entry, previousEntry) => {
      const state = get();
      let entries = state.entries;
      let index = state.index;

      if (entries.length === 0 && previousEntry && !isSameEntry(previousEntry, entry)) {
        entries = [previousEntry];
        index = 0;
      }

      const lastEntry = entries[index];
      if (lastEntry && isSameEntry(lastEntry, entry)) {
        return;
      }

      const nextEntries = [...entries.slice(0, index + 1), entry].slice(-MAX_HISTORY_ENTRIES);
      set(deriveState(nextEntries, nextEntries.length - 1));
    },

    goBack: () => {
      const state = get();
      if (state.index <= 0) {
        return null;
      }

      const index = state.index - 1;
      set(deriveState(state.entries, index));
      return state.entries[index] ?? null;
    },

    goForward: () => {
      const state = get();
      if (state.index < 0 || state.index >= state.entries.length - 1) {
        return null;
      }

      const index = state.index + 1;
      set(deriveState(state.entries, index));
      return state.entries[index] ?? null;
    },

    reset: () => set(deriveState([], -1)),
  }),
);
