import path from "node:path";
import { isInsideAnyPath } from "./path-utils";

export function getThumbnailRoot(indexPath: string): string {
  return path.join(indexPath, ".shiguang", "thumbs");
}

export function isPathAllowedForRead(
  filePath: string,
  indexPaths: string[],
  additionalRoots: string[] = [],
): boolean {
  const thumbnailRoots = indexPaths.map(getThumbnailRoot);
  return (
    isInsideAnyPath(filePath, indexPaths) ||
    isInsideAnyPath(filePath, thumbnailRoots) ||
    isInsideAnyPath(filePath, additionalRoots)
  );
}
