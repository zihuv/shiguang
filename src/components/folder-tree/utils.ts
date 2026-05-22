import type { SmartCollectionId } from "@/stores/fileTypes";
import type { FolderNode } from "@/stores/folderStore";
import { filterFuzzyTree } from "@/shared/fuzzySearch";
import {
  navigateToLibraryHistoryEntry,
  openLibraryFolder,
  openSmartCollection,
} from "@/stores/librarySession";
import { findFolderById } from "@/utils/folderTree";

export { findFolderById } from "@/utils/folderTree";

export const INTERNAL_FILE_DRAG_MIME = "application/x-shiguang-file-ids";

export type FlattenedFolderNode = FolderNode & { sortOrder: number };

export const findFolderParentId = (
  folders: FolderNode[],
  folderId: number,
  parentId: number | null,
): number | null => {
  for (const folder of folders) {
    if (folder.id === folderId) return parentId;
    if (folder.children && folder.children.length > 0) {
      const found = findFolderParentId(folder.children, folderId, folder.id);
      if (found !== null) return found;
    }
  }
  return null;
};

export const findSiblings = (folders: FolderNode[], parentId: number | null): FolderNode[] => {
  if (parentId === null) return folders;

  const findParentChildren = (items: FolderNode[]): FolderNode[] | null => {
    for (const item of items) {
      if (item.id === parentId) return item.children || [];
      if (item.children && item.children.length > 0) {
        const found = findParentChildren(item.children);
        if (found) return found;
      }
    }
    return null;
  };

  return findParentChildren(folders) || [];
};

export const getPersistedFolderIds = (folders: FolderNode[]): number[] =>
  folders.map((folder) => folder.id);

export const getAllFolderIds = (folders: FolderNode[]): number[] => {
  const ids: number[] = [];
  for (const folder of folders) {
    ids.push(folder.id);
    if (folder.children && folder.children.length > 0) {
      ids.push(...getAllFolderIds(folder.children));
    }
  }
  return ids;
};

export const isDescendant = (folders: FolderNode[], parentId: number, childId: number): boolean => {
  const parent = findFolderById(folders, parentId);
  if (!parent || !parent.children) return false;

  const checkDescendant = (items: FolderNode[], targetId: number): boolean => {
    for (const item of items) {
      if (item.id === targetId) return true;
      if (item.children && checkDescendant(item.children, targetId)) return true;
    }
    return false;
  };

  return checkDescendant(parent.children, childId);
};

export function filterFolderTree(folders: FolderNode[], query: string): FolderNode[] {
  if (!query.trim()) {
    return folders;
  }

  return filterFuzzyTree(folders, query, {
    keys: [(folder) => folder.name],
    getChildren: (folder) => folder.children,
    setChildren: (folder, children) => ({
      ...folder,
      children,
    }),
  });
}

export function buildFolderMovePlan(
  folders: FolderNode[],
  folderId: number,
  newParentId: number | null,
  insertIndex?: number,
): {
  currentParentId: number | null;
  sortOrder: number;
  sourceSiblingIds: number[];
  targetSiblingIds: number[];
} | null {
  const folder = findFolderById(folders, folderId);
  if (!folder) {
    return null;
  }

  const currentParentId = findFolderParentId(folders, folderId, null);
  const sourceSiblings = findSiblings(folders, currentParentId).filter(
    (item) => item.id !== folderId,
  );
  const targetSiblings = findSiblings(folders, newParentId).filter((item) => item.id !== folderId);

  const nextTargetSiblings = [...targetSiblings];
  const safeInsertIndex =
    insertIndex === undefined
      ? nextTargetSiblings.length
      : Math.max(0, Math.min(insertIndex, nextTargetSiblings.length));

  nextTargetSiblings.splice(safeInsertIndex, 0, folder);

  return {
    currentParentId,
    sortOrder: safeInsertIndex,
    sourceSiblingIds: getPersistedFolderIds(sourceSiblings),
    targetSiblingIds: getPersistedFolderIds(nextTargetSiblings),
  };
}

export async function selectFolderFromTree(
  folderId: number | null,
  options: { recordHistory?: boolean } = {},
) {
  await openLibraryFolder(folderId, options);
}

export async function selectSmartCollectionFromSidebar(
  smartCollection: SmartCollectionId,
  options: { recordHistory?: boolean } = {},
) {
  await openSmartCollection(smartCollection, options);
}

export { navigateToLibraryHistoryEntry };

export const flattenFolders = (nodes: FolderNode[], depth = 0): FlattenedFolderNode[] => {
  let result: FlattenedFolderNode[] = [];
  for (const node of nodes) {
    result.push({ ...node, sortOrder: depth });
    if (node.children && node.children.length > 0) {
      result = result.concat(flattenFolders(node.children, depth + 1));
    }
  }
  return result;
};
