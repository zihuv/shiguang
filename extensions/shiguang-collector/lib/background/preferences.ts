export interface NormalizedPreferences {
  dragDockEnabled?: boolean;
  importConcurrency: string;
  targetFolderEnabled: boolean;
}

export type PreferencePatch = Partial<NormalizedPreferences>;

export const PREFERENCES_KEY = "shiguangCollectorPreferences";
export const DEFAULT_IMPORT_CONCURRENCY = 10;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizeOptionalNumberText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  return /^\d+$/.test(text) ? text : "";
}

export function normalizePreferences(value: unknown): NormalizedPreferences {
  const record = asRecord(value);
  if (!Object.keys(record).length) {
    return {
      importConcurrency: "",
      targetFolderEnabled: false,
    };
  }

  const preferences: NormalizedPreferences = {
    importConcurrency: normalizeOptionalNumberText(record.importConcurrency),
    targetFolderEnabled: record.targetFolderEnabled === true,
  };

  if (record.dragDockEnabled === false || record.dragDockEnabled === true) {
    preferences.dragDockEnabled = record.dragDockEnabled;
  }

  return preferences;
}

export function normalizePreferencePatch(value: unknown): PreferencePatch {
  const record = asRecord(value);
  if (!Object.keys(record).length) {
    return {};
  }

  const patch: PreferencePatch = {};
  if (hasOwn(record, "importConcurrency")) {
    patch.importConcurrency = normalizeOptionalNumberText(record.importConcurrency);
  }

  if (hasOwn(record, "targetFolderEnabled")) {
    patch.targetFolderEnabled = record.targetFolderEnabled === true;
  }

  if (
    hasOwn(record, "dragDockEnabled") &&
    (record.dragDockEnabled === false || record.dragDockEnabled === true)
  ) {
    patch.dragDockEnabled = record.dragDockEnabled;
  }

  return patch;
}

export class BackgroundPreferences {
  private cachedPreferences = normalizePreferences({});

  get current(): NormalizedPreferences {
    return this.cachedPreferences;
  }

  async read(): Promise<NormalizedPreferences> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(PREFERENCES_KEY, (result) => {
        this.cachedPreferences = normalizePreferences(result?.[PREFERENCES_KEY]);
        resolve(this.cachedPreferences);
      });
    });
  }

  watch(onChange: () => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[PREFERENCES_KEY]) {
        return;
      }

      this.cachedPreferences = normalizePreferences(changes[PREFERENCES_KEY].newValue);
      onChange();
    });
  }

  update(value: unknown): Promise<NormalizedPreferences> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(PREFERENCES_KEY, (result) => {
        const current = normalizePreferences(result?.[PREFERENCES_KEY]);
        const patch = normalizePreferencePatch(value);
        const next = normalizePreferences({ ...current, ...patch });
        chrome.storage.sync.set({ [PREFERENCES_KEY]: next }, () => {
          this.cachedPreferences = next;
          resolve(next);
        });
      });
    });
  }

  getImportConcurrency(): number {
    const configured = Number.parseInt(this.cachedPreferences.importConcurrency || "", 10);
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_IMPORT_CONCURRENCY;
    }

    return Math.min(configured, 20);
  }
}
