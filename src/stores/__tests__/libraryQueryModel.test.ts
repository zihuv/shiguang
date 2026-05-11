import { describe, expect, it } from "vitest";
import {
  buildLibraryQueryPlan,
  buildPageScoreSummary,
  resolveLibraryQueryFolderId,
  roundVisualSearchDebugScore,
} from "@/stores/libraryQueryModel";

describe("libraryQueryModel", () => {
  it("ignores stale folder ids for global smart collections", () => {
    expect(
      resolveLibraryQueryFolderId({
        activeSmartCollection: "similar",
        selectedFolderId: 12,
        folderIdOverride: 12,
      }),
    ).toBeNull();
  });

  it("keeps folder scope for regular library queries", () => {
    expect(
      resolveLibraryQueryFolderId({
        activeSmartCollection: null,
        selectedFolderId: 12,
      }),
    ).toBe(12);
    expect(
      resolveLibraryQueryFolderId({
        activeSmartCollection: "all",
        selectedFolderId: 12,
        folderIdOverride: null,
      }),
    ).toBeNull();
  });

  it("loads the resolved folder when there is no active query", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: "all",
        randomSeed: 7,
        selectedFolderId: 12,
        searchQuery: "   ",
        imageQueryFile: null,
        aiSearchEnabled: false,
        hasStructuredFilters: false,
      }),
    ).toEqual({
      type: "loadFolder",
      folderId: 12,
    });

    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: null,
        randomSeed: null,
        selectedFolderId: 12,
        folderIdOverride: null,
        searchQuery: "",
        imageQueryFile: null,
        aiSearchEnabled: false,
        hasStructuredFilters: false,
      }),
    ).toEqual({
      type: "loadFolder",
      folderId: null,
    });
  });

  it("builds a fuzzy text filter from a trimmed search query", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: "all",
        randomSeed: null,
        selectedFolderId: 12,
        searchQuery: "  poster  ",
        imageQueryFile: null,
        aiSearchEnabled: false,
        hasStructuredFilters: false,
      }),
    ).toEqual({
      type: "filter",
      filter: {
        query: "poster",
        naturalLanguageQuery: undefined,
        imageQueryFileId: undefined,
        folderId: 12,
        smartView: "all",
        smartSeed: null,
      },
    });
  });

  it("switches text search to natural language query when AI search is enabled", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: "all",
        randomSeed: null,
        selectedFolderId: 12,
        searchQuery: "  red package  ",
        imageQueryFile: null,
        aiSearchEnabled: true,
        hasStructuredFilters: false,
      }),
    ).toMatchObject({
      type: "filter",
      filter: {
        query: undefined,
        naturalLanguageQuery: "red package",
        folderId: 12,
      },
    });
  });

  it("uses image query id and suppresses text query", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: null,
        randomSeed: null,
        selectedFolderId: 12,
        searchQuery: "ignored",
        imageQueryFile: { id: 99 },
        aiSearchEnabled: true,
        hasStructuredFilters: false,
      }),
    ).toMatchObject({
      type: "filter",
      filter: {
        query: undefined,
        naturalLanguageQuery: undefined,
        imageQueryFileId: 99,
        folderId: 12,
      },
    });
  });

  it("keeps smart collection queries global and carries the random seed", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: "random",
        randomSeed: 42,
        selectedFolderId: 12,
        folderIdOverride: 12,
        searchQuery: "",
        imageQueryFile: null,
        aiSearchEnabled: false,
        hasStructuredFilters: false,
      }),
    ).toEqual({
      type: "filter",
      filter: {
        query: undefined,
        naturalLanguageQuery: undefined,
        imageQueryFileId: undefined,
        folderId: null,
        smartView: "random",
        smartSeed: 42,
      },
    });
  });

  it("uses the filter path for structured filters without inventing a text query", () => {
    expect(
      buildLibraryQueryPlan({
        activeSmartCollection: null,
        randomSeed: null,
        selectedFolderId: 12,
        searchQuery: "",
        imageQueryFile: null,
        aiSearchEnabled: false,
        hasStructuredFilters: true,
      }),
    ).toMatchObject({
      type: "filter",
      filter: {
        query: undefined,
        naturalLanguageQuery: undefined,
        folderId: 12,
      },
    });
  });

  it("summarizes finite visual search scores", () => {
    expect(
      buildPageScoreSummary([
        { score: 0.1 },
        { score: Number.NaN },
        { score: 0.9 },
        { score: 0.5 },
        { score: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual({
      count: 3,
      top: 0.9,
      p90: 0.9,
      p50: 0.5,
      min: 0.1,
    });

    expect(buildPageScoreSummary([{ score: Number.NaN }])).toBeNull();
  });

  it("rounds visual search scores for stable debug logging", () => {
    expect(roundVisualSearchDebugScore(0.12345678)).toBe(0.123457);
  });
});
