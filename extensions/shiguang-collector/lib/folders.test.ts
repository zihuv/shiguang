import { describe, expect, it } from "vitest";
import {
  buildFolderTargets,
  findDefaultFolderId,
  flattenFolderRows,
  normalizeOptionalFolderId,
  parseFolderId,
} from "./folders";
import type { FolderRecord } from "./types";

const folders: FolderRecord[] = [
  {
    id: 1,
    name: "浏览器采集",
    parentId: null,
    children: [
      {
        id: 2,
        name: "插画",
        children: [{ id: 3, name: "角色" }],
      },
    ],
  },
  { id: 4, name: "参考" },
];

describe("collector folder helpers", () => {
  it("normalizes positive numeric folder ids only", () => {
    expect(normalizeOptionalFolderId(" 42 ")).toBe("42");
    expect(normalizeOptionalFolderId(7)).toBe("7");
    expect(normalizeOptionalFolderId(0)).toBe("");
    expect(normalizeOptionalFolderId("abc")).toBe("");
    expect(parseFolderId("9")).toBe(9);
    expect(parseFolderId("")).toBeNull();
  });

  it("finds and hides the browser collection folder while flattening rows", () => {
    expect(findDefaultFolderId(folders)).toBe(1);
    expect(flattenFolderRows(folders, 1)).toEqual([
      {
        id: "2",
        folderId: "2",
        name: "插画",
        depth: 1,
        pathLabel: "浏览器采集/插画",
      },
      {
        id: "3",
        folderId: "3",
        name: "角色",
        depth: 2,
        pathLabel: "浏览器采集/插画/角色",
      },
      {
        id: "4",
        folderId: "4",
        name: "参考",
        depth: 0,
        pathLabel: "参考",
      },
    ]);
  });

  it("adds the default drag target before concrete folders", () => {
    expect(buildFolderTargets(folders, 1)[0]).toMatchObject({
      id: "__default__",
      folderId: "",
      name: "浏览器采集",
    });
  });
});
