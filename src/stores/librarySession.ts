import type { SmartCollectionId } from "@/stores/fileTypes";
import type { FolderNode } from "@/stores/folderStore";
import { shouldResetQueryStateForSmartCollectionEntry } from "@/components/folder-tree/navigationState";
import {
  useLibraryNavigationHistoryStore,
  type LibraryHistoryEntry,
} from "@/stores/libraryNavigationHistoryStore";
import { useFilterStore } from "@/stores/filterStore";
import { useFolderStore } from "@/stores/folderStore";
import { useLibraryQueryStore } from "@/stores/libraryQueryStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useSmartCollectionStore } from "@/stores/smartCollectionStore";
import { clearLibraryFocusState } from "@/stores/librarySurfaceSync";

function findFolderByPath(folders: FolderNode[], folderPath: string): FolderNode | null {
  for (const folder of folders) {
    if (folder.path === folderPath) {
      return folder;
    }

    const nested = findFolderByPath(folder.children, folderPath);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function getCurrentLibraryHistoryEntry(): LibraryHistoryEntry {
  const folderStore = useFolderStore.getState();
  const navigationStore = useNavigationStore.getState();

  if (folderStore.selectedFolderId !== null) {
    return { type: "folder", folderId: folderStore.selectedFolderId };
  }

  return { type: "smart", smartCollection: navigationStore.activeSmartCollection ?? "all" };
}

export async function openLibraryFolder(
  folderId: number | null,
  options: { recordHistory?: boolean } = {},
) {
  const folderStore = useFolderStore.getState();
  const filterStore = useFilterStore.getState();
  const libraryStore = useLibraryQueryStore.getState();
  const navigationStore = useNavigationStore.getState();
  const previousEntry = getCurrentLibraryHistoryEntry();

  navigationStore.openLibrary(folderId === null ? "all" : null);

  if (filterStore.isFilterPanelOpen || folderId === null) {
    filterStore.setFolderId(null);
  }

  if (folderStore.selectedFolderId === folderId) {
    clearLibraryFocusState();
    return;
  }

  folderStore.selectFolder(folderId);
  clearLibraryFocusState();
  await libraryStore.loadFilesInFolder(folderId);

  if (options.recordHistory !== false) {
    const entry: LibraryHistoryEntry =
      folderId === null ? { type: "smart", smartCollection: "all" } : { type: "folder", folderId };
    useLibraryNavigationHistoryStore.getState().visit(entry, previousEntry);
  }
}

export async function openSmartCollection(
  smartCollection: SmartCollectionId,
  options: { recordHistory?: boolean } = {},
) {
  const folderStore = useFolderStore.getState();
  const filterStore = useFilterStore.getState();
  const libraryStore = useLibraryQueryStore.getState();
  const navigationStore = useNavigationStore.getState();
  const previousEntry = getCurrentLibraryHistoryEntry();

  if (
    shouldResetQueryStateForSmartCollectionEntry({
      currentView: navigationStore.currentView,
      smartCollection,
    })
  ) {
    filterStore.clearFilters();
    libraryStore.clearTransientQuery();
  }

  navigationStore.openSmartCollection(smartCollection);
  filterStore.setFolderId(null);
  folderStore.selectFolder(null);
  libraryStore.setSelectedFolderId(null);
  clearLibraryFocusState();
  await libraryStore.runCurrentQuery(null);

  if (options.recordHistory !== false) {
    useLibraryNavigationHistoryStore
      .getState()
      .visit({ type: "smart", smartCollection }, previousEntry);
  }
}

export async function navigateToLibraryHistoryEntry(entry: LibraryHistoryEntry) {
  if (entry.type === "folder") {
    await openLibraryFolder(entry.folderId, { recordHistory: false });
    return;
  }

  await openSmartCollection(entry.smartCollection, { recordHistory: false });
}

export async function refreshCurrentLibraryState() {
  await useFolderStore.getState().loadFolders();
  const libraryStore = useLibraryQueryStore.getState();
  await libraryStore.runCurrentQuery(libraryStore.selectedFolderId);
  await useSmartCollectionStore.getState().loadStats();
}

export async function refreshAfterFolderRestore(restoredPath: string, shouldSelectOnUndo: boolean) {
  await useFolderStore.getState().loadFolders();
  await useSmartCollectionStore.getState().loadStats();
  const libraryStore = useLibraryQueryStore.getState();
  const folderStore = useFolderStore.getState();

  if (shouldSelectOnUndo) {
    const restoredFolder = findFolderByPath(folderStore.folders, restoredPath);
    if (restoredFolder) {
      folderStore.selectFolder(restoredFolder.id);
      libraryStore.setSelectedFolderId(restoredFolder.id);
      await libraryStore.loadFilesInFolder(restoredFolder.id);
      return;
    }
  }

  await libraryStore.runCurrentQuery(libraryStore.selectedFolderId);
}
