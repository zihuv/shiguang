import path from "node:path";
import {
  parseVisualSearchConfig,
  type VisualSearchConfig,
} from "../../src/shared/visual-search-config.js";

export type {
  VisualSearchConfig,
  VisualSearchProviderPolicy,
  VisualSearchRuntimeDevice,
  VisualSearchRuntimeThreadConfig,
} from "../../src/shared/visual-search-config.js";

export function resolveVisualSearchConfig(raw: string | null): VisualSearchConfig {
  return parseVisualSearchConfig(raw);
}

function normalizeVisualSearchModelPath(modelPath: string): string {
  const trimmed = modelPath.trim().replace(/^["']|["']$/g, "");
  return trimmed ? path.resolve(trimmed) : "";
}

export function getVisualSearchEmbeddingConfigKey(config: VisualSearchConfig): string {
  return JSON.stringify({
    modelPath: normalizeVisualSearchModelPath(config.modelPath),
    fgclipMaxPatches: config.runtime.fgclipMaxPatches ?? null,
  });
}

export function isVisualSearchEmbeddingConfigChanged(
  previousRaw: string | null,
  nextRaw: string | null,
): boolean {
  return (
    getVisualSearchEmbeddingConfigKey(resolveVisualSearchConfig(previousRaw)) !==
    getVisualSearchEmbeddingConfigKey(resolveVisualSearchConfig(nextRaw))
  );
}
