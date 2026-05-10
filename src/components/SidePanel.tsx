import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  FolderX,
  FolderOpen,
  Library,
  PanelLeftClose,
  Plus,
  RefreshCw,
  ScanSearch,
  Settings,
  Shuffle,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  appIconButtonClass,
  appPanelClass,
  appPanelMetaClass,
  appSectionLabelClass,
  appTreeRowClass,
} from "@/lib/ui";
import FolderTree from "@/components/FolderTree";
import { selectSmartCollectionFromSidebar } from "@/components/folder-tree/utils";
import { useFolderStore } from "@/stores/folderStore";
import { useImportStore } from "@/stores/importStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useSmartCollectionStore } from "@/stores/smartCollectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagStore } from "@/stores/tagStore";
import { useTrashStore } from "@/stores/trashStore";
import { isTerminalTaskStatus, type SmartCollectionId } from "@/stores/fileTypes";
import { getDesktopBridge } from "@/services/desktop/core";
import { showCurrentLibraryInExplorer } from "@/services/desktop/system";
import { IMPORT_DIALOG_EXTENSIONS } from "@/shared/file-formats";
import { cn } from "@/lib/utils";

const isMacPlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

interface SidePanelProps {
  onCollapse: () => void;
  onOpenSettings: () => void;
  width: number;
}

const SMART_COLLECTION_ITEMS: Array<{
  id: SmartCollectionId;
  label: string;
  icon: typeof Library;
}> = [
  { id: "all", label: "全部素材", icon: Library },
  { id: "unclassified", label: "未分类", icon: FolderX },
  { id: "untagged", label: "未标签", icon: Tag },
  { id: "recent", label: "最近使用", icon: Clock3 },
  { id: "random", label: "随机模式", icon: Shuffle },
  { id: "similar", label: "重复/相似", icon: ScanSearch },
];

