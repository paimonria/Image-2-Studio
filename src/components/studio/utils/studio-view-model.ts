import type { HistoryFilter } from "../state/studio-state";
import type { Locale } from "./copy";
import type { StudioLayout, StudioView } from "./generation-options";

type Translate = (key: string) => string;

export type HistoryFilterResetState = {
  historySearch: string;
  favoriteOnly: boolean;
  historyFilter: HistoryFilter;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
};

export type JobMonitorLabelInput = {
  locale: Locale;
  t: Translate;
  activeCount: number;
  failedCount: number;
  succeededCount: number;
};

export type LightboxLabelInput = {
  locale: Locale;
  t: Translate;
};

export function getResetHistoryFiltersState(): HistoryFilterResetState {
  return {
    historySearch: "",
    favoriteOnly: false,
    historyFilter: { provider: "all", model: "all" },
    historyBatchFilter: "all",
    historyProjectFilter: "all",
    historyTagFilter: ""
  };
}

export function getStudioMainClassName({
  activeView,
  studioLayout,
  selectedHistoryCount
}: {
  activeView: StudioView;
  studioLayout: StudioLayout;
  selectedHistoryCount: number;
}) {
  return [
    "main",
    `view-${activeView}`,
    `studio-layout-${studioLayout}`,
    selectedHistoryCount > 0 ? "has-selection-sidebar" : ""
  ].filter(Boolean).join(" ");
}

export function getJobMonitorLabels({
  locale,
  t,
  activeCount,
  failedCount,
  succeededCount
}: JobMonitorLabelInput) {
  return {
    title: locale === "zh" ? "\u4efb\u52a1\u76d1\u63a7" : "Job monitor",
    activity: locale === "zh" ? "\u6d3b\u52a8\u4e2d\u5fc3" : "Activity",
    summary: locale === "zh"
      ? `${activeCount} \u6392\u961f/\u8fd0\u884c / ${failedCount} \u5931\u8d25 / ${succeededCount} \u5b8c\u6210`
      : `${activeCount} active / ${failedCount} failed / ${succeededCount} done`,
    refreshJobs: locale === "zh" ? "\u5237\u65b0\u4efb\u52a1" : "Refresh jobs",
    batchPending: t("batchPending"),
    batchPaused: t("batchPaused"),
    batchRunning: t("batchRunning"),
    batchSucceeded: t("batchSucceeded"),
    batchFailed: t("batchFailed"),
    batchPause: t("batchPause"),
    batchResume: t("batchResume"),
    jobKill: t("jobKill"),
    batchRetry: t("batchRetry"),
    loadingMore: t("loadingMore"),
    openBatch: t("openBatch"),
    trackProgress: t("trackProgress"),
    viewResult: t("viewResult"),
    viewFailureReason: t("viewFailureReason"),
    jobBusy: t("jobBusy"),
    noRecentJobs: locale === "zh" ? "\u6682\u65e0\u6700\u8fd1\u4efb\u52a1\u3002" : "No recent jobs.",
    clearFinished: locale === "zh" ? "\u6e05\u7a7a\u5b8c\u6210/\u5931\u8d25" : "Clear finished",
    clearAlerts: locale === "zh" ? "\u6e05\u7a7a\u63d0\u793a" : "Clear alerts",
    refreshGallery: locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"
  };
}

export function getLightboxLabels({ locale, t }: LightboxLabelInput) {
  return {
    imagePreview: t("imagePreview"),
    closePreview: t("closePreview"),
    download: t("download"),
    preview: t("preview"),
    promptUsed: t("promptUsed"),
    copied: t("copied"),
    copyPrompt: t("copyPrompt"),
    zoomOut: locale === "zh" ? "\u7f29\u5c0f" : "Zoom out",
    resetZoom: locale === "zh" ? "\u91cd\u7f6e\u7f29\u653e" : "Reset zoom",
    zoomIn: locale === "zh" ? "\u653e\u5927" : "Zoom in",
    previousImage: locale === "zh" ? "\u4e0a\u4e00\u5f20" : "Previous",
    nextImage: locale === "zh" ? "\u4e0b\u4e00\u5f20" : "Next",
    fitToScreen: locale === "zh" ? "\u9002\u5e94\u5c4f\u5e55" : "Fit to screen",
    originalSize: locale === "zh" ? "100% \u539f\u56fe" : "100%",
    imageLoading: locale === "zh" ? "\u6b63\u5728\u52a0\u8f7d\u5927\u56fe" : "Loading image",
    imageLoadFailed: locale === "zh" ? "\u5927\u56fe\u52a0\u8f7d\u5931\u8d25" : "Image failed to load",
    openOriginal: locale === "zh" ? "\u6253\u5f00\u539f\u56fe" : "Open original"
  };
}
