import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { ArrowUpDown, ChevronLeft, ChevronRight, Filter, Search, Sparkles, X } from "lucide-react";
import { INTERNAL_FILE_DRAG_MIME } from "@/components/folder-tree/utils";
import { getNameWithoutExt } from "@/stores/fileTypes";
import { type FileSortField, type SortDirection } from "@/stores/filterStore";
import { useLibraryQueryStore } from "@/stores/libraryQueryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  type LibraryViewMode,
  type LibraryVisibleField,
  useSettingsStore,
} from "@/stores/settingsStore";
import { getFile } from "@/services/desktop/files";
import {
  handlePrimaryClipboardShortcut,
  handlePrimarySelectAll,
} from "@/lib/textSelectionShortcuts";
import { cn } from "@/lib/utils";
import { appTagPillClass } from "@/lib/ui";
import { InfoDisplayIcon, ViewModeIcon } from "@/components/file-grid/fileGridCards";
import FilterPanel from "@/components/FilterPanel";

export type ToolbarMenu = "sort" | "layout" | "info";

const SORT_DIRECTION_OPTIONS: Array<{ value: SortDirection; label: string }> = [
  { value: "asc", label: "升序" },
  { value: "desc", label: "降序" },
];

const SORT_FIELD_OPTIONS: Array<{ value: FileSortField; label: string }> = [
  { value: "imported_at", label: "导入时间" },
  { value: "created_at", label: "创建时间" },
  { value: "modified_at", label: "修改时间" },
  { value: "name", label: "名称" },
  { value: "ext", label: "类型" },
  { value: "size", label: "文件大小" },
];

const VIEW_MODE_OPTIONS: Array<{ value: LibraryViewMode; label: string }> = [
  { value: "grid", label: "网格" },
  { value: "adaptive", label: "自适应" },
  { value: "list", label: "列表" },
];

const INFO_FIELD_OPTIONS: Array<{ value: LibraryVisibleField; label: string }> = [
  { value: "name", label: "名称" },
  { value: "ext", label: "类型" },
  { value: "size", label: "文件大小" },
  { value: "dimensions", label: "尺寸" },
  { value: "tags", label: "标签" },
];

const TOOLBAR_BUTTON_CLASS_NAME =
  "relative inline-flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors";

function getToolbarButtonClassName(isActive: boolean) {
  return cn(
    TOOLBAR_BUTTON_CLASS_NAME,
    isActive
      ? "bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-gray-100"
      : "bg-transparent hover:bg-gray-100/80 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200",
  );
}

interface FileGridToolbarProps {
  activeFilterCount: number;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  currentSortDirectionLabel: string;
  currentSortFieldLabel: string;
  currentViewModeLabel: string;
  currentViewScale: number;
  currentViewScaleRange: { min: number; max: number };
  isFilterPanelOpen: boolean;
  libraryVisibleFields: LibraryVisibleField[];
  openToolbarMenu: ToolbarMenu | null;
  resetCurrentViewScale: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  setOpenToolbarMenu: (menu: ToolbarMenu | null) => void;
  setSortBy: (sortBy: FileSortField) => void;
  setSortDirection: (sortDirection: SortDirection) => void;
  sortLocked?: boolean;
  toggleFilterPanel: () => void;
  toggleLibraryVisibleField: (field: LibraryVisibleField) => void;
  handleViewModeChange: (mode: LibraryViewMode) => void;
  applyCurrentViewScale: (scale: number) => void;
  filterMenuButtonRef: RefObject<HTMLButtonElement | null>;
  filterMenuRef: RefObject<HTMLDivElement | null>;
  layoutMenuButtonRef: RefObject<HTMLButtonElement | null>;
  layoutMenuRef: RefObject<HTMLDivElement | null>;
  infoMenuButtonRef: RefObject<HTMLButtonElement | null>;
  infoMenuRef: RefObject<HTMLDivElement | null>;
  sortMenuButtonRef: RefObject<HTMLButtonElement | null>;
  sortMenuRef: RefObject<HTMLDivElement | null>;
  sortBy: FileSortField;
  sortDirection: SortDirection;
  viewMode: LibraryViewMode;
  visibleInfoFieldLabels: string[];
}

