import type {
  AiMetadataTaskSnapshot,
  DeleteFolderResult,
  FileFilterPayload,
  FileItem,
  FolderNode,
  FolderSummary,
  ImportTaskItem,
  ImportTaskSnapshot,
  PaginatedFilesResponse,
  RawTag,
  RestoreFilesResult,
  RestoreFolderResult,
  SmartCollectionStats,
  TrashItem,
  UpdateCheckResult,
  VisualIndexRebuildResult,
  VisualIndexStatus,
  VisualIndexTaskSnapshot,
  VisualModelDownloadSnapshot,
  VisualModelValidationResult,
} from "./desktop-types";

export interface DesktopCommandMap {
  get_all_files: {
    args: { page: number; pageSize: number; sortBy: string; sortDirection: string };
    result: PaginatedFilesResponse;
  };
  search_files: {
    args: { query: string; page: number; pageSize: number; sortBy: string; sortDirection: string };
    result: PaginatedFilesResponse;
  };
  get_files_in_folder: {
    args: {
      folderId: number | null;
      page: number;
      pageSize: number;
      sortBy: string;
      sortDirection: string;
    };
    result: PaginatedFilesResponse;
  };
  get_file: { args: { fileId: number }; result: FileItem };
  filter_files: {
    args: { filter: FileFilterPayload; page: number; pageSize: number };
    result: PaginatedFilesResponse;
  };
  get_smart_collection_stats: { args: Record<string, never>; result: SmartCollectionStats };
  touch_file_last_accessed: { args: { fileId: number }; result: void };
  update_file_metadata: {
    args: { fileId: number; rating: number; description: string; sourceUrl: string };
    result: void;
  };
  update_file_dimensions: { args: { fileId: number; width: number; height: number }; result: void };
  get_or_create_thumb_hash: { args: { filePath: string }; result: string };
  extract_color: { args: { fileId: number }; result: string };
  update_file_name: { args: { fileId: number; newName: string }; result: void };
  analyze_file_metadata: { args: { fileId: number; imageDataUrl?: string }; result: FileItem };
  start_ai_metadata_task: { args: { fileIds: number[] }; result: AiMetadataTaskSnapshot };
  get_ai_metadata_task: { args: { taskId: string }; result: AiMetadataTaskSnapshot };
  cancel_ai_metadata_task: { args: { taskId: string }; result: void };
  rebuild_visual_index: { args: Record<string, never>; result: VisualIndexRebuildResult };
  start_visual_index_task: {
    args: { processUnindexedOnly: boolean };
    result: VisualIndexTaskSnapshot;
  };
  get_visual_index_task: { args: { taskId: string }; result: VisualIndexTaskSnapshot };
  cancel_visual_index_task: { args: { taskId: string }; result: void };
  get_visual_index_status: { args: Record<string, never>; result: VisualIndexStatus };
  complete_visual_index_browser_decode_request: {
    args: { requestId: string; imageDataUrl?: string; error?: string };
    result: void;
  };
  validate_visual_model_path: { args: { modelPath: string }; result: VisualModelValidationResult };
  get_recommended_visual_model_path: { args: Record<string, never>; result: string | null };
  start_visual_model_download: {
    args: { repoId: string; targetParentDir: string };
    result: VisualModelDownloadSnapshot;
  };
  cancel_visual_model_download: { args: { taskId: string }; result: void };
  test_ai_endpoint: { args: { target: "metadata" }; result: string };
  start_import_task: {
    args: { items: ImportTaskItem[]; folderId?: number | null };
    result: ImportTaskSnapshot;
  };
  get_import_task: { args: { taskId: string }; result: ImportTaskSnapshot };
  cancel_import_task: { args: { taskId: string }; result: void };
  retry_import_task: { args: { taskId: string }; result: ImportTaskSnapshot };

  get_folder_tree: { args: Record<string, never>; result: FolderNode[] };
  get_folder_size: { args: { folderId: number }; result: number };
  init_default_folder: { args: Record<string, never>; result: FolderSummary | null };
  create_folder: { args: { name: string; parentId: number | null }; result: FolderSummary };
  delete_folder: { args: { id: number }; result: DeleteFolderResult | null };
  rename_folder: { args: { id: number; name: string }; result: void };
  move_folder: {
    args: { folderId: number; newParentId: number | null; sortOrder: number };
    result: void;
  };
  reorder_folders: { args: { folderIds: number[] }; result: void };
  scan_folders: { args: Record<string, never>; result: number };

  get_all_tags: { args: Record<string, never>; result: RawTag[] };
  create_tag: { args: { name: string; color: string; parentId?: number | null }; result: void };
  update_tag: { args: { id: number; name: string; color: string }; result: void };
  delete_tag: { args: { id: number }; result: void };
  add_tag_to_file: { args: { fileId: number; tagId: number }; result: void };
  remove_tag_from_file: { args: { fileId: number; tagId: number }; result: void };
  reorder_tags: { args: { tagIds: number[]; parentId?: number | null }; result: void };
  move_tag: {
    args: { tagId: number; newParentId: number | null; sortOrder?: number };
    result: void;
  };

