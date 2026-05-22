import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { AppState } from "../types";

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

describe("file fuzzy search", () => {
  function createTestState(db: Database.Database): AppState {
    return {
      db,
      dbPath: ":memory:",
      appDataDir: "",
      indexPath: "/library",
      importTasks: new Map(),
      aiMetadataTasks: new Map(),
      visualIndexTasks: new Map(),
      visualModelDownloadTasks: new Map(),
    };
  }

  it("matches filenames by acronym and ordered characters after filters", async () => {
    const Database = await loadDatabaseConstructor();
    if (!Database) {
      return;
    }

    const { migrateDatabase } = await import("../database/migrations");
    const { createFolderRecord, filterFiles, upsertFile } = await import("../database");
    const db = new Database(":memory:");
    migrateDatabase(db, ":memory:");

    const folderId = createFolderRecord(db, "/library/design", "设计", null, false, 0);
    upsertFile(db, {
      path: "/library/design/Music Player.png",
      name: "Music Player.png",
      ext: "png",
      size: 1,
      width: 100,
      height: 100,
      folderId,
      createdAt: "2026-05-01T00:00:00.000Z",
      modifiedAt: "2026-05-01T00:00:00.000Z",
    });
    upsertFile(db, {
      path: "/library/design/Design Pattern.jpg",
      name: "Design Pattern.jpg",
      ext: "jpg",
      size: 1,
      width: 100,
      height: 100,
      folderId,
      createdAt: "2026-05-01T00:00:00.000Z",
      modifiedAt: "2026-05-01T00:00:00.000Z",
    });
    upsertFile(db, {
      path: "/library/other/Music Player.png",
      name: "Music Player.png",
      ext: "png",
      size: 1,
      width: 100,
      height: 100,
      folderId: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      modifiedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(
      filterFiles(db, {
        filter: { query: "mpy", folder_id: folderId },
        page: 1,
        pageSize: 20,
      }).files.map((file) => file.name),
    ).toEqual(["Music Player.png"]);
    expect(
      filterFiles(db, {
        filter: { query: "desip", folder_id: folderId },
        page: 1,
        pageSize: 20,
      }).files.map((file) => file.name),
    ).toEqual(["Design Pattern.jpg"]);

    db.close();
  });

  it("requires an explicit local model for natural language search", async () => {
    const Database = await loadDatabaseConstructor();
    if (!Database) {
      return;
    }

    const { migrateDatabase } = await import("../database/migrations");
    const { createFileCommands } = await import("../commands/file-commands");
    const db = new Database(":memory:");
    migrateDatabase(db, ":memory:");

    const commands = createFileCommands(createTestState(db), () => null);
    await expect(
      commands.filter_files(
        {
          filter: { natural_language_query: "red poster" },
          page: 1,
          pageSize: 20,
        },
        null,
      ),
    ).rejects.toThrow("请先在设置中选择本地自然语言搜索模型。");

    db.close();
  });
});
