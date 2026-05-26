import type { ImageMode } from "@/lib/models";
import type { Locale } from "./copy";

export type StudioView = "gallery" | "studio";
export type StudioLayout = "controls-left" | "controls-right";
export type GenerationInputMode = "single" | "batch";
export type QuickMenu = "model" | "aspect" | "resolution" | "quality" | "fidelity" | null;

export const DEFAULT_SITE_TITLE = "Image-2 Studio";
export const DEFAULT_MODE: ImageMode = "text-to-image";
export const STUDIO_LAYOUT_STORAGE_KEY = "image2.studioLayout";
export const JOB_POLL_INTERVAL_MS = 2000;
export const JOB_POLL_TIMEOUT_MS = 20 * 60 * 1000;
export const BATCH_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
export const HISTORY_PAGE_SIZE = 30;
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_BATCH_PROMPTS = 20;
export const LIGHTBOX_BUTTON_ZOOM_STEP = 1.25;

export const RESOLUTION_OPTIONS = [
  { value: "1024", labels: { en: "1K (1024px)", zh: "1K (1024px)" } },
  { value: "2048", labels: { en: "2K (2048px)", zh: "2K (2048px)" } },
  { value: "4096", labels: { en: "4K (4096px, high load)", zh: "4K (4096px，高负载)" } }
] as const;

export const DEFAULT_RESOLUTION = "2048";
export const HIGH_LOAD_RESOLUTION = "4096";
export const OFFICIAL_OPENAI_RESOLUTION = "1024";

export function modelSupports(model: { capabilities: string[] } | undefined, capability: string) {
  return Boolean(model?.capabilities.includes(capability));
}

export function getResolutionLabel(value: string, locale: Locale) {
  return RESOLUTION_OPTIONS.find((item) => item.value === value)?.labels[locale] ?? `${value}px`;
}

export function isHighLoadResolution(value: string) {
  return value === HIGH_LOAD_RESOLUTION;
}

export function getOfficialOpenAIResolutionMessage(locale: Locale) {
  return locale === "zh"
    ? "官方 OpenAI 仅开放 1K；配置 OpenAI-compatible Base URL 后可使用 2K/4K。"
    : "Official OpenAI only allows 1K here. Configure an OpenAI-compatible Base URL to use 2K/4K.";
}

export function getHighLoadResolutionMessage(locale: Locale) {
  return locale === "zh"
    ? "4K 会显著增加上游网关负载，部分 OpenAI-compatible 网关可能拒绝或超时；如果失败请改用 2K。"
    : "4K is high load for upstream gateways. Some OpenAI-compatible gateways may reject it or time out; use 2K if it fails.";
}

export function getResolutionSelection(input: {
  supportsCustomSize: boolean;
  resolution: string;
  locale: Locale;
}) {
  if (!input.supportsCustomSize && input.resolution !== OFFICIAL_OPENAI_RESOLUTION) {
    return {
      resolution: OFFICIAL_OPENAI_RESOLUTION,
      error: getOfficialOpenAIResolutionMessage(input.locale)
    };
  }

  if (isHighLoadResolution(input.resolution)) {
    return {
      resolution: input.resolution,
      error: getHighLoadResolutionMessage(input.locale)
    };
  }

  return {
    resolution: input.resolution,
    error: ""
  };
}

export function getSizeFromAspectRatioAndResolution(aspectRatio: string, resolution: string) {
  const longEdge = Number.parseInt(resolution, 10);
  const safeLongEdge = Number.isFinite(longEdge) && longEdge > 0 ? longEdge : 1024;

  if (aspectRatio === "auto" || aspectRatio === "1:1") return `${safeLongEdge}x${safeLongEdge}`;

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return `${safeLongEdge}x${safeLongEdge}`;

  if (rawWidth >= rawHeight) {
    return `${safeLongEdge}x${Math.round((safeLongEdge * rawHeight) / rawWidth)}`;
  }

  return `${Math.round((safeLongEdge * rawWidth) / rawHeight)}x${safeLongEdge}`;
}

export function getOfficialOpenAIImageSize(aspectRatio: string) {
  if (aspectRatio === "auto" || aspectRatio === "1:1") return "1024x1024";

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return "1024x1024";

  if (rawWidth > rawHeight) return "1536x1024";
  if (rawHeight > rawWidth) return "1024x1536";
  return "1024x1024";
}

export function getComputedImageSize(aspectRatio: string, resolution: string, allowCustomSize: boolean) {
  if (!allowCustomSize && resolution === OFFICIAL_OPENAI_RESOLUTION) {
    return getOfficialOpenAIImageSize(aspectRatio);
  }

  return getSizeFromAspectRatioAndResolution(aspectRatio, resolution);
}
