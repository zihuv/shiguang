import Database from "better-sqlite3";
import {
  and,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { FILE_FORMAT_GROUPS } from "../../src/shared/file-formats";
import { getDrizzleDb } from "./client";
import { fileTags, files as filesTable } from "./schema";
import { buildOrderSql, parseHexColor } from "./shared";

const FILE_TYPE_EXTENSIONS: Record<string, readonly string[]> = FILE_FORMAT_GROUPS;

export function buildFileFilterWhere(db: Database.Database, filter: Record<string, unknown>): SQL {
  const conditions: SQL[] = [isNull(filesTable.deletedAt), isNull(filesTable.missingAt)];
  const query = String(filter.query ?? "").trim();
  if (query) {
    conditions.push(like(filesTable.name, `%${query}%`));
  }

  if (typeof filter.folder_id === "number") {
    conditions.push(eq(filesTable.folderId, filter.folder_id));
  }

  const smartView = String(filter.smart_view ?? "").trim();
  if (smartView === "unclassified") {
    conditions.push(isNull(filesTable.folderId));
  } else if (smartView === "untagged") {
    conditions.push(
      notExists(
        getDrizzleDb(db)
          .select({ one: sql`1` })
          .from(fileTags)
          .where(eq(fileTags.fileId, filesTable.id)),
      ),
    );
  } else if (smartView === "recent") {
    conditions.push(isNotNull(filesTable.lastAccessedAt));
  }

  const fileTypes = Array.isArray(filter.file_types) ? filter.file_types.map(String) : [];
  const extGroups = fileTypes.flatMap((type) => FILE_TYPE_EXTENSIONS[type] ?? []);
  if (extGroups.length) {
    conditions.push(inArray(sql`LOWER(${filesTable.ext})`, extGroups));
  }

  const dateStart = String(filter.date_start ?? "").trim();
  if (dateStart) {
    conditions.push(gte(filesTable.importedAt, dateStart));
  }
  const dateEnd = String(filter.date_end ?? "").trim();
  if (dateEnd) {
    conditions.push(lte(filesTable.importedAt, dateEnd));
  }

  if (typeof filter.size_min === "number") {
    conditions.push(gte(filesTable.size, filter.size_min));
  }
  if (typeof filter.size_max === "number") {
    conditions.push(lte(filesTable.size, filter.size_max));
  }
  if (typeof filter.min_rating === "number" && filter.min_rating > 0) {
    conditions.push(gte(filesTable.rating, filter.min_rating));
  }

  const tagIds = Array.isArray(filter.tag_ids)
    ? filter.tag_ids.filter((value) => typeof value === "number")
    : [];
  if (tagIds.length) {
    conditions.push(
      exists(
        getDrizzleDb(db)
          .select({ one: sql`1` })
          .from(fileTags)
          .where(and(eq(fileTags.fileId, filesTable.id), inArray(fileTags.tagId, tagIds))),
      ),
    );
  }

  const targetColor = String(filter.dominant_color ?? "").trim();
  if (targetColor) {
    const parsed = parseHexColor(targetColor);
    if (!parsed) {
      conditions.push(sql`1 = 0`);
    } else {
      const [r, g, b] = parsed;
      conditions.push(
        and(
          isNotNull(filesTable.dominantR),
          isNotNull(filesTable.dominantG),
          isNotNull(filesTable.dominantB),
          sql`(((${filesTable.dominantR} - ${r}) * (${filesTable.dominantR} - ${r})) + ((${filesTable.dominantG} - ${g}) * (${filesTable.dominantG} - ${g})) + ((${filesTable.dominantB} - ${b}) * (${filesTable.dominantB} - ${b}))) <= ${85 * 85}`,
        )!,
      );
    }
  }

  return and(...conditions)!;
}

export function buildFilteredFileOrder(filter: Record<string, unknown>) {
  const smartView = String(filter.smart_view ?? "").trim();
  if (smartView === "recent") {
    return sql`${filesTable.lastAccessedAt} DESC, ${filesTable.importedAt} DESC, ${filesTable.id} ASC`;
  }

  if (smartView === "random") {
    const rawSeed = Number(filter.smart_seed);
    const seed = Number.isInteger(rawSeed) ? Math.abs(rawSeed) + 1 : 1;
    return sql`ABS(((${filesTable.id} * ${seed}) + ${seed * 97 + 13}) % 2147483647) ASC, ${filesTable.id} ASC`;
  }

  return sql.raw(
    buildOrderSql(
      filter.sort_by as string | undefined,
      filter.sort_direction as string | undefined,
    ),
  );
}