export function FileGridToolbar({
  activeFilterCount,
  applyCurrentViewScale,
  canNavigateBack,
  canNavigateForward,
  currentSortDirectionLabel,
  currentSortFieldLabel,
  currentViewModeLabel,
  currentViewScale,
  currentViewScaleRange,
  filterMenuButtonRef,
  filterMenuRef,
  handleViewModeChange,
  infoMenuButtonRef,
  infoMenuRef,
  isFilterPanelOpen,
  layoutMenuButtonRef,
  layoutMenuRef,
  libraryVisibleFields,
  onNavigateBack,
  onNavigateForward,
  openToolbarMenu,
  resetCurrentViewScale,
  setOpenToolbarMenu,
  setSortBy,
  setSortDirection,
  sortLocked = false,
  sortBy,
  sortDirection,
  sortMenuButtonRef,
  sortMenuRef,
  toggleFilterPanel,
  toggleLibraryVisibleField,
  viewMode,
  visibleInfoFieldLabels,
}: FileGridToolbarProps) {
  const searchQuery = useLibraryQueryStore((state) => state.searchQuery);
  const setSearchQuery = useLibraryQueryStore((state) => state.setSearchQuery);
  const aiSearchEnabled = useLibraryQueryStore((state) => state.aiSearchEnabled);
  const setAiSearchEnabled = useLibraryQueryStore((state) => state.setAiSearchEnabled);
  const imageQueryFile = useLibraryQueryStore((state) => state.imageQueryFile);
  const searchSimilarToFile = useLibraryQueryStore((state) => state.searchSimilarToFile);
  const clearImageQuery = useLibraryQueryStore((state) => state.clearImageQuery);
  const { visualSearch, visualModelValidation } = useSettingsStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSearchDragOver, setIsSearchDragOver] = useState(false);
  const canUseAiSearch = Boolean(visualSearch.modelPath.trim() && visualModelValidation?.valid);
  const imageQueryLabel = imageQueryFile ? getNameWithoutExt(imageQueryFile.name) : "";
  const aiSearchTitle = canUseAiSearch
    ? aiSearchEnabled
      ? "关闭 AI 搜索"
      : "开启 AI 搜索"
    : "配置本地视觉模型后可用";

  useEffect(() => {
    if (!canUseAiSearch && aiSearchEnabled) {
      setAiSearchEnabled(false);
    }
  }, [aiSearchEnabled, canUseAiSearch, setAiSearchEnabled]);

  const toggleToolbarMenu = (menu: ToolbarMenu) => {
    setOpenToolbarMenu(openToolbarMenu === menu ? null : menu);
  };

  const hasInternalDragMime = (dataTransfer: DataTransfer | null) => {
    return !!dataTransfer && Array.from(dataTransfer.types).includes(INTERNAL_FILE_DRAG_MIME);
  };

  const getDraggingStoreFileId = () => {
    const { draggedPrimaryFileId, draggedFileIds } = useSelectionStore.getState();
    const fileId = draggedPrimaryFileId ?? draggedFileIds[0] ?? null;
    return Number.isInteger(fileId) && fileId > 0 ? fileId : null;
  };

  const isInternalAppFileDrag = (dataTransfer: DataTransfer | null) => {
    if (hasInternalDragMime(dataTransfer)) {
      return true;
    }

    const { isDraggingInternal, draggedFileIds } = useSelectionStore.getState();
    return isDraggingInternal && draggedFileIds.length > 0;
  };

  const getDraggedAppFileId = (dataTransfer: DataTransfer | null) => {
    if (!hasInternalDragMime(dataTransfer)) {
      return getDraggingStoreFileId();
    }

    try {
      if (!dataTransfer) {
        return getDraggingStoreFileId();
      }

      const parsed = JSON.parse(dataTransfer.getData(INTERNAL_FILE_DRAG_MIME)) as unknown;
      const fileId = Array.isArray(parsed) ? Number(parsed[0]) : Number(parsed);
      if (Number.isInteger(fileId) && fileId > 0) {
        return fileId;
      }
    } catch {
      // Electron can expose our drag session while hiding custom MIME data from the drop target.
    }

    return getDraggingStoreFileId();
  };

  const handleSearchDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isInternalAppFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsSearchDragOver(true);
  };

  const handleSearchDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsSearchDragOver(false);
  };

  const handleSearchDrop = async (event: DragEvent<HTMLDivElement>) => {
    const fileId = getDraggedAppFileId(event.dataTransfer);
    if (!fileId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      const selectionStore = useSelectionStore.getState();
      if (selectionStore.currentDragSessionId && !selectionStore.markInternalDropHandled()) {
        return;
      }

      const file = await getFile(fileId);
      await searchSimilarToFile({ id: file.id, name: file.name });
    } catch (error) {
      console.error("Failed to start image search:", error);
      toast.error("以图搜图失败");
    } finally {
      setIsSearchDragOver(false);
      useSelectionStore.getState().clearInternalFileDrag();
    }
  };

  const handleClearImageQuery = () => {
    clearImageQuery();
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (handlePrimarySelectAll(event) || handlePrimaryClipboardShortcut(event)) {
      return;
    }

    if (
      imageQueryFile &&
      !searchQuery &&
      !event.nativeEvent.isComposing &&
      (event.key === "Backspace" || event.key === "Delete")
    ) {
      event.preventDefault();
      handleClearImageQuery();
    }
  };

  return (
    <div className="app-main-chrome app-drag-region relative z-20 flex flex-shrink-0 flex-col justify-center bg-transparent px-3">
      <div className="flex h-8 items-center gap-2">
        <div className="app-no-drag flex items-center gap-0.5">
          <button
            type="button"
            className={cn(
              getToolbarButtonClassName(false),
              "size-7",
              !canNavigateBack && "opacity-45",
            )}
            title="后退"
            aria-label="后退"
            disabled={!canNavigateBack}
            onClick={onNavigateBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(
              getToolbarButtonClassName(false),
              "size-7",
              !canNavigateForward && "opacity-45",
            )}
            title="前进"
            aria-label="前进"
            disabled={!canNavigateForward}
            onClick={onNavigateForward}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div
          className={cn(
            "app-no-drag relative flex h-8 min-w-[10rem] max-w-[17rem] flex-[0_1_17rem] cursor-text items-center gap-1.5 rounded-[10px] border border-transparent bg-black/[0.035] pr-1.5 text-[13px] text-gray-800 transition-[border-color,box-shadow,background-color,color] focus-within:border-primary-500/35 focus-within:bg-black/[0.05] focus-within:ring-2 focus-within:ring-primary-500/18 dark:bg-white/[0.05] dark:text-gray-200 dark:focus-within:border-primary-500/40 dark:focus-within:bg-white/[0.07]",
            imageQueryFile ? "pl-2" : "pl-8",
            imageQueryFile && "border-primary-500/25 dark:border-primary-500/35",
            isSearchDragOver &&
              "border-primary-500/40 bg-primary-500/8 ring-2 ring-primary-500/18 dark:bg-primary-500/12",
          )}
          onClick={() => searchInputRef.current?.focus()}
          onDragEnter={handleSearchDragOver}
          onDragLeave={handleSearchDragLeave}
          onDragOver={handleSearchDragOver}
          onDrop={(event) => void handleSearchDrop(event)}
        >
          {!imageQueryFile ? (
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          ) : null}
          {imageQueryFile ? (
            <span
              className={cn(
                appTagPillClass,
                "h-5 min-w-0 max-w-[78%] flex-shrink bg-primary-600 py-0 pl-2 pr-1 text-[11px] text-primary-50 dark:bg-primary-500 dark:text-white",
              )}
              title={`以图搜图：${imageQueryFile.name}`}
            >
              <span className="truncate">以图搜图：{imageQueryLabel}</span>
              <button
                type="button"
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/18"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClearImageQuery();
                }}
                title="移除以图搜图"
                aria-label="移除以图搜图"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          <input
            ref={searchInputRef}
            type="text"
            placeholder={imageQueryFile ? "" : aiSearchEnabled ? "AI 搜索图片..." : "搜索文件名"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="input-system-font h-full min-w-[48px] flex-1 border-0 bg-transparent p-0 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-200"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <button
            type="button"
            role="switch"
            aria-checked={aiSearchEnabled}
            aria-label="AI 搜索"
            disabled={!canUseAiSearch}
            title={aiSearchTitle}
            onClick={(event) => {
              event.stopPropagation();
              setAiSearchEnabled(!aiSearchEnabled);
            }}
            className={cn(
              "inline-flex size-6 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              aiSearchEnabled
                ? "bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
                : "text-gray-400 hover:bg-black/[0.05] hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/[0.07] dark:hover:text-gray-200",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1" />

        <div className="app-no-drag flex items-center gap-1.5">
          <div className="hidden items-center sm:flex" onDoubleClick={resetCurrentViewScale}>
            <input
              type="range"
              min={currentViewScaleRange.min}
              max={currentViewScaleRange.max}
              step={0.02}
              value={currentViewScale}
              onChange={(event) => applyCurrentViewScale(Number(event.target.value))}
              className="h-1 w-16 cursor-pointer accent-gray-400 opacity-70 transition-opacity hover:opacity-100 dark:accent-gray-500"
              aria-label="当前视图缩放"
            />
          </div>
          <button
            ref={filterMenuButtonRef}
            type="button"
            onClick={() => {
              setOpenToolbarMenu(null);
              toggleFilterPanel();
            }}
            className={getToolbarButtonClassName(activeFilterCount > 0)}
            title={activeFilterCount > 0 ? `筛选：已启用 ${activeFilterCount} 项` : "筛选"}
            aria-label="筛选"
            aria-expanded={isFilterPanelOpen}
            aria-pressed={isFilterPanelOpen}
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && (
              <span className="pointer-events-none absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-semibold leading-none text-white dark:bg-gray-100 dark:text-gray-900">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              ref={sortMenuButtonRef}
              type="button"
              onClick={() => {
                if (sortLocked) {
                  return;
                }
                toggleToolbarMenu("sort");
              }}
              className={cn(
                getToolbarButtonClassName(openToolbarMenu === "sort"),
                sortLocked && "cursor-default opacity-60",
              )}
              title={
                sortLocked
                  ? `当前视图固定为${currentSortFieldLabel}`
                  : `排序：${currentSortFieldLabel} · ${currentSortDirectionLabel}`
              }
              aria-label="排序"
              aria-expanded={sortLocked ? false : openToolbarMenu === "sort"}
              disabled={sortLocked}
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>

            {openToolbarMenu === "sort" && !sortLocked && (
              <div
                ref={sortMenuRef}
                className="absolute right-0 top-10 z-30 w-52 rounded-2xl bg-white/98 p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.14)] backdrop-blur dark:bg-dark-surface/98 dark:shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="app-kicker px-3 pb-1 pt-2 text-gray-400">排序方式</div>
                {SORT_DIRECTION_OPTIONS.map((option) => {
                  const isActive = sortDirection === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortDirection(option.value);
                        setOpenToolbarMenu(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-border",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isActive ? "bg-current" : "bg-transparent",
                        )}
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
                <div className="px-3 pb-1 pt-2 text-[11px] font-medium tracking-[0.08em] text-gray-400">
                  排序依据
                </div>
                {SORT_FIELD_OPTIONS.map((option) => {
                  const isActive = sortBy === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortBy(option.value);
                        setOpenToolbarMenu(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-border",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isActive ? "bg-current" : "bg-transparent",
                        )}
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              ref={infoMenuButtonRef}
              type="button"
              onClick={() => toggleToolbarMenu("info")}
              className={getToolbarButtonClassName(openToolbarMenu === "info")}
              title={`信息显示：${visibleInfoFieldLabels.join(" · ") || "无"}`}
              aria-label="信息显示"
              aria-expanded={openToolbarMenu === "info"}
            >
              <InfoDisplayIcon className="h-[18px] w-[18px]" />
            </button>

            {openToolbarMenu === "info" && (
              <div
                ref={infoMenuRef}
                className="absolute right-0 top-10 z-30 w-52 rounded-2xl bg-white/98 p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.14)] backdrop-blur dark:bg-dark-surface/98 dark:shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="app-kicker px-3 pb-1 pt-2 text-gray-400">信息显示</div>
                {INFO_FIELD_OPTIONS.map((option) => {
                  const isActive = libraryVisibleFields.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleLibraryVisibleField(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-border",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                          isActive
                            ? "border-current bg-current/10"
                            : "border-gray-300 text-transparent dark:border-gray-600",
                        )}
                      >
                        ✓
                      </span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              ref={layoutMenuButtonRef}
              type="button"
              onClick={() => toggleToolbarMenu("layout")}
              className={getToolbarButtonClassName(openToolbarMenu === "layout")}
              title={`布局：${currentViewModeLabel}`}
              aria-label="布局"
              aria-expanded={openToolbarMenu === "layout"}
            >
              <ViewModeIcon mode={viewMode} className="h-4 w-4" />
            </button>

            {openToolbarMenu === "layout" && (
              <div
                ref={layoutMenuRef}
                className="absolute right-0 top-10 z-30 w-44 rounded-2xl bg-white/98 p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.14)] backdrop-blur dark:bg-dark-surface/98 dark:shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="app-kicker px-3 pb-1 pt-2 text-gray-400">布局</div>
                {VIEW_MODE_OPTIONS.map((option) => {
                  const isActive = viewMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleViewModeChange(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-border",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isActive ? "bg-current" : "bg-transparent",
                        )}
                      />
                      <ViewModeIcon mode={option.value} className="h-4 w-4 flex-shrink-0" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {isFilterPanelOpen && (
        <div ref={filterMenuRef} className="app-no-drag pb-2 pt-2">
          <FilterPanel />
        </div>
      )}
    </div>
  );
}

interface FileGridPaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
}

export function FileGridPagination({
  page,
  pageSize,
  totalPages,
  setPage,
  setPageSize,
}: FileGridPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        onClick={() => setPage(1)}
        disabled={page <= 1}
        className="rounded-lg px-2.5 py-1 text-[13px] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-dark-border"
      >
        首页
      </button>
      <button
        onClick={() => setPage(page - 1)}
        disabled={page <= 1}
        className="rounded-lg px-2.5 py-1 text-[13px] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-dark-border"
      >
        上一页
      </button>
      <span className="text-[13px] text-gray-600 dark:text-gray-400">
        第 {page} / {totalPages} 页
      </span>
      <button
        onClick={() => setPage(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg px-2.5 py-1 text-[13px] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-dark-border"
      >
        下一页
      </button>
      <button
        onClick={() => setPage(totalPages)}
        disabled={page >= totalPages}
        className="rounded-lg px-2.5 py-1 text-[13px] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-dark-border"
      >
        末页
      </button>
      <select
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value))}
        className="ml-2 rounded-lg border px-2 py-1 text-[13px] hover:bg-gray-50 dark:hover:bg-dark-border"
      >
        <option value={50}>50/页</option>
        <option value={100}>100/页</option>
        <option value={200}>200/页</option>
        <option value={500}>500/页</option>
      </select>
    </div>
  );
}

interface FileGridSelectionBarProps {
  selectedCount: number;
  showBatchDeleteConfirm: boolean;
  clearSelection: () => void;
  handleBatchDelete: () => Promise<void>;
  setShowBatchDeleteConfirm: (open: boolean) => void;
}

export function FileGridSelectionBar({
  selectedCount,
  showBatchDeleteConfirm,
  clearSelection,
  handleBatchDelete,
  setShowBatchDeleteConfirm,
}: FileGridSelectionBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 transform flex-wrap items-center justify-center gap-3 rounded-2xl bg-white/96 px-4 py-2 shadow-xl backdrop-blur dark:bg-dark-surface/96">
      <span className="whitespace-nowrap text-[13px] font-medium text-gray-700 dark:text-gray-200">
        已选择 {selectedCount} 个文件
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={clearSelection}
          className="whitespace-nowrap rounded-xl bg-gray-100 px-3 py-1 text-[13px] text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          取消选择
        </button>
        {showBatchDeleteConfirm ? (
          <>
            <button
              onClick={() => void handleBatchDelete()}
              className="whitespace-nowrap rounded-xl bg-red-500 px-3 py-1 text-[13px] text-white hover:bg-red-600"
            >
              确认删除
            </button>
            <button
              onClick={() => setShowBatchDeleteConfirm(false)}
              className="whitespace-nowrap rounded-xl bg-gray-100 px-3 py-1 text-[13px] text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              取消
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowBatchDeleteConfirm(true)}
            className="whitespace-nowrap rounded-xl bg-red-500 px-3 py-1 text-[13px] text-white hover:bg-red-600"
          >
            批量删除
          </button>
        )}
      </div>
    </div>
  );
}
