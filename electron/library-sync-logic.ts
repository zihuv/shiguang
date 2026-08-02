import path from "node:path";
import { pathHasPrefix } from "./path-utils";

export type LibrarySyncChangeKind = "added" | "updated" | "removed" | "moved" | "skipped";

export interface LibrarySyncFileState {
  path: string;
  deletedAt?: string | null;
  missingAt?: string | null;
}

export function classifyExistingPathSync(
  existing: Pick<LibrarySyncFileState, "deletedAt" | "missingAt">,
  unchanged: boolean,
): LibrarySyncChangeKind {
  if (existing.deletedAt) {
    return "skipped";
  }
  if (!existing.missingAt && unchanged) {
    return "skipped";
  }
  return existing.missingAt ? "added" : "updated";
}

export function shouldUseMoveCandidate(
  candidate: LibrarySyncFileState | null,
  nextPath: string,
  candidatePathExists: boolean,
): boolean {
  if (!candidate) {
    return false;
  }
  if (path.resolve(candidate.path) === path.resolve(nextPath)) {
    return false;
  }
  return Boolean(candidate.missingAt) || !candidatePathExists;
}

export function shouldMarkMissing(args: {
  hasRecord: boolean;
  deletedAt?: string | null;
  missingAt?: string | null;
  existsOnDisk: boolean;
}): boolean {
  return Boolean(args.hasRecord && !args.deletedAt && !args.missingAt && !args.existsOnDisk);
}

export interface FolderPruneCandidate {
  id: number;
  path: string;
  isSystem?: boolean;
}

/**
 * Selects folder records under `rootPath` that should be removed because their
 * directory no longer exists on disk. A folder is kept when it still exists,
 * is app-managed (system), sits in the rename-detection window, or still has
 * present (non-missing, non-deleted) files. Missing file records do not keep a
 * deleted folder alive — the folder tree mirrors actual storage.
 */
export function selectFoldersToPrune(args: {
  folders: FolderPruneCandidate[];
  rootPath: string;
  existsOnDisk: (folderPath: string) => boolean;
  inRenameWindow: (folderPath: string) => boolean;
  presentFileCount: (folderPath: string) => number;
}): number[] {
  return args.folders
    .filter((folder) => folder.path !== args.rootPath && pathHasPrefix(folder.path, args.rootPath))
    .sort((left, right) => right.path.length - left.path.length)
    .filter((folder) => {
      if (args.existsOnDisk(folder.path)) {
        return false;
      }
      if (folder.isSystem || args.inRenameWindow(folder.path)) {
        return false;
      }
      return args.presentFileCount(folder.path) === 0;
    })
    .map((folder) => folder.id);
}