  delete_file: { args: { fileId: number }; result: void };
  delete_files: { args: { fileIds: number[] }; result: void };
  get_trash_files: { args: Record<string, never>; result: FileItem[] };
  get_trash_items: { args: Record<string, never>; result: TrashItem[] };
  restore_file: { args: { fileId: number }; result: RestoreFilesResult };
  restore_files: { args: { fileIds: number[] }; result: RestoreFilesResult };
  restore_folder: { args: { folderId: number }; result: RestoreFolderResult };
  restore_folders: { args: { folderIds: number[] }; result: RestoreFolderResult[] };
  permanent_delete_file: { args: { fileId: number }; result: void };
  permanent_delete_files: { args: { fileIds: number[] }; result: void };
  permanent_delete_folder: { args: { folderId: number }; result: void };
  permanent_delete_folders: { args: { folderIds: number[] }; result: void };
  empty_trash: { args: Record<string, never>; result: void };
  get_delete_mode: { args: Record<string, never>; result: boolean };
  set_delete_mode: { args: { useTrash: boolean }; result: void };
  get_trash_count: { args: Record<string, never>; result: number };
  get_trash_size: { args: Record<string, never>; result: number };

  get_app_version: { args: Record<string, never>; result: string };
  check_for_updates: { args: Record<string, never>; result: UpdateCheckResult };
  copy_file: { args: { fileId: number; targetFolderId: number | null }; result: void };
  copy_files: { args: { fileIds: number[]; targetFolderId: number | null }; result: void };
  move_file: { args: { fileId: number; targetFolderId: number | null }; result: void };
  move_files: { args: { fileIds: number[]; targetFolderId: number | null }; result: void };
  copy_files_to_clipboard: { args: { fileIds: number[] }; result: void };
  start_drag_files: { args: { fileIds: number[] }; result: void };
  open_file: { args: { fileId: number }; result: void };
  show_in_explorer: { args: { fileId: number }; result: void };
  show_folder_in_explorer: { args: { folderId: number }; result: void };
  show_current_library_in_explorer: { args: Record<string, never>; result: void };
  open_log_directory: { args: Record<string, never>; result: void };

  get_setting: { args: { key: string }; result: string | null };
  set_setting: { args: { key: string; value: string }; result: void };
  get_index_paths: { args: Record<string, never>; result: string[] };
  get_recent_index_paths: { args: Record<string, never>; result: string[] };
  get_default_index_path: { args: Record<string, never>; result: string };
  add_index_path: { args: { path: string }; result: void };
  remove_index_path: { args: { path: string }; result: void };
  switch_index_path_and_restart: { args: { path: string }; result: void };
  sync_index_path: { args: { path: string }; result: number };
  rebuild_library_index: { args: Record<string, never>; result: number };
  get_thumbnail_path: {
    args: { filePath: string; maxEdge?: number; allowBackgroundRequest?: boolean };
    result: string | null;
  };
  get_thumbnail_data_base64: {
    args: { filePath: string; maxEdge?: number };
    result: string | null;
  };
  get_thumbnail_cache_path: {
    args: { filePath: string; maxEdge?: number };
    result: string | null;
  };
  save_thumbnail_cache: {
    args: { filePath: string; dataBase64: string; maxEdge?: number };
    result: string | null;
  };
  init_browser_collection_folder: { args: Record<string, never>; result: FolderSummary };
}

export type DesktopCommandName = keyof DesktopCommandMap;
export type DesktopCommandArgs<Name extends DesktopCommandName> = DesktopCommandMap[Name]["args"];
export type DesktopCommandResult<Name extends DesktopCommandName> =
  DesktopCommandMap[Name]["result"];

export const WRITE_DESKTOP_COMMANDS = [
  "create_folder",
  "delete_folder",
  "rename_folder",
  "move_folder",
  "reorder_folders",
  "scan_folders",
  "init_browser_collection_folder",
  "update_file_metadata",
  "update_file_dimensions",
  "update_file_name",
  "get_or_create_thumb_hash",
  "extract_color",
  "start_import_task",
  "cancel_import_task",
  "retry_import_task",
  "touch_file_last_accessed",
  "save_thumbnail_cache",
  "create_tag",
  "update_tag",
  "delete_tag",
  "add_tag_to_file",
  "remove_tag_from_file",
  "reorder_tags",
  "move_tag",
  "delete_file",
  "delete_files",
  "restore_file",
  "restore_files",
  "restore_folder",
  "restore_folders",
  "permanent_delete_file",
  "permanent_delete_files",
  "permanent_delete_folder",
  "permanent_delete_folders",
  "empty_trash",
  "set_delete_mode",
  "copy_file",
  "copy_files",
  "move_file",
  "move_files",
  "set_setting",
  "add_index_path",
  "remove_index_path",
  "switch_index_path_and_restart",
  "sync_index_path",
  "rebuild_library_index",
  "copy_files_to_clipboard",
  "analyze_file_metadata",
  "start_ai_metadata_task",
  "cancel_ai_metadata_task",
  "rebuild_visual_index",
  "start_visual_index_task",
  "cancel_visual_index_task",
  "complete_visual_index_browser_decode_request",
  "start_visual_model_download",
  "cancel_visual_model_download",
] as const satisfies readonly DesktopCommandName[];
