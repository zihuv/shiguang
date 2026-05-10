import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryNavigationHistoryStore } from "@/stores/libraryNavigationHistoryStore";

describe("libraryNavigationHistoryStore", () => {
  beforeEach(() => {
    useLibraryNavigationHistoryStore.getState().reset();
  });

  it("seeds the previous location and navigates back and forward", () => {
    const store = useLibraryNavigationHistoryStore.getState();

    store.visit({ type: "folder", folderId: 12 }, { type: "smart", smartCollection: "all" });

    expect(useLibraryNavigationHistoryStore.getState().canGoBack).toBe(true);
    expect(useLibraryNavigationHistoryStore.getState().canGoForward).toBe(false);

    expect(useLibraryNavigationHistoryStore.getState().goBack()).toEqual({
      type: "smart",
      smartCollection: "all",
    });
    expect(useLibraryNavigationHistoryStore.getState().canGoBack).toBe(false);
    expect(useLibraryNavigationHistoryStore.getState().canGoForward).toBe(true);

    expect(useLibraryNavigationHistoryStore.getState().goForward()).toEqual({
      type: "folder",
      folderId: 12,
    });
  });

  it("does not duplicate repeated visits to the current location", () => {
    const store = useLibraryNavigationHistoryStore.getState();

    store.visit({ type: "smart", smartCollection: "all" });
    store.visit({ type: "smart", smartCollection: "all" });

    expect(useLibraryNavigationHistoryStore.getState().entries).toEqual([
      { type: "smart", smartCollection: "all" },
    ]);
  });
});
