import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

type DatabaseConstructor = typeof Database;

async function loadDatabaseConstructor(): Promise<DatabaseConstructor | null> {
  const databaseModule = (await import("better-sqlite3")) as unknown as {
    default?: DatabaseConstructor;
  } & DatabaseConstructor;
  const Database = databaseModule.default ?? databaseModule;
  try {
    const db = new Database(":memory:");
    db.close();
    return Database;
  } catch {
    return null;
  }
}

describe("folder repository", () => {
  it("allocates new folder sort order before existing siblings", async () => {
    const Database = await loadDatabaseConstructor();
    if (!Database) {
      return;
    }

    const { migrateDatabase } = await import("../database/migrations");
    const { createFolderRecord, getPrependFolderSortOrder } = await import("../database");
    const db = new Database(":memory:");
    migrateDatabase(db, ":memory:");

    createFolderRecord(db, "/library/browser", "浏览器采集", null, false, -1);
    createFolderRecord(db, "/library/tests", "测试", null, false, 0);

    expect(getPrependFolderSortOrder(db, null)).toBe(-2);

    const parentId = createFolderRecord(db, "/library/parent", "父级", null, false, 1);
    createFolderRecord(db, "/library/parent/child", "子级", parentId, false, 4);
    const deletedChildId = createFolderRecord(
      db,
      "/library/parent/deleted-child",
      "已删除子级",
      parentId,
      false,
      -10,
    );
    db.prepare("UPDATE folders SET deleted_at = '2026-04-30 12:00:00' WHERE id = ?").run(
      deletedChildId,
    );

    expect(getPrependFolderSortOrder(db, parentId)).toBe(3);
    expect(getPrependFolderSortOrder(db, 999)).toBe(0);

    db.close();
  });

  it("sums active file sizes under a folder subtree", async () => {
    const Database = await loadDatabaseConstructor();
    if (!Database) {
      return;
    }

    const { migrateDatabase } = await import("../database/migrations");
    const { createFolderRecord, getFolderSize, normalizeStoredPath } = await import("../database");
    const db = new Database(":memory:");
    migrateDatabase(db, ":memory:");

    const timestamp = "2026-05-11T00:00:00.000Z";
    const rootId = createFolderRecord(db, "/library/root", "root", null, false, 0);
    const childId = createFolderRecord(db, "/library/root/child", "child", rootId, false, 0);
    const siblingId = createFolderRecord(db, "/library/sibling", "sibling", null, false, 0);

    const insertFile = (
      filePath: string,
      folderId: number,
      size: number,
      deletedAt: string | null = null,
      missingAt: string | null = null,
    ) => {
      db.prepare(
        `INSERT INTO files (
          path, normalized_path, name, ext, size, width, height, folder_id, created_at,
          modified_at, imported_at, rating, description, source_url, dominant_color,
          color_distribution, thumb_hash, deleted_at, missing_at, sync_id, content_hash,
          fs_modified_at, updated_at
        ) VALUES (?, ?, ?, 'png', ?, 1, 1, ?, ?, ?, ?, 0, '', '', '', '[]', '', ?, ?, ?, NULL, ?, ?)`,
      ).run(
        filePath,
        normalizeStoredPath(filePath),
        filePath.split("/").pop(),
        size,
        folderId,
        timestamp,
        timestamp,
        timestamp,
        deletedAt,
        missingAt,
        `file_${folderId}_${size}`,
        timestamp,
        timestamp,
      );
    };

    insertFile("/library/root/a.png", rootId, 10);
    insertFile("/library/root/child/b.png", childId, 25);
    insertFile("/library/root/child/missing.png", childId, 50, null, timestamp);
    insertFile("/library/root/deleted.png", rootId, 70, timestamp, null);
    insertFile("/library/sibling/c.png", siblingId, 100);

    expect(getFolderSize(db, rootId)).toBe(35);
    expect(getFolderSize(db, childId)).toBe(25);
    expect(getFolderSize(db, siblingId)).toBe(100);
    expect(getFolderSize(db, 999)).toBe(0);

    db.close();
  });

  it("relocates an externally renamed folder without creating duplicate records", async () => {
    const Database = await loadDatabaseConstructor();
    if (!Database) {
      return;
    }

    const { migrateDatabase } = await import("../database/migrations");
    const { createFolderRecord, getFolderById, normalizeStoredPath, relocateFolderSubtree } =
      await import("../database");
    const db = new Database(":memory:");
    migrateDatabase(db, ":memory:");

    const oldPath = "/library/未命名文件夹";
    const newPath = "/library/旅行";
    const rootId = createFolderRecord(db, oldPath, "未命名文件夹", null);
    const childId = createFolderRecord(db, `${oldPath}/精选`, "精选", rootId);
    const timestamp = "2026-06-24T00:00:00.000Z";
    db.prepare(
      `INSERT INTO files (
        path, normalized_path, name, ext, size, width, height, folder_id, created_at,
        modified_at, imported_at, rating, description, source_url, dominant_color,
        color_distribution, thumb_hash, sync_id, fs_modified_at, updated_at
      ) VALUES (?, ?, 'a.png', 'png', 1, 1, 1, ?, ?, ?, ?, 0, '', '', '', '[]', '',
        'file_external_rename', ?, ?)`,
    ).run(
      `${oldPath}/精选/a.png`,
      normalizeStoredPath(`${oldPath}/精选/a.png`),
      childId,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );

    expect(relocateFolderSubtree(db, oldPath, newPath, null)).toBe(true);
    expect(getFolderById(db, rootId)).toMatchObject({ name: "旅行", path: newPath });
    expect(getFolderById(db, childId)).toMatchObject({ path: `${newPath}/精选` });
    expect(db.prepare("SELECT COUNT(*) AS count FROM folders").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT path FROM files").get()).toEqual({
      path: `${newPath}/精选/a.png`,
    });

    db.close();
  });
});
