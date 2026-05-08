import { storage } from "@wxt-dev/storage";

export interface CollectorPreferences {
  dragDockEnabled?: boolean;
  importConcurrency?: string;
  targetFolderEnabled?: boolean;
}

export const collectorPreferences = storage.defineItem<CollectorPreferences>(
  "sync:shiguangCollectorPreferences",
  {
    fallback: {},
  },
);