export default function SidePanel({ onCollapse, onOpenSettings, width }: SidePanelProps) {
  const currentView = useNavigationStore((state) => state.currentView);
  const activeSmartCollection = useNavigationStore((state) => state.activeSmartCollection);
  const openTags = useNavigationStore((state) => state.openTags);
  const openTrash = useNavigationStore((state) => state.openTrash);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const importFiles = useImportStore((state) => state.importFiles);
  const importTask = useImportStore((state) => state.importTask);
  const { indexPaths, recentIndexPaths, rebuildIndex, switchIndexPath } = useSettingsStore();
  const tagCount = useTagStore((state) => state.flatTags.length);
  const trashCount = useTrashStore((state) => state.trashCount);
  const smartStats = useSmartCollectionStore((state) => state.stats);
  const loadSmartStats = useSmartCollectionStore((state) => state.loadStats);
  const currentIndexPath = indexPaths[0] ?? null;
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isSelectingLibrary, setIsSelectingLibrary] = useState(false);
  const [isRebuildingLibrary, setIsRebuildingLibrary] = useState(false);
  const libraryMenuRef = useRef<HTMLDivElement>(null);
  const isImporting = !!importTask && !isTerminalTaskStatus(importTask.status);
  const importCountLabel = `${importTask?.processed ?? 0}/${importTask?.total ?? 0}`;

  const currentLibraryName = useMemo(() => {
    if (!currentIndexPath) {
      return "未选择素材库";
    }
    const parts = currentIndexPath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? currentIndexPath;
  }, [currentIndexPath]);

  const recentLibraries = useMemo(
    () =>
      recentIndexPaths.map((libraryPath) => {
        const parts = libraryPath.split(/[\\/]/).filter(Boolean);
        return {
          path: libraryPath,
          name: parts[parts.length - 1] ?? libraryPath,
        };
      }),
    [recentIndexPaths],
  );

  useEffect(() => {
    void loadSmartStats();
  }, [loadSmartStats]);

  useEffect(() => {
    if (!isLibraryMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!libraryMenuRef.current?.contains(event.target as Node)) {
        setIsLibraryMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLibraryMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLibraryMenuOpen]);

  const navItemClass = (active: boolean) =>
    cn(
      appTreeRowClass,
      "cursor-pointer gap-1 px-1.5",
      active
        ? "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-border",
    );

  const getSmartCollectionCount = (smartCollection: SmartCollectionId) => {
    switch (smartCollection) {
      case "all":
        return smartStats.allCount;
      case "unclassified":
        return smartStats.unclassifiedCount;
      case "untagged":
        return smartStats.untaggedCount;
      default:
        return null;
    }
  };

  const handleSwitchLibrary = async (nextPath: string) => {
    try {
      const normalizedNextPath = nextPath.trim();
      if (!normalizedNextPath) {
        return;
      }

      if (normalizedNextPath === currentIndexPath) {
        toast.info("当前已经是这个素材库");
        return;
      }

      toast.info("正在切换素材库，应用将自动重启");
      setIsLibraryMenuOpen(false);
      await switchIndexPath(normalizedNextPath);
    } catch (error) {
      console.error("Failed to choose library:", error);
      toast.error(`切换素材库失败: ${String(error)}`);
    }
  };

  const handleChooseLibrary = async () => {
    setIsSelectingLibrary(true);
    try {
      const selected = await getDesktopBridge().dialog.open({
        properties: ["openDirectory", "createDirectory"],
        title: "选择素材库文件夹",
      });

      if (!selected || typeof selected !== "string") {
        return;
      }

      await handleSwitchLibrary(selected);
    } finally {
      setIsSelectingLibrary(false);
    }
  };

  const handleOpenCurrentLibrary = async () => {
    try {
      await showCurrentLibraryInExplorer();
      setIsLibraryMenuOpen(false);
    } catch (error) {
      console.error("Failed to open current library in explorer:", error);
      toast.error(`打开素材库失败: ${String(error)}`);
    }
  };

  const handleRebuildLibrary = async () => {
    setIsRebuildingLibrary(true);
    try {
      await rebuildIndex();
      toast.success("素材库索引已重建");
      setIsLibraryMenuOpen(false);
    } catch (error) {
      console.error("Failed to rebuild library:", error);
      toast.error(`重建索引失败: ${String(error)}`);
    } finally {
      setIsRebuildingLibrary(false);
    }
  };

  const handleImport = async () => {
    try {
      const selected = await getDesktopBridge().dialog.open({
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "素材文件",
            extensions: [...IMPORT_DIALOG_EXTENSIONS],
          },
        ],
        title: "选择要导入的素材",
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        void importFiles(paths);
      }
    } catch (error) {
      console.error("Failed to import files:", error);
      toast.error(`导入失败: ${String(error)}`);
    }
  };

  return (
    <aside className={`${appPanelClass} flex-shrink-0`} style={{ width }}>
      <div
        className={cn(
          "app-sidebar-chrome app-drag-region flex flex-shrink-0 px-2",
          isMacPlatform ? "app-sidebar-chrome-mac items-end pb-1" : "items-center",
        )}
      >
        <div className="app-no-drag flex w-full min-w-0 items-center gap-0.5">
          <div ref={libraryMenuRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              className={cn(
                "flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-gray-800 transition-colors hover:bg-black/[0.045] dark:text-gray-100 dark:hover:bg-white/[0.06]",
                isLibraryMenuOpen && "bg-black/[0.045] dark:bg-white/[0.06]",
              )}
              onClick={() => setIsLibraryMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={isLibraryMenuOpen}
              title={currentIndexPath ?? currentLibraryName}
            >
              <span className="truncate">{currentLibraryName}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform",
                  isLibraryMenuOpen && "rotate-180",
                )}
              />
            </button>

            {isLibraryMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[22rem] rounded-2xl bg-white/96 p-2 shadow-[0_14px_32px_rgba(0,0,0,0.12)] backdrop-blur dark:bg-[#171717]/96">
                <div className="rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-gray-900 dark:text-gray-100">
                    <span className="truncate">{currentLibraryName}</span>
                    <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  </div>
                  {currentIndexPath ? (
                    <p className="mt-1 break-all text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                      {currentIndexPath}
                    </p>
                  ) : null}
                </div>

                <div className="my-1 h-px bg-black/6 dark:bg-white/8" />

                <div className="flex flex-col">
                  {recentLibraries.length > 0 ? (
                    <>
                      <div className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        最近素材库
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto">
                        {recentLibraries.map((library) => (
                          <button
                            key={library.path}
                            type="button"
                            className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/8"
                            onClick={() => void handleSwitchLibrary(library.path)}
                          >
                            <span className="w-full truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">
                              {library.name}
                            </span>
                            <span className="w-full truncate text-[11px] text-gray-500 dark:text-gray-400">
                              {library.path}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="my-1 h-px bg-black/6 dark:bg-white/8" />
                    </>
                  ) : null}

                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-gray-700 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                    onClick={() => void handleChooseLibrary()}
                    disabled={isSelectingLibrary}
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                    {isSelectingLibrary ? "选择中..." : "更换素材库"}
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-gray-700 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                    onClick={() => void handleOpenCurrentLibrary()}
                  >
                    <FolderOpen className="h-4 w-4" />
                    在资源管理器中打开
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-gray-700 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                    onClick={() => void handleRebuildLibrary()}
                    disabled={isRebuildingLibrary}
                  >
                    <RefreshCw className={cn("h-4 w-4", isRebuildingLibrary && "animate-spin")} />
                    {isRebuildingLibrary ? "重建中..." : "重建索引"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={cn(appIconButtonClass, "size-7 flex-shrink-0")}
            onClick={() => void handleImport()}
            disabled={isImporting}
            title={isImporting ? `导入中 ${importCountLabel}` : "导入素材"}
            aria-label="导入素材"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(appIconButtonClass, "size-7 flex-shrink-0")}
            title="设置"
            aria-label="设置"
            onClick={onOpenSettings}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(appIconButtonClass, "size-7 flex-shrink-0 text-gray-400")}
            title="收起左侧栏"
            aria-label="收起左侧栏"
            onClick={onCollapse}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="app-sidebar-scroll min-h-0 flex-1 overflow-x-hidden">
        <div className="px-2 pb-1 pt-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={cn(appSectionLabelClass, "mb-0")}>快捷视图</span>
          </div>

          <div className="flex flex-col gap-1">
            {SMART_COLLECTION_ITEMS.map((item) => {
              const Icon = item.icon;
              const count = getSmartCollectionCount(item.id);
              const isActive =
                currentView === "library" &&
                ((item.id === "all" &&
                  selectedFolderId === null &&
                  activeSmartCollection === "all") ||
                  activeSmartCollection === item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={navItemClass(isActive)}
                  onClick={() => void selectSmartCollectionFromSidebar(item.id)}
                >
                  <span className="h-5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  <Icon className="h-[17px] w-[17px] flex-shrink-0" />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {typeof count === "number" && (
                    <span className={`${appPanelMetaClass} tabular-nums`}>{count}</span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              className={navItemClass(currentView === "tags")}
              onClick={openTags}
            >
              <span className="h-5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <Bookmark className="h-[17px] w-[17px] flex-shrink-0" />
              <span className="flex-1 truncate text-left">标签管理</span>
              {tagCount > 0 && (
                <span className={`${appPanelMetaClass} tabular-nums`}>{tagCount}</span>
              )}
            </button>

            <button
              type="button"
              className={navItemClass(currentView === "trash")}
              onClick={openTrash}
            >
              <span className="h-5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <Trash2 className="h-[17px] w-[17px] flex-shrink-0" />
              <span className="flex-1 truncate text-left">回收站</span>
              {trashCount > 0 && (
                <span className={`${appPanelMetaClass} tabular-nums`}>{trashCount}</span>
              )}
            </button>
          </div>
        </div>

        <div className="pt-3">
          <FolderTree showAllFilesRow={false} showHeader />
        </div>
      </div>
    </aside>
  );
}
