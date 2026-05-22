import type { FileItem } from "@/stores/fileTypes";
import { useFolderStore } from "@/stores/folderStore";
import { usePreviewStore } from "@/stores/previewStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useSmartCollectionStore } from "@/stores/smartCollectionStore";
import { useTagStore } from "@/stores/tagStore";

export function clearLibraryFocusState() {
  useSelectionStore.getState().clearSelection();
  usePreviewStore.getState().closePreview();
  useSelectionStore.getState().setSelectedFile(null);
}

export function patchFileInSelectionAndPreview(updatedFile: FileItem) {
  const { selectedFile } = useSelectionStore.getState();
  if (selectedFile?.id === updatedFile.id) {
    useSelectionStore.getState().setSelectedFile(updatedFile);
  }

  usePreviewStore.setState((state) => ({
    previewFiles: state.previewFiles.map((file) =>
      file.id === updatedFile.id ? updatedFile : file,
    ),
  }));
}

export async function refreshLibraryTreeAndStats() {
  await useFolderStore.getState().loadFolders();
  await useSmartCollectionStore.getState().loadStats();
}

export async function refreshTagsAndSmartCollections() {
  await useTagStore.getState().loadTags();
  await useSmartCollectionStore.getState().loadStats();
}
