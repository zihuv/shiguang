import type { VisualModelDownloadSnapshot } from "@/shared/desktop-types";
import type { AiMetadataAnalysisField } from "@/lib/aiMetadataDefaults";
import type {
  VisualSearchProviderPolicy,
  VisualSearchRuntimeConfig,
  VisualSearchRuntimeDevice,
} from "@/stores/settingsStore";

export const RUNTIME_DEFAULT_SELECT_VALUE = "__default__";
export const DEFAULT_CUSTOM_INTRA_THREADS = 4;
export const THREAD_MODE_AUTO = "auto";
export const THREAD_MODE_CUSTOM = "custom";

export const VISUAL_SEARCH_DEVICE_OPTIONS: Array<{
  value: VisualSearchRuntimeDevice;
  label: string;
}> = [
  { value: "auto", label: "自动" },
  { value: "gpu", label: "GPU" },
  { value: "cpu", label: "CPU" },
];

export const VISUAL_SEARCH_PROVIDER_POLICY_OPTIONS: Array<{
  value: VisualSearchProviderPolicy;
  label: string;
}> = [
  { value: "interactive", label: "Interactive" },
  { value: "service", label: "Service" },
  { value: "auto", label: "Auto" },
];

export const AI_METADATA_FIELD_LABELS: Record<AiMetadataAnalysisField, string> = {
  filename: "文件名",
  tags: "标签",
  description: "备注",
  rating: "评价",
};

export function parseOptionalPositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getIntraThreadsMode(intraThreads: VisualSearchRuntimeConfig["intraThreads"]) {
  return typeof intraThreads === "number" ? THREAD_MODE_CUSTOM : THREAD_MODE_AUTO;
}

export function getCustomIntraThreadsInputValue(
  intraThreads: VisualSearchRuntimeConfig["intraThreads"],
) {
  return typeof intraThreads === "number"
    ? String(intraThreads)
    : String(DEFAULT_CUSTOM_INTRA_THREADS);
}

export function resolveCustomIntraThreadsValue(
  inputValue: string,
  currentIntraThreads: VisualSearchRuntimeConfig["intraThreads"],
) {
  return (
    parseOptionalPositiveInteger(inputValue) ??
    (typeof currentIntraThreads === "number" ? currentIntraThreads : DEFAULT_CUSTOM_INTRA_THREADS)
  );
}

export function getPercent(processed: number | undefined, total: number | undefined) {
  if (!total || total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round(((processed ?? 0) / total) * 100));
}

export function getVisualModelDownloadCountLabel(task: VisualModelDownloadSnapshot | null) {
  return task ? `${task.completedFiles}/${task.totalFiles || 0}` : "0/0";
}
