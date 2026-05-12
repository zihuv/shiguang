import { afterEach, describe, expect, it, vi } from "vitest";

async function importFilterStore(rawPreference: string | null) {
  vi.resetModules();

  const getSetting = vi.fn().mockResolvedValue(rawPreference);
  const setSetting = vi.fn().mockResolvedValue(undefined);

  vi.doMock("@/services/desktop/indexing", () => ({
    getSetting,
    setSetting,
  }));

  const { useFilterStore } = await import("@/stores/filterStore");

  return { getSetting, setSetting, useFilterStore };
}

describe("filterStore", () => {
  afterEach(() => {
    vi.doUnmock("@/services/desktop/indexing");
    vi.resetModules();
  });

  it("loads persisted sort preferences", async () => {
    const { useFilterStore } = await importFilterStore(
      JSON.stringify({
        sortBy: "name",
        sortDirection: "asc",
      }),
    );

    await useFilterStore.getState().loadPreferences();

    expect(useFilterStore.getState().criteria).toMatchObject({
      fileType: "all",
      tagIds: [],
      dominantColor: null,
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  it("persists sort changes without persisting filter criteria changes", async () => {
    const { setSetting, useFilterStore } = await importFilterStore(null);

    await useFilterStore.getState().loadPreferences();

    useFilterStore.getState().setFileType("image");
    useFilterStore.getState().toggleTag(3);
    useFilterStore.getState().setDominantColor("#336699");
    useFilterStore.getState().clearFilters();

    expect(setSetting).not.toHaveBeenCalled();

    useFilterStore.getState().setSort("name", "asc");

    expect(setSetting).toHaveBeenCalledWith(
      "librarySortPreferences",
      JSON.stringify({ sortBy: "name", sortDirection: "asc" }),
    );
  });
});
