import type { SmartCollectionId } from "@/stores/fileTypes";

type ImageQueryFileLike = {
  id: number;
};

function isGlobalSmartCollection(smartCollection: SmartCollectionId | null) {
  return smartCollection !== null && smartCollection !== "all";
}

export type LibraryQueryPlan =
  | {
      type: "loadFolder";
      folderId: number | null;
    }
  | {
      type: "filter";
      filter: {
        query?: string;
        naturalLanguageQuery?: string;
        imageQueryFileId?: number | null;
        folderId?: number | null;
        smartView?: SmartCollectionId | null;
        smartSeed?: number | null;
      };
    };

export function resolveLibraryQueryFolderId(args: {
  activeSmartCollection: SmartCollectionId | null;
  selectedFolderId: number | null;
  folderIdOverride?: number | null;
}) {
  const { activeSmartCollection, selectedFolderId, folderIdOverride } = args;
  if (isGlobalSmartCollection(activeSmartCollection)) {
    return null;
  }

  return folderIdOverride !== undefined ? folderIdOverride : selectedFolderId;
}

export function buildLibraryQueryPlan(args: {
  activeSmartCollection: SmartCollectionId | null;
  randomSeed: number | null;
  selectedFolderId: number | null;
  folderIdOverride?: number | null;
  searchQuery: string;
  imageQueryFile: ImageQueryFileLike | null;
  aiSearchEnabled: boolean;
  hasStructuredFilters: boolean;
}): LibraryQueryPlan {
  const {
    activeSmartCollection,
    randomSeed,
    selectedFolderId,
    folderIdOverride,
    searchQuery,
    imageQueryFile,
    aiSearchEnabled,
    hasStructuredFilters,
  } = args;
  const hasSmartCollectionQuery = isGlobalSmartCollection(activeSmartCollection);
  const folderId = resolveLibraryQueryFolderId({
    activeSmartCollection,
    selectedFolderId,
    folderIdOverride,
  });
  const trimmedSearchQuery = searchQuery.trim();
  const textQuery = imageQueryFile || !trimmedSearchQuery ? undefined : trimmedSearchQuery;
  const filter = {
    query: aiSearchEnabled ? undefined : textQuery,
    naturalLanguageQuery: aiSearchEnabled ? textQuery : undefined,
    imageQueryFileId: imageQueryFile?.id,
    folderId,
    smartView: activeSmartCollection,
    smartSeed: randomSeed,
  };

  if (hasStructuredFilters || hasSmartCollectionQuery || imageQueryFile || trimmedSearchQuery) {
    return {
      type: "filter",
      filter,
    };
  }

  return {
    type: "loadFolder",
    folderId,
  };
}

export function roundVisualSearchDebugScore(score: number) {
  return Number(score.toFixed(6));
}

function getAscendingPercentile(scores: number[], percentile: number) {
  const index = Math.max(0, Math.ceil(scores.length * percentile) - 1);
  return scores[Math.min(index, scores.length - 1)] ?? 0;
}

export function buildPageScoreSummary(debugScores: Array<{ score: number }>) {
  const scores = debugScores
    .map((entry) => entry.score)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  if (!scores.length) {
    return null;
  }

  return {
    count: scores.length,
    top: scores[scores.length - 1],
    p90: getAscendingPercentile(scores, 0.9),
    p50: getAscendingPercentile(scores, 0.5),
    min: scores[0],
  };
}
