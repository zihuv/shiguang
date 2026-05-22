export interface FileTag {
  id: number;
  name: string;
  color: string;
}

export interface FileItem {
  id: number;
  path: string;
  name: string;
  ext: string;
  size: number;
  width: number;
  height: number;
  folderId: number | null;
  createdAt: string;
  modifiedAt: string;
  importedAt: string;
  lastAccessedAt: string | null;
  rating: number;
  description: string;
  sourceUrl: string;
  dominantColor: string;
  colorDistribution: Array<{ color: string; percentage: number }>;
  thumbHash: string;
  contentHash?: string | null;
  tags: FileTag[];
  deletedAt?: string | null;
  missingAt?: string | null;
  trashPreviewPath?: string | null;
}

export type SmartCollectionId =
  | "all"
  | "unclassified"
  | "untagged"
  | "recent"
  | "random"
  | "similar";

export interface SmartCollectionStats {
  allCount: number;
  unclassifiedCount: number;
  untaggedCount: number;
}

export interface FolderNode {
  id: number;
  name: string;
  path: string;
  children: FolderNode[];
  fileCount: number;
  isSystem?: boolean;
  sortOrder?: number;
  parentId?: number | null;
}

export interface FolderSummary {
  id: number;
  name: string;
  path: string;
  parent_id: number | null;
  created_at: string;
}

export interface DeleteFolderResult {
  folderId: number;
  folderName: string;
  folderPath: string;
  removedFileCount: number;
  movedToTrash: boolean;
}

export interface TagNode {
  id: number;
  name: string;
  color: string;
  count: number;
  parentId: number | null;
  sortOrder?: number;
  children: TagNode[];
}

export type RawTag = Omit<TagNode, "children">;

export interface TrashFolderItem {
  kind: "folder";
  id: number;
  name: string;
  path: string;
  deletedAt: string;
  fileCount: number;
  subfolderCount: number;
}

export interface TrashFileItem extends FileItem {
  kind: "file";
}

export type TrashItem = TrashFileItem | TrashFolderItem;

export interface VisualSearchDebugScore {
  fileId: number;
  name: string;
  score: number;
}

export interface PaginatedFilesResponse {
  files: FileItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  debugScores?: VisualSearchDebugScore[];
}

export interface FileFilterPayload {
  query: string | null;
  natural_language_query: string | null;
  image_query_file_id: number | null;
  folder_id: number | null;
  smart_view: SmartCollectionId | null;
  smart_seed: number | null;
  file_types: string[] | null;
  date_start: string | null;
  date_end: string | null;
  size_min: number | null;
  size_max: number | null;
  tag_ids: number[] | null;
  min_rating: number | null;
  dominant_color: string | null;
  sort_by: string | null;
  sort_direction: string | null;
}

export interface BinaryImageImportItem {
  bytes?: Uint8Array;
  ext: string;
  sourcePath?: string;
  rating?: number;
  description?: string;
  sourceUrl?: string;
  tagIds?: number[];
}

interface ImportTaskItemBase {
  folderId?: number | null;
}

export type ImportTaskItem =
  | (ImportTaskItemBase & {
      kind: "file_path";
      path: string;
    })
  | (ImportTaskItemBase & {
      kind: "base64_image";
      base64Data: string;
      ext: string;
    })
  | (ImportTaskItemBase & {
      kind: "binary_image";
      bytes: Uint8Array;
      ext: string;
      rating?: number;
      description?: string;
      sourceUrl?: string;
      tagIds?: number[];
    })
  | (ImportTaskItemBase & {
      kind: "clipboard_file";
      sourcePath: string;
      ext?: string;
      rating?: number;
      description?: string;
      sourceUrl?: string;
      tagIds?: number[];
    });

export interface ImportTaskItemResult {
  index: number;
  status: string;
  source: string;
  error?: string | null;
  file?: FileItem | null;
}

export interface ImportTaskSnapshot {
  id: string;
  status: string;
  total: number;
  processed: number;
  successCount: number;
  failureCount: number;
  results: ImportTaskItemResult[];
}

export interface AiMetadataTaskItemResult {
  index: number;
  fileId: number;
  status: string;
  attempts: number;
  error?: string | null;
  file?: FileItem | null;
}

export interface AiMetadataTaskSnapshot {
  id: string;
  status: string;
  total: number;
  processed: number;
  successCount: number;
  failureCount: number;
  results: AiMetadataTaskItemResult[];
}

export interface VisualIndexTaskSnapshot {
  id: string;
  status: string;
  total: number;
  processed: number;
  indexedCount: number;
  failureCount: number;
  skippedCount: number;
  currentFileId?: number | null;
  currentFileName?: string | null;
  processUnindexedOnly: boolean;
}

export interface VisualIndexRebuildResult {
  total: number;
  indexed: number;
  failed: number;
  skipped: number;
}

export interface VisualIndexStatus {
  modelValid: boolean;
  message: string;
  modelId: string | null;
  version: string | null;
  requestedDevice: "auto" | "cpu" | "gpu" | null;
  providerPolicy: "auto" | "interactive" | "service" | null;
  runtimeLoaded: boolean;
  runtimeMode: "uninitialized" | "cpu_only" | "gpu_enabled" | "mixed" | "unknown" | null;
  effectiveProvider: "tensorrt" | "cuda" | "direct_ml" | "core_ml" | "cpu" | null;
  runtimeReason: string | null;
  indexedCount: number;
  failedCount: number;
  pendingCount: number;
  outdatedCount: number;
  totalImageCount: number;
}

export interface VisualModelValidationResult {
  valid: boolean;
  message: string;
  normalizedModelPath: string;
  modelId: string | null;
  version: string | null;
  embeddingDim: number | null;
  contextLength: number | null;
  missingFiles: string[];
}

export type VisualModelDownloadStatus =
  | "queued"
  | "scanning"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface VisualModelDownloadSnapshot {
  id: string;
  status: VisualModelDownloadStatus;
  repoId: string;
  modelName: string;
  mirrorUrl: string;
  targetDir: string;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  currentFileName?: string | null;
  error?: string | null;
}

export interface RestoreFilesResult {
  movedToUnclassifiedCount: number;
}

export interface RestoreFolderResult {
  restoredPath: string;
  originalPath: string;
}

export interface UpdateCheckResult {
  status: "disabled" | "checking" | "available" | "not-available" | "downloaded" | "error";
  message: string;
  version?: string;
  downloadUrl?: string;
}
