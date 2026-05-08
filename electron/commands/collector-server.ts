import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fssync from "node:fs";
import path from "node:path";
import {
  BROWSER_COLLECTION_FOLDER_NAME,
  clearSystemFolderFlagById,
  clearSystemFolderFlagByName,
  createFolderRecord,
  getAllFolders,
  getFolderById,
  getFolderByPath,
  getFolderTree,
  getPrependFolderSortOrder,
  getIndexPaths,
} from "../database";
import { detectExtensionFromBytes } from "../media";
import type { AppState, FolderRecord } from "../types";
import {
  buildCollectorImportDescription,
  parseCollectorImportMetadata,
  type CollectorImportMetadata,
} from "./collector-import-metadata";
import { emit, type GetWindow } from "./common";
import { importBytes, normalizeImportExtension, runPostImportPipeline } from "./import-service";

let collectorServer: FastifyInstance | null = null;
const COLLECTOR_IMPORT_BODY_LIMIT_BYTES = 100 * 1024 * 1024;

type CollectorFolderTargetPayload = {
  folder_id?: unknown;
  folderId?: unknown;
  target_folder_id?: unknown;
  targetFolderId?: unknown;
};

export function ensureBrowserCollectionFolder(state: AppState): FolderRecord {
  const matchingFolders = getAllFolders(state.db).filter(
    (folder) => folder.name === BROWSER_COLLECTION_FOLDER_NAME,
  );
  if (matchingFolders.some((folder) => folder.isSystem)) {
    clearSystemFolderFlagByName(state.db, BROWSER_COLLECTION_FOLDER_NAME);
  }

  const existing =
    matchingFolders.find((folder) => folder.parent_id === null) ?? matchingFolders[0];
  if (existing) {
    return { ...existing, isSystem: false };
  }

  const folderPath = path.join(
    getIndexPaths(state.db)[0] ?? state.indexPath,
    BROWSER_COLLECTION_FOLDER_NAME,
  );
  fssync.mkdirSync(folderPath, { recursive: true });
  const pathExisting = getFolderByPath(state.db, folderPath);
  if (pathExisting) {
    if (pathExisting.isSystem) {
      clearSystemFolderFlagById(state.db, pathExisting.id);
    }
    return {
      ...pathExisting,
      isSystem: false,
    };
  }

  const id = createFolderRecord(
    state.db,
    folderPath,
    BROWSER_COLLECTION_FOLDER_NAME,
    null,
    false,
    getPrependFolderSortOrder(state.db, null),
  );
  return getFolderById(state.db, id) as FolderRecord;
}

function normalizeFolderId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const folderId = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(folderId) && folderId > 0 ? folderId : null;
}

function getRequestedFolderId(request: { query?: unknown; body?: unknown }): number | null {
  const query = request.query as CollectorFolderTargetPayload | undefined;
  const body = request.body as CollectorFolderTargetPayload | undefined;
  return normalizeFolderId(
    query?.folder_id ??
      query?.folderId ??
      query?.target_folder_id ??
      query?.targetFolderId ??
      body?.folder_id ??
      body?.folderId ??
      body?.target_folder_id ??
      body?.targetFolderId,
  );
}

function getRequestedSourceUrl(request: { query?: unknown; body?: unknown }): string {
  const query = request.query as
    | {
        source_url?: unknown;
        sourceUrl?: unknown;
        referer?: unknown;
      }
    | undefined;
  const body = request.body as
    | {
        source_url?: unknown;
        sourceUrl?: unknown;
        referer?: unknown;
      }
    | undefined;
  const value =
    query?.source_url ??
    query?.sourceUrl ??
    body?.source_url ??
    body?.sourceUrl ??
    body?.referer ??
    query?.referer;

  return typeof value === "string" ? value.trim() : "";
}

function parseCollectorMetadataHeader(value: unknown): CollectorImportMetadata | null {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (typeof headerValue !== "string" || !headerValue.trim()) {
    return null;
  }

  try {
    return parseCollectorImportMetadata(JSON.parse(decodeURIComponent(headerValue)));
  } catch {
    return null;
  }
}

function getRequestedMetadata(request: {
  headers?: Record<string, unknown>;
  body?: unknown;
}): CollectorImportMetadata | null {
  const fromHeader = parseCollectorMetadataHeader(
    request.headers?.["x-shiguang-collector-metadata"],
  );
  if (fromHeader) {
    return fromHeader;
  }

  const body = request.body as { metadata?: unknown } | undefined;
  return parseCollectorImportMetadata(body?.metadata);
}

function resolveCollectorTargetFolder(state: AppState, folderId: number | null): FolderRecord {
  if (folderId !== null) {
    const folder = getFolderById(state.db, folderId);
    if (!folder) {
      throw new Error("目标文件夹不存在");
    }
    return folder;
  }

  return ensureBrowserCollectionFolder(state);
}

export async function startCollectorServer(state: AppState, getWindow: GetWindow): Promise<void> {
  if (collectorServer) return;
  const server = Fastify({ logger: false });
  await server.register(cors, { origin: true });
  server.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
  server.get("/api/health", async () => ({ status: "ok" }));
  server.get("/api/folders", async () => {
    const defaultFolder = ensureBrowserCollectionFolder(state);
    return {
      success: true,
      folders: getFolderTree(state.db),
      default_folder_id: defaultFolder.id,
    };
  });
  server.options("/api/health", async () => ({}));
  server.options("/api/folders", async () => ({}));
  server.options("/api/import", async () => ({}));
  server.post("/api/import", { bodyLimit: COLLECTOR_IMPORT_BODY_LIMIT_BYTES }, async (request) => {
    const body = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(request.body as ArrayBuffer);
    try {
      const folder = resolveCollectorTargetFolder(state, getRequestedFolderId(request));
      const sourceUrl = getRequestedSourceUrl(request);
      const metadata = getRequestedMetadata(request);
      const query = request.query as { filename?: string };
      const filename = typeof query.filename === "string" ? query.filename : "";
      const headerContentType = request.headers["content-type"];
      const contentType = Array.isArray(headerContentType)
        ? headerContentType[0]
        : headerContentType;
      const file = await importBytes(state, {
        bytes: body,
        folderId: folder.id,
        fallbackExt: normalizeImportExtension(
          detectExtensionFromBytes(body, contentType) ?? path.extname(filename),
        ),
        namePrefix: "browser",
        sourceUrl,
        description: buildCollectorImportDescription(metadata, sourceUrl),
      });
      runPostImportPipeline(state, getWindow(), file, { source: "collector" });
      return { success: true, file_id: file.id, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit(getWindow(), "file-import-error", { error: message });
      return { success: false, file_id: null, error: message };
    }
  });
  await server.listen({ host: "127.0.0.1", port: 7845 });
  collectorServer = server;
}
