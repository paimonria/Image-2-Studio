import type { CatalogResponse, ImageRecord } from "@/lib/types";
import type { Locale } from "./copy";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function formatMilliseconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${value}ms`;

  return formatDuration(Math.round(value / 1000));
}

export function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";

  return `${Math.round(value)}%`;
}

export function getProviderLabel(catalog: CatalogResponse | null, provider: ImageRecord["provider"]) {
  return catalog?.providers.find((item) => item.provider === provider)?.label ?? provider;
}

export function getModelLabel(catalog: CatalogResponse | null, provider: ImageRecord["provider"], modelId: string) {
  return catalog?.models.find((item) => item.provider === provider && item.modelId === modelId)?.label ?? modelId;
}

export function getAspectRatioLabel(value: string) {
  if (value === "auto") return "Auto";
  return value;
}

export function getGenerationDetailLabel(input: { aspectRatio?: string | null; size?: string | null; quality?: string | null }) {
  const aspect = input.aspectRatio ? getAspectRatioLabel(input.aspectRatio) : "-";
  const size = input.size || "-";
  const quality = input.quality || "-";

  return `${aspect} / ${size} / ${quality}`;
}

export function formatLocalizedListCount(count: number, locale: Locale, unit: string) {
  return locale === "zh" ? `${count}${unit}` : `${count} ${unit}`;
}
