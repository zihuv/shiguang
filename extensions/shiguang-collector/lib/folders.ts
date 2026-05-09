import type { FolderRecord, FolderTarget } from "./types";

export const DEFAULT_FOLDER_TARGET_ID = "__default__";
export const DEFAULT_FOLDER_NAME = "浏览器采集";

export function normalizeOptionalFolderId(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return "";
  }

  return Number.parseInt(text, 10) > 0 ? text : "";
}

export function parseFolderId(value: unknown): number | null {
  const normalized = normalizeOptionalFolderId(value);
  return normalized ? Number.parseInt(normalized, 10) : null;
}

export function findDefaultFolderId(folders: FolderRecord[]): string | number | null {
  const namedFolders: FolderRecord[] = [];

  const visit = (items: FolderRecord[] = []) => {
    for (const folder of items) {
      if (folder.name === DEFAULT_FOLDER_NAME) {
        namedFolders.push(folder);
      }
      visit(folder.children || []);
    }
  };

  visit(folders);
  const rootFolder = namedFolders.find((folder) => folder.parentId === null);
  return rootFolder?.id || namedFolders[0]?.id || null;
}

export function flattenFolderRows(
  folders: FolderRecord[],
  defaultFolderId: string | number | null = null,
  depth = 0,
  trail: string[] = [],
): FolderTarget[] {
  const rows: FolderTarget[] = [];

  for (const folder of folders || []) {
    const nextTrail = [...trail, folder.name].filter(Boolean);
    if (defaultFolderId && String(folder.id) === String(defaultFolderId)) {
      rows.push(...flattenFolderRows(folder.children || [], defaultFolderId, depth + 1, nextTrail));
      continue;
    }

    rows.push({
      id: String(folder.id),
      folderId: String(folder.id),
      name: folder.name,
      depth,
      pathLabel: nextTrail.join("/"),
    });
    rows.push(...flattenFolderRows(folder.children || [], defaultFolderId, depth + 1, nextTrail));
  }

  return rows;
}

export function buildFolderTargets(
  folders: FolderRecord[],
  defaultFolderId: string | number | null,
): FolderTarget[] {
  return [
    {
      id: DEFAULT_FOLDER_TARGET_ID,
      folderId: "",
      name: DEFAULT_FOLDER_NAME,
      pathLabel: DEFAULT_FOLDER_NAME,
      depth: 0,
    },
    ...flattenFolderRows(folders, defaultFolderId),
  ];
}
