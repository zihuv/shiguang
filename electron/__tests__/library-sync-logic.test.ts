import { describe, expect, it } from "vitest";
import {
  classifyExistingPathSync,
  selectFoldersToPrune,
  shouldMarkMissing,
  shouldUseMoveCandidate,
} from "../library-sync-logic";

describe("library sync decisions", () => {
  it("does not resurrect files that are in the app trash", () => {
    expect(classifyExistingPathSync({ deletedAt: "2026-04-22 10:00:00" }, false)).toBe("skipped");
  });

  it("keeps unchanged active files quiet and restores missing files as additions", () => {
    expect(classifyExistingPathSync({ deletedAt: null, missingAt: null }, true)).toBe("skipped");
    expect(classifyExistingPathSync({ deletedAt: null, missingAt: null }, false)).toBe("updated");
    expect(
      classifyExistingPathSync({ deletedAt: null, missingAt: "2026-04-22 10:00:00" }, true),
    ).toBe("added");
  });

  it("only reuses move candidates when the old path is missing or gone", () => {
    expect(
      shouldUseMoveCandidate(
        { path: "/library/old.png", missingAt: "2026-04-22 10:00:00" },
        "/library/new.png",
        true,
      ),
    ).toBe(true);
    expect(
      shouldUseMoveCandidate(
        { path: "/library/old.png", missingAt: null },
        "/library/new.png",
        false,
      ),
    ).toBe(true);
    expect(
      shouldUseMoveCandidate(
        { path: "/library/old.png", missingAt: null },
        "/library/new.png",
        true,
      ),
    ).toBe(false);
    expect(
      shouldUseMoveCandidate(
        { path: "/library/old.png", missingAt: null },
        "/library/old.png",
        false,
      ),
    ).toBe(false);
  });

  it("marks only active missing records as missing", () => {
    expect(
      shouldMarkMissing({
        hasRecord: true,
        deletedAt: null,
        missingAt: null,
        existsOnDisk: false,
      }),
    ).toBe(true);
    expect(
      shouldMarkMissing({
        hasRecord: true,
        deletedAt: "2026-04-22 10:00:00",
        missingAt: null,
        existsOnDisk: false,
      }),
    ).toBe(false);
    expect(
      shouldMarkMissing({
        hasRecord: true,
        deletedAt: null,
        missingAt: null,
        existsOnDisk: true,
      }),
    ).toBe(false);
  });
});

describe("selectFoldersToPrune", () => {
  const rootPath = "/library/root";
  const existsOnDisk = new Set<string>([rootPath, `${rootPath}/exists`]);
  const inRenameWindow = new Set<string>([`${rootPath}/renaming`]);
  const presentFileCounts = new Map<string, number>([
    [`${rootPath}/with-files`, 3],
    [`${rootPath}/renaming`, 0],
  ]);

  const run = (folders: Array<{ id: number; path: string; isSystem?: boolean }>) =>
    selectFoldersToPrune({
      folders,
      rootPath,
      existsOnDisk: (folderPath) => existsOnDisk.has(folderPath),
      inRenameWindow: (folderPath) => inRenameWindow.has(folderPath),
      presentFileCount: (folderPath) => presentFileCounts.get(folderPath) ?? 0,
    });

  it("prunes a folder deleted from disk even when its files only remain as missing records", () => {
    expect(run([{ id: 1, path: `${rootPath}/gone` }])).toEqual([1]);
  });

  it("keeps folders that still exist on disk", () => {
    expect(run([{ id: 2, path: `${rootPath}/exists` }])).toEqual([]);
  });

  it("keeps folders that still have present files", () => {
    expect(run([{ id: 3, path: `${rootPath}/with-files` }])).toEqual([]);
  });

  it("keeps folders inside the rename-detection window", () => {
    expect(run([{ id: 4, path: `${rootPath}/renaming` }])).toEqual([]);
  });

  it("keeps app-managed system folders", () => {
    expect(run([{ id: 5, path: `${rootPath}/system`, isSystem: true }])).toEqual([]);
  });

  it("never prunes the index root path itself", () => {
    expect(run([{ id: 6, path: rootPath }])).toEqual([]);
  });

  it("returns nested folders deepest-first", () => {
    expect(
      run([
        { id: 10, path: `${rootPath}/a` },
        { id: 11, path: `${rootPath}/a/b` },
        { id: 12, path: `${rootPath}/a/b/c` },
      ]),
    ).toEqual([12, 11, 10]);
  });
});
