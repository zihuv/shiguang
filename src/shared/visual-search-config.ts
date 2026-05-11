export type VisualSearchRuntimeDevice = "auto" | "cpu" | "gpu";
export type VisualSearchProviderPolicy = "auto" | "interactive" | "service";
export type VisualSearchRuntimeThreadConfig = "auto" | number;

export interface VisualSearchRuntimeConfig {
  device: VisualSearchRuntimeDevice;
  providerPolicy: VisualSearchProviderPolicy;
  intraThreads: VisualSearchRuntimeThreadConfig;
  fgclipMaxPatches: number | null;
}

export interface VisualSearchConfig {
  enabled: boolean;
  modelPath: string;
  autoVectorizeOnImport: boolean;
  processUnindexedOnly: boolean;
  runtime: VisualSearchRuntimeConfig;
}

export const SUPPORTED_FGCLIP_MAX_PATCHES = [128, 256, 576, 784, 1024] as const;

export const DEFAULT_VISUAL_SEARCH_CONFIG: VisualSearchConfig = {
  enabled: false,
  modelPath: "",
  autoVectorizeOnImport: false,
  processUnindexedOnly: true,
  runtime: {
    device: "cpu",
    providerPolicy: "interactive",
    intraThreads: 4,
    fgclipMaxPatches: 256,
  },
};

export function cloneVisualSearchConfig(config: VisualSearchConfig): VisualSearchConfig {
  return {
    enabled: config.enabled,
    modelPath: config.modelPath,
    autoVectorizeOnImport: config.autoVectorizeOnImport,
    processUnindexedOnly: config.processUnindexedOnly,
    runtime: {
      device: config.runtime.device,
      providerPolicy: config.runtime.providerPolicy,
      intraThreads: config.runtime.intraThreads,
      fgclipMaxPatches: config.runtime.fgclipMaxPatches,
    },
  };
}

function resolveOptionalPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.round(parsed);
  return normalized > 0 ? normalized : null;
}

function resolveOptionalFgclipMaxPatches(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  const normalized = resolveOptionalPositiveInteger(value);
  if (normalized == null) {
    return DEFAULT_VISUAL_SEARCH_CONFIG.runtime.fgclipMaxPatches;
  }
  return SUPPORTED_FGCLIP_MAX_PATCHES.includes(
    normalized as (typeof SUPPORTED_FGCLIP_MAX_PATCHES)[number],
  )
    ? normalized
    : DEFAULT_VISUAL_SEARCH_CONFIG.runtime.fgclipMaxPatches;
}

function resolveVisualSearchRuntimeDevice(value: unknown): VisualSearchRuntimeDevice {
  if (value === "cpu" || value === "gpu" || value === "auto") {
    return value;
  }
  return DEFAULT_VISUAL_SEARCH_CONFIG.runtime.device;
}

function resolveVisualSearchProviderPolicy(value: unknown): VisualSearchProviderPolicy {
  if (value === "auto" || value === "interactive" || value === "service") {
    return value;
  }
  return DEFAULT_VISUAL_SEARCH_CONFIG.runtime.providerPolicy;
}

function resolveVisualSearchRuntimeThreads(value: unknown): VisualSearchRuntimeThreadConfig {
  if (typeof value === "string" && value.trim().toLowerCase() === "auto") {
    return "auto";
  }

  const normalized = resolveOptionalPositiveInteger(value);
  if (normalized != null) {
    return normalized;
  }

  return DEFAULT_VISUAL_SEARCH_CONFIG.runtime.intraThreads;
}

export function resolveVisualSearchRuntimeConfig(value: unknown): VisualSearchRuntimeConfig {
  const runtimeValue =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof VisualSearchRuntimeConfig, unknown>>)
      : null;

  return {
    device: resolveVisualSearchRuntimeDevice(runtimeValue?.device),
    providerPolicy: resolveVisualSearchProviderPolicy(runtimeValue?.providerPolicy),
    intraThreads: resolveVisualSearchRuntimeThreads(runtimeValue?.intraThreads),
    fgclipMaxPatches: resolveOptionalFgclipMaxPatches(runtimeValue?.fgclipMaxPatches),
  };
}

export function resolveVisualSearchConfig(value: unknown): VisualSearchConfig {
  if (!value || typeof value !== "object") {
    return cloneVisualSearchConfig(DEFAULT_VISUAL_SEARCH_CONFIG);
  }

  const config = value as Partial<Record<keyof VisualSearchConfig, unknown>>;
  return {
    enabled: Boolean(config.enabled),
    modelPath: typeof config.modelPath === "string" ? config.modelPath : "",
    autoVectorizeOnImport: Boolean(config.autoVectorizeOnImport),
    processUnindexedOnly:
      typeof config.processUnindexedOnly === "boolean"
        ? config.processUnindexedOnly
        : DEFAULT_VISUAL_SEARCH_CONFIG.processUnindexedOnly,
    runtime: resolveVisualSearchRuntimeConfig(config.runtime),
  };
}

export function parseVisualSearchConfig(raw: string | null): VisualSearchConfig {
  if (!raw) {
    return cloneVisualSearchConfig(DEFAULT_VISUAL_SEARCH_CONFIG);
  }

  try {
    return resolveVisualSearchConfig(JSON.parse(raw));
  } catch {
    return cloneVisualSearchConfig(DEFAULT_VISUAL_SEARCH_CONFIG);
  }
}
