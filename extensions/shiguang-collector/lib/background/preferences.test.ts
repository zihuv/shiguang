import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMPORT_CONCURRENCY,
  normalizePreferencePatch,
  normalizePreferences,
} from "./preferences";

describe("background preference normalization", () => {
  it("keeps only known normalized preference values", () => {
    expect(
      normalizePreferences({
        dragDockEnabled: false,
        importConcurrency: " 12 ",
        targetFolderEnabled: true,
        unknown: true,
      }),
    ).toEqual({
      dragDockEnabled: false,
      importConcurrency: "12",
      targetFolderEnabled: true,
    });
  });

  it("drops invalid numbers and ignores non-boolean drag dock patches", () => {
    expect(
      normalizePreferencePatch({
        dragDockEnabled: "yes",
        importConcurrency: "abc",
        targetFolderEnabled: 1,
      }),
    ).toEqual({
      importConcurrency: "",
      targetFolderEnabled: false,
    });
    expect(DEFAULT_IMPORT_CONCURRENCY).toBe(10);
  });
});
