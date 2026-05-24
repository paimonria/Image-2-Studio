"use client";

import {
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Archive,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  ImagePlus,
  Languages,
  Loader2,
  LogOut,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserCog,
  Wand2,
  X
} from "lucide-react";
import type {
  CatalogResponse,
  CreateImageJobResponse,
  ImageBatchDetailResponse,
  ImageJobResponse,
  ImageProjectResponse,
  ImageRecord,
  PromptTemplateResponse
} from "@/lib/types";
import { GalleryPanel, getGalleryLabels } from "@/components/studio/gallery";
import { useAdminPanel } from "@/components/studio/hooks/use-admin-panel";
import { useAuthSession } from "@/components/studio/hooks/use-auth-session";
import { useGalleryData } from "@/components/studio/hooks/use-gallery-data";
import { useGenerationRuns, type PendingGeneration } from "@/components/studio/hooks/use-generation-runs";
import { batchItemToGenerationItem, type BatchGenerationItem, useImageJobs } from "@/components/studio/hooks/use-image-jobs";
import { useLightboxState } from "@/components/studio/hooks/use-lightbox-state";
import { useStudioCatalog } from "@/components/studio/hooks/use-studio-catalog";
import { JobMonitor } from "@/components/studio/job-monitor";
import { StudioLightbox } from "@/components/studio/lightbox";
import { RawImage } from "@/components/studio/raw-image";
import { isProviderId } from "@/lib/models";
import type { ImageMode, ProviderId } from "@/lib/models";
import {
  isActiveImageJobStatus,
  isForceKillableImageJobStatus,
  isPausableImageJobStatus,
  isResumableImageJobStatus,
  isRetryableBatchItemStatus
} from "@/lib/image-job-state";
import { isFinishedImageJobStatus } from "@/lib/job-monitor";

type HistoryFilter = {
  provider: "all" | ProviderId;
  model: "all" | string;
};

type Locale = "en" | "zh";
type StudioView = "gallery" | "studio";
type StudioLayout = "controls-left" | "controls-right";
type GenerationInputMode = "single" | "batch";

type PromptTemplateMode = PromptTemplateResponse["mode"];

const DEFAULT_SITE_TITLE = "Image-2 Studio";
const DEFAULT_MODE: ImageMode = "text-to-image";
const STUDIO_LAYOUT_STORAGE_KEY = "image2.studioLayout";
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_TIMEOUT_MS = 20 * 60 * 1000;
const BATCH_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
const HISTORY_PAGE_SIZE = 30;
const MAX_PROMPT_LENGTH = 2000;
const MAX_BATCH_PROMPTS = 20;
const BATCH_PROMPT_START = "---PROMPT---";
const BATCH_PROMPT_END = "---END---";
const LIGHTBOX_BUTTON_ZOOM_STEP = 1.25;

const RESOLUTION_OPTIONS = [
  { value: "1024", labels: { en: "1K (1024px)", zh: "1K (1024px)" } },
  { value: "2048", labels: { en: "2K (2048px)", zh: "2K (2048px)" } },
  { value: "4096", labels: { en: "4K (4096px, high load)", zh: "4K (4096px，高负载)" } }
];

const DEFAULT_RESOLUTION = "2048";
const HIGH_LOAD_RESOLUTION = "4096";
const OFFICIAL_OPENAI_RESOLUTION = "1024";

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    settings: "Settings",
    apiProvider: "API provider",
    provider: "Provider",
    apiKeys: "API keys",
    openaiKey: "OpenAI API key",
    saveKeys: "Save settings",
    saving: "Saving",
    openaiCompatible: "OpenAI-compatible",
    baseUrl: "Base URL",
    modelId: "Model ID",
    baseUrlNote: "Leave Base URL empty to use OpenAI directly. Fill it for OpenAI-compatible third-party gateways.",
    historyFilter: "History filter",
    allProviders: "All providers",
    allModels: "All models",
    create: "Create",
    promptStudio: "Prompt studio",
    textToImage: "Text to image",
    imageToImage: "Image to image",
    model: "Model",
    aspectRatio: "Aspect Ratio",
    resolution: "Resolution",
    quality: "Quality",
    fidelity: "Fidelity",
    prompt: "Prompt",
    singleMode: "Single",
    batchMode: "Batch",
    batchPrompts: "prompts",
    batchTemplate: "Template",
    promptPlaceholderText: "Describe the image you want to create...",
    promptPlaceholderImage: "Describe the change to make from the reference image...",
    batchPromptPlaceholderText: "---PROMPT---\nSubject: glass greenhouse\nScene: morning mist, soft sunlight, wet stone path\nStyle: cinematic product poster, rich detail\n---END---\n\n---PROMPT---\nSubject: silver roadster\nScene: dusk by the sea, low camera angle\nStyle: editorial automotive photo\n---END---",
    batchPromptPlaceholderImage: "---PROMPT---\nChange the background to winter sunlight.\nKeep the product shape unchanged.\nAdd a soft studio reflection.\n---END---\n\n---PROMPT---\nMake the image feel like an editorial magazine cover.\nPreserve the original subject and clean edges.\n---END---",
    clear: "Clear",
    quickStarts: "Quick starts",
    random: "Random",
    addReference: "Add reference",
    dragImages: "Drag images here for image-to-image",
    ready: "Ready",
    missingKey: "Missing API key",
    requestSent: "Request sent",
    generatingSmall: "image is being generated",
    backgroundRunning: "Task is running",
    stayInStudio: "Stay here",
    runInBackground: "Back to gallery",
    backgroundRunComplete: "Task completed. Gallery updated.",
    backgroundRunFailed: "Task failed. Check task monitor.",
    backgroundRunQueued: "Task is running in the background.",
    referencesEnabled: "references enabled when supported",
    generatingWith: "Generating with",
    generating: "Generating",
    generateImage: "Generate image",
    generateBatch: "Generate batch",
    generatingBatch: "Generating batch",
    result: "Result",
    imageOutput: "Image output",
    batchOutput: "Batch output",
    batchProgress: "Batch progress",
    batchElapsed: "Elapsed",
    batchEmpty: "Batch results will appear here.",
    batchQueued: "Queued",
    batchCreating: "Creating",
    batchPending: "Pending",
    batchPaused: "Paused",
    batchRunning: "Running",
    batchSucceeded: "Succeeded",
    batchFailed: "Failed",
    batchComplete: "Complete",
    batchRetry: "Retry",
    batchPause: "Pause",
    batchResume: "Resume",
    jobKill: "Kill",
    jobKillConfirm: "Force kill this task?",
    jobKillFailed: "Could not force kill task.",
    batchRetryAllFailed: "Retry failed",
    batchTimedOut: "Batch exceeded 10 minutes. Unfinished tasks were cleared as timed out.",
    batchTooManyPrompts: "Use 20 prompts or fewer.",
    batchPromptTooLong: "Each prompt must be 2000 characters or fewer.",
    batchFormatIncomplete: "Finish each prompt block with ---END---.",
    batchFormatOutsideText: "Remove text outside prompt blocks.",
    batchFormatEmptyBlock: "Prompt blocks cannot be empty.",
    providerReady: "Provider ready",
    generatingImage: "Generating image",
    keepOpen: "You can keep waiting here or return to the gallery.",
    noImageYet: "No image yet",
    emptyResult: "Choose a provider, enter a prompt, and generate your first image.",
    editThisImage: "Edit this image",
    copyLink: "Copy link",
    copied: "Copied",
    download: "Download",
    open: "Open",
    preview: "Preview",
    generationDetails: "Generation details",
    promptUsed: "Prompt",
    copyPrompt: "Copy prompt",
    history: "History",
    images: "images",
    historyEmpty: "Generated images will appear here.",
    loadMore: "Load more",
    loadingMore: "Loading",
    text: "Text",
    imageInput: "Image input",
    closePreview: "Close preview",
    imagePreview: "Image preview",
    language: "中文",
    languageTitle: "Switch to Chinese",
    configuredReplace: "Configured; enter a new key to replace",
    keySaved: "Saved. Provider settings were updated.",
    settingsLoadFailed: "Provider settings failed to load.",
    catalogLoadFailed: "Model catalog failed to load.",
    historyLoadFailed: "History failed to load.",
    chooseModelFirst: "Choose a model first.",
    providerNoKey: "This provider has no API key configured.",
    enterPrompt: "Enter a prompt.",
    imageNeedsReference: "Image-to-image needs an upload or a history image.",
    generationFailed: "Generation failed.",
    clearHistoryFailed: "History could not be cleared.",
    clearHistory: "Clear history",
    clearHistoryConfirm: "Clear all history images? This cannot be undone.",
    moreActions: "More actions",
    account: "Account",
    admin: "Admin",
    logout: "Log out",
    textReady: "Text ready",
    textOff: "Text off",
    imageReady: "Image ready",
    imageOff: "Image off",
    continueReady: "Continue ready",
    continueOff: "Continue off",
    editingFrom: "Editing from"
  },
  zh: {
    settings: "设置",
    apiProvider: "API 供应商",
    provider: "供应商",
    apiKeys: "API 密钥",
    openaiKey: "OpenAI API 密钥",
    saveKeys: "保存全部设置",
    saving: "保存中",
    openaiCompatible: "OpenAI 兼容接口",
    baseUrl: "Base URL",
    modelId: "模型 ID",
    baseUrlNote: "留空表示直连 OpenAI；填写后可使用 OpenAI 兼容的第三方网关。",
    historyFilter: "历史筛选",
    allProviders: "全部供应商",
    allModels: "全部模型",
    create: "创作",
    promptStudio: "提示词工作台",
    textToImage: "文生图",
    imageToImage: "图生图",
    model: "模型",
    aspectRatio: "宽高比",
    resolution: "分辨率",
    quality: "质量",
    fidelity: "保真度",
    prompt: "提示词",
    singleMode: "单张",
    batchMode: "批量",
    batchPrompts: "条提示词",
    batchTemplate: "模板",
    promptPlaceholderText: "描述你想生成的图片...",
    promptPlaceholderImage: "描述你想基于参考图做出的修改...",
    batchPromptPlaceholderText: "---PROMPT---\n主体：晨雾中的玻璃温室\n场景：柔和晨光、湿润石板路、空气有薄雾\n风格：电影感产品海报，细节丰富\n---END---\n\n---PROMPT---\n主体：海边黄昏的银色跑车\n场景：低机位、远处海平线、车身反射夕阳\n风格：高端汽车杂志大片\n---END---",
    batchPromptPlaceholderImage: "---PROMPT---\n把背景改成冬日阳光。\n保持主体形状不变。\n添加柔和的棚拍倒影。\n---END---\n\n---PROMPT---\n让画面更像杂志封面。\n保留原主体和干净边缘。\n---END---",
    clear: "清空",
    quickStarts: "快速示例",
    random: "随机",
    addReference: "添加参考图",
    dragImages: "拖拽图片到这里用于图生图",
    ready: "就绪",
    missingKey: "缺少 API 密钥",
    requestSent: "请求已发送",
    generatingSmall: "正在生成图片",
    referencesEnabled: "模型支持时可使用参考图",
    generatingWith: "正在使用",
    generating: "生成中",
    generateImage: "生成图片",
    generateBatch: "批量生成",
    generatingBatch: "批量生成中",
    result: "结果",
    imageOutput: "图片输出",
    batchOutput: "批量输出",
    batchProgress: "批量进度",
    batchElapsed: "耗时",
    batchEmpty: "批量结果会显示在这里。",
    batchQueued: "排队中",
    batchCreating: "创建中",
    batchPending: "等待中",
    batchRunning: "运行中",
    batchSucceeded: "已完成",
    batchFailed: "失败",
    batchComplete: "已结束",
    batchRetry: "重试",
    batchPause: "暂停",
    batchResume: "继续",
    jobKill: "强杀",
    jobKillConfirm: "确定强行杀除这个任务吗？",
    jobKillFailed: "强行杀除任务失败。",
    batchRetryAllFailed: "重试失败项",
    batchTimedOut: "批次超过 10 分钟，未完成任务已按超时失败清理。",
    batchTooManyPrompts: "最多输入 20 条提示词。",
    batchPromptTooLong: "每条提示词不能超过 2000 字符。",
    batchFormatIncomplete: "每个提示词块都需要用 ---END--- 结束。",
    batchFormatOutsideText: "请删除提示词块外的多余文本。",
    batchFormatEmptyBlock: "提示词块不能为空。",
    providerReady: "供应商已就绪",
    generatingImage: "正在生成图片",
    keepOpen: "可以在这里等待，也可以返回图库。",
    noImageYet: "还没有图片",
    emptyResult: "选择供应商，输入提示词，然后生成第一张图片。",
    editThisImage: "编辑此图",
    copyLink: "复制链接",
    copied: "已复制",
    download: "下载",
    open: "打开",
    preview: "预览",
    generationDetails: "生成详情",
    promptUsed: "提示词",
    copyPrompt: "复制提示词",
    history: "历史",
    images: "张图片",
    historyEmpty: "生成后的图片会显示在这里。",
    loadMore: "加载更多",
    loadingMore: "加载中",
    text: "文本",
    imageInput: "图片输入",
    closePreview: "关闭预览",
    imagePreview: "图片预览",
    language: "EN",
    languageTitle: "切换到英文",
    configuredReplace: "已配置；输入新密钥可替换",
    keySaved: "已保存，供应商设置已更新。",
    settingsLoadFailed: "供应商设置加载失败。",
    catalogLoadFailed: "模型目录加载失败。",
    historyLoadFailed: "历史记录加载失败。",
    chooseModelFirst: "请先选择模型。",
    providerNoKey: "当前供应商尚未配置 API 密钥。",
    enterPrompt: "请输入提示词。",
    imageNeedsReference: "图生图需要上传参考图或选择历史图片。",
    generationFailed: "生成失败。",
    clearHistoryFailed: "历史记录清空失败。",
    clearHistory: "清空历史",
    clearHistoryConfirm: "确定清空所有历史图片吗？此操作不可撤销。",
    moreActions: "更多操作",
    account: "账号",
    admin: "管理",
    logout: "退出登录",
    backgroundRunning: "任务正在运行",
    stayInStudio: "留在生图台",
    runInBackground: "返回图库后台运行",
    backgroundRunComplete: "任务已完成，图库已更新。",
    backgroundRunFailed: "任务失败，请查看任务监控。",
    backgroundRunQueued: "任务已在后台运行。",
    textReady: "支持文生图",
    textOff: "不支持文生图",
    imageReady: "支持图生图",
    imageOff: "不支持图生图",
    continueReady: "支持继续编辑",
    continueOff: "不支持继续编辑",
    editingFrom: "正在编辑来源"
  }
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
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

function formatMilliseconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${value}ms`;

  return formatDuration(Math.round(value / 1000));
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";

  return `${Math.round(value)}%`;
}

function getProviderLabel(catalog: CatalogResponse | null, provider: ImageRecord["provider"]) {
  return catalog?.providers.find((item) => item.provider === provider)?.label ?? provider;
}

function getModelLabel(catalog: CatalogResponse | null, provider: ImageRecord["provider"], modelId: string) {
  return catalog?.models.find((item) => item.provider === provider && item.modelId === modelId)?.label ?? modelId;
}

function modelSupports(model: { capabilities: string[] } | undefined, capability: string) {
  return Boolean(model?.capabilities.includes(capability));
}

function getAspectRatioLabel(value: string) {
  if (value === "auto") return "Auto";
  return value;
}

function getResolutionLabel(value: string, locale: Locale) {
  return RESOLUTION_OPTIONS.find((item) => item.value === value)?.labels[locale] ?? `${value}px`;
}

function isHighLoadResolution(value: string) {
  return value === HIGH_LOAD_RESOLUTION;
}

function getSizeFromAspectRatioAndResolution(aspectRatio: string, resolution: string) {
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

function getOfficialOpenAIImageSize(aspectRatio: string) {
  if (aspectRatio === "auto" || aspectRatio === "1:1") return "1024x1024";

  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  if (!rawWidth || !rawHeight) return "1024x1024";

  if (rawWidth > rawHeight) return "1536x1024";
  if (rawHeight > rawWidth) return "1024x1536";
  return "1024x1024";
}

function getComputedImageSize(aspectRatio: string, resolution: string, allowCustomSize: boolean) {
  if (!allowCustomSize && resolution === OFFICIAL_OPENAI_RESOLUTION) {
    return getOfficialOpenAIImageSize(aspectRatio);
  }

  return getSizeFromAspectRatioAndResolution(aspectRatio, resolution);
}

function getGenerationDetailLabel(input: { aspectRatio?: string | null; size?: string | null; quality?: string | null }) {
  const aspect = input.aspectRatio ? getAspectRatioLabel(input.aspectRatio) : "-";
  const size = input.size || "-";
  const quality = input.quality || "-";

  return `${aspect} / ${size} / ${quality}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseBatchPrompts(value: string): { prompts: string[]; errorKey?: string } {
  const normalized = value.replace(/\r\n/g, "\n");
  const hasStart = normalized.includes(BATCH_PROMPT_START);
  const hasEnd = normalized.includes(BATCH_PROMPT_END);

  if (!hasStart && !hasEnd) {
    return {
      prompts: normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    };
  }

  if (!hasStart || !hasEnd) {
    return { prompts: [], errorKey: "batchFormatIncomplete" };
  }

  const prompts: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const startIndex = normalized.indexOf(BATCH_PROMPT_START, cursor);

    if (startIndex === -1) {
      return normalized.slice(cursor).trim()
        ? { prompts: [], errorKey: "batchFormatOutsideText" }
        : { prompts };
    }

    if (normalized.slice(cursor, startIndex).trim()) {
      return { prompts: [], errorKey: "batchFormatOutsideText" };
    }

    const promptStart = startIndex + BATCH_PROMPT_START.length;
    const endIndex = normalized.indexOf(BATCH_PROMPT_END, promptStart);

    if (endIndex === -1) {
      return { prompts: [], errorKey: "batchFormatIncomplete" };
    }

    const prompt = normalized.slice(promptStart, endIndex).trim();
    if (!prompt) {
      return { prompts: [], errorKey: "batchFormatEmptyBlock" };
    }

    prompts.push(prompt);
    cursor = endIndex + BATCH_PROMPT_END.length;
  }

  return { prompts };
}

function getBatchPromptTemplate(mode: ImageMode, locale: Locale) {
  if (mode === "image-to-image") {
    return locale === "zh"
      ? `${BATCH_PROMPT_START}\n把背景改成冬日阳光。\n保持主体形状不变。\n添加柔和的棚拍倒影。\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\n让画面更像杂志封面。\n保留原主体和干净边缘。\n${BATCH_PROMPT_END}`
      : `${BATCH_PROMPT_START}\nChange the background to winter sunlight.\nKeep the product shape unchanged.\nAdd a soft studio reflection.\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\nMake the image feel like an editorial magazine cover.\nPreserve the original subject and clean edges.\n${BATCH_PROMPT_END}`;
  }

  return locale === "zh"
    ? `${BATCH_PROMPT_START}\n主体：晨雾中的玻璃温室\n场景：柔和晨光、湿润石板路、空气有薄雾\n风格：电影感产品海报，细节丰富\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\n主体：海边黄昏的银色跑车\n场景：低机位、远处海平线、车身反射夕阳\n风格：高端汽车杂志大片\n${BATCH_PROMPT_END}`
    : `${BATCH_PROMPT_START}\nSubject: glass greenhouse\nScene: morning mist, soft sunlight, wet stone path\nStyle: cinematic product poster, rich detail\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\nSubject: silver roadster\nScene: dusk by the sea, low camera angle\nStyle: editorial automotive photo\n${BATCH_PROMPT_END}`;
}

function getPromptFormat(value: string) {
  return value.includes(BATCH_PROMPT_START) || value.includes(BATCH_PROMPT_END) ? "blocks" : "lines";
}

export default function Home() {
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [activeView, setActiveView] = useState<StudioView>("gallery");
  const [studioLayout, setStudioLayout] = useState<StudioLayout>("controls-left");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("gpt-image-2");
  const [mode, setMode] = useState<ImageMode>(DEFAULT_MODE);
  const [prompt, setPrompt] = useState("");
  const [generationInputMode, setGenerationInputMode] = useState<GenerationInputMode>("single");
  const [batchPromptText, setBatchPromptText] = useState("");
  const [jobMonitorOpen, setJobMonitorOpen] = useState(false);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [quality, setQuality] = useState("medium");
  const [inputFidelity, setInputFidelity] = useState("high");
  const [files, setFiles] = useState<File[]>([]);
  const [sourceImageIds, setSourceImageIds] = useState<string[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({ provider: "all", model: "all" });
  const [historyBatchFilter, setHistoryBatchFilter] = useState("all");
  const [historyProjectFilter, setHistoryProjectFilter] = useState("all");
  const [historyTagFilter, setHistoryTagFilter] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favoriteRecordIds, setFavoriteRecordIds] = useState<string[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [deletingHistoryIds, setDeletingHistoryIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [filePreviewUrls, setFilePreviewUrls] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(false);
  const [quickMenu, setQuickMenu] = useState<"model" | "aspect" | "resolution" | "quality" | "fidelity" | null>(null);
  const [loading, setLoading] = useState(false);
  const [referenceDragging, setReferenceDragging] = useState(false);
  const [locale, setLocale] = useState<Locale>("zh");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copiedPromptId, setCopiedPromptId] = useState("");
  const t = (key: string) => COPY[locale][key] ?? COPY.en[key] ?? key;
  const {
    branding,
    brandLogoUrl,
    setLogoLoadFailed,
    catalog,
    openaiKey,
    setOpenaiKey,
    openaiBaseUrl,
    setOpenaiBaseUrl,
    openaiModel,
    setOpenaiModel,
    userOpenaiKeyConfigured,
    providerSettingsLoaded,
    savingSettings,
    settingsMessage,
    setSettingsMessage,
    resetCatalogState,
    resetProviderSettingsState,
    loadBranding,
    loadCatalog,
    loadProviderSettings,
    saveProviderSettings
  } = useStudioCatalog({
    provider,
    defaultSiteTitle: DEFAULT_SITE_TITLE,
    defaultResolution: DEFAULT_RESOLUTION,
    officialOpenAIResolution: OFFICIAL_OPENAI_RESOLUTION,
    messages: {
      catalogLoadFailed: t("catalogLoadFailed"),
      settingsLoadFailed: t("settingsLoadFailed"),
      settingsSaveFailed: locale === "zh" ? "\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25\u3002" : "Settings could not be saved.",
      keySaved: t("keySaved")
    },
    onUnauthorized: handleUnauthorized,
    onActiveProviderChange: setProvider,
    onCatalogDefaultSelection: (selection) => {
      setProvider(selection.provider);
      if (selection.modelId) {
        setModel(selection.modelId);
        setAspectRatio(selection.defaultAspectRatio);
        setResolution(selection.defaultResolution);
        setQuality(selection.defaultQuality);
        setInputFidelity(selection.defaultInputFidelity);
      }
    }
  });
  const {
    authLoading,
    authMode,
    currentUser,
    registrationOpen,
    authEmail,
    authPassword,
    authError,
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setCurrentUser,
    submitAuth,
    logout,
    resetAuthSession
  } = useAuthSession({
    onAuthenticated: resetProviderSettingsState,
    onLoggedOut: () => resetAuthenticatedState()
  });
  const {
    records,
    setRecords,
    historyNextCursor,
    setHistoryNextCursor,
    historyLoading,
    batches,
    projects,
    templates,
    resetGalleryData,
    loadHistory,
    loadHistoryPage,
    loadBatches,
    loadProjects,
    loadTemplates,
    loadGalleryMeta
  } = useGalleryData({
    pageSize: HISTORY_PAGE_SIZE,
    messages: {
      historyLoadFailed: t("historyLoadFailed"),
      batchesLoadFailed: locale === "zh" ? "\u6279\u6b21\u52a0\u8f7d\u5931\u8d25\u3002" : "Batches could not be loaded.",
      projectsLoadFailed: locale === "zh" ? "\u9879\u76ee\u52a0\u8f7d\u5931\u8d25\u3002" : "Projects could not be loaded.",
      templatesLoadFailed: locale === "zh" ? "\u6a21\u677f\u52a0\u8f7d\u5931\u8d25\u3002" : "Templates could not be loaded.",
      generationFailed: t("generationFailed")
    },
    onUnauthorized: handleUnauthorized,
    onError: setError,
    onSelectFirstRecord: (recordId) => setSelectedRecordId((current) => current || recordId)
  });
  const {
    batchItems,
    setBatchItems,
    batchRunning,
    setBatchRunning,
    batchElapsedSeconds,
    activeBatchId,
    setActiveBatchId,
    jobs,
    jobsLoading,
    jobMonitorClearing,
    jobMonitorFinishedClearing,
    trackingJobId,
    setTrackingJobId,
    jobActionId,
    resetImageJobsState,
    updateBatchTiming,
    resetBatchTiming,
    updateBatchItem,
    mergeJobState,
    mergeBatchJobStates,
    loadJobs,
    clearJobMonitorAlerts,
    clearFinishedJobMonitorItems,
    changeImageJobState: changeImageJobStateOnServer
  } = useImageJobs({
    messages: {
      jobsLoadFailed: locale === "zh" ? "\u4efb\u52a1\u5217\u8868\u52a0\u8f7d\u5931\u8d25\u3002" : "Jobs could not be loaded.",
      clearAlertsFailed: locale === "zh" ? "\u6e05\u7a7a\u63d0\u793a\u5931\u8d25\u3002" : "Could not clear job alerts.",
      clearFinishedFailed: locale === "zh" ? "\u6e05\u7a7a\u5b8c\u6210/\u5931\u8d25\u4efb\u52a1\u5931\u8d25\u3002" : "Could not clear finished jobs.",
      jobKillConfirm: t("jobKillConfirm"),
      jobKillFailed: t("jobKillFailed"),
      generationFailed: t("generationFailed")
    },
    onUnauthorized: handleUnauthorized,
    onError: setError,
    onCurrentUserChange: setCurrentUser
  });
  const {
    pendingGeneration,
    setPendingGeneration,
    runNotice,
    elapsedSeconds,
    activeStudioRunIsRunning,
    runningBackgroundRuns,
    createStudioRunId,
    setActiveStudioRun,
    getActiveStudioRunId,
    isActiveStudioRun,
    upsertStudioRun,
    updateStudioRun,
    showRunNotice,
    resetGenerationRunsState
  } = useGenerationRuns();
  const {
    adminOverview,
    setAdminOverview,
    adminMessage,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    deletingUserId,
    platformOpenaiKey,
    setPlatformOpenaiKey,
    platformOpenaiBaseUrl,
    setPlatformOpenaiBaseUrl,
    platformOpenaiModel,
    setPlatformOpenaiModel,
    resetAdminPanelState,
    saveAdminSettings,
    createAdminUser,
    toggleUserDisabled,
    deleteAdminUser,
    savePlatformProvider
  } = useAdminPanel({
    open: adminOpen,
    currentUser,
    locale,
    onUnauthorized: handleUnauthorized,
    onBrandingReload: loadBranding,
    onCatalogReload: loadCatalog
  });
  const [newProjectName, setNewProjectName] = useState("");
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignTagsText, setAssignTagsText] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateMode, setTemplateMode] = useState<PromptTemplateMode>("universal");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    recordId: lightboxRecordId,
    record: lightboxRecord,
    mode: lightboxMode,
    scale: lightboxScale,
    offset: lightboxOffset,
    dragging: lightboxDragging,
    stageRef: lightboxInspectorStageRef,
    zoomLabel: lightboxZoomLabel,
    inspectorMeta: lightboxInspectorMeta,
    open: openLightbox,
    close: closeLightbox,
    resetTransform: resetLightboxTransform,
    enterInspector: enterLightboxInspector,
    leaveInspector: leaveLightboxInspector,
    handleImageLoad: handleLightboxImageLoad,
    updateScale: updateLightboxScale,
    handlePointerDown: handleLightboxPointerDown,
    handlePointerMove: handleLightboxPointerMove,
    handlePointerEnd: handleLightboxPointerEnd
  } = useLightboxState(records);

  const providerStatus = useMemo(
    () => catalog?.providers.find((item) => item.provider === provider),
    [catalog, provider]
  );

  const providerModels = useMemo(
    () => catalog?.models.filter((item) => item.provider === provider) ?? [],
    [catalog, provider]
  );

  const selectedModel = useMemo(
    () => providerModels.find((item) => item.modelId === model),
    [model, providerModels]
  );

  const filteredRecords = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const favorites = new Set(favoriteRecordIds);

    return records.filter((record) => {
      if (favoriteOnly && !favorites.has(record.id)) return false;
      if (historyFilter.provider !== "all" && record.provider !== historyFilter.provider) return false;
      if (historyFilter.model !== "all" && record.model !== historyFilter.model) return false;
      if (historyBatchFilter !== "all" && record.batchId !== historyBatchFilter) return false;
      if (historyProjectFilter !== "all" && record.projectId !== historyProjectFilter) return false;
      if (historyTagFilter.trim()) {
        const expectedTag = historyTagFilter.trim().toLowerCase();
        if (!record.tags.some((tag) => tag.toLowerCase().includes(expectedTag))) return false;
      }
      if (!query) return true;

      const searchable = [
        record.prompt,
        record.model,
        record.provider,
        record.size,
        record.aspectRatio,
        record.quality,
        record.tags.join(" "),
        projects.find((project) => project.id === record.projectId)?.name,
        batches.find((batch) => batch.id === record.batchId)?.name,
        getProviderLabel(catalog, record.provider),
        getModelLabel(catalog, record.provider, record.model)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [batches, catalog, favoriteOnly, favoriteRecordIds, historyBatchFilter, historyFilter, historyProjectFilter, historySearch, historyTagFilter, projects, records]);

  const favoriteRecordIdSet = useMemo(() => new Set(favoriteRecordIds), [favoriteRecordIds]);
  const selectedHistoryIdSet = useMemo(() => new Set(selectedHistoryIds), [selectedHistoryIds]);
  const deletingHistoryIdSet = useMemo(() => new Set(deletingHistoryIds), [deletingHistoryIds]);
  const selectedHistoryRecords = useMemo(
    () => filteredRecords.filter((record) => selectedHistoryIdSet.has(record.id)),
    [filteredRecords, selectedHistoryIdSet]
  );

  const historyFiltersActive = Boolean(
    favoriteOnly
    || historySearch.trim()
    || historyFilter.provider !== "all"
    || historyFilter.model !== "all"
    || historyBatchFilter !== "all"
    || historyProjectFilter !== "all"
    || historyTagFilter.trim()
  );

  const selectedRecord = useMemo(
    () => selectedRecordId ? filteredRecords.find((record) => record.id === selectedRecordId) : undefined,
    [filteredRecords, selectedRecordId]
  );

  const selectedRecordModel = useMemo(
    () => selectedRecord
      ? catalog?.models.find((item) => item.provider === selectedRecord.provider && item.modelId === selectedRecord.model)
      : undefined,
    [catalog, selectedRecord]
  );

  const selectedRecordCanContinue = Boolean(
    selectedRecord
    && catalog?.providers.find((item) => item.provider === selectedRecord.provider)?.configured
    && modelSupports(selectedRecordModel, "continue-edit")
  );

  const activeSourceRecords = useMemo(
    () => sourceImageIds
      .map((id) => records.find((record) => record.id === id))
      .filter((record): record is ImageRecord => Boolean(record)),
    [records, sourceImageIds]
  );

  const canUseImageMode = modelSupports(selectedModel, "image-to-image");
  const canContinueEdit = modelSupports(selectedModel, "continue-edit");
  const isConfigured = Boolean(providerStatus?.configured);
  const supportsCustomSize = Boolean(providerStatus?.supportsCustomSize);
  const resolutionOptions = supportsCustomSize ? RESOLUTION_OPTIONS : RESOLUTION_OPTIONS.slice(0, 1);
  const computedSize = useMemo(
    () => getComputedImageSize(aspectRatio, resolution, supportsCustomSize),
    [aspectRatio, resolution, supportsCustomSize]
  );

  const parsedBatchPrompts = useMemo(() => parseBatchPrompts(batchPromptText), [batchPromptText]);
  const batchPrompts = parsedBatchPrompts.prompts;
  const batchParseErrorKey = parsedBatchPrompts.errorKey;
  const batchSucceededCount = batchItems.filter((item) => item.status === "succeeded").length;
  const batchFailedCount = batchItems.filter((item) => item.status === "failed").length;
  const batchPausedCount = batchItems.filter((item) => item.status === "paused").length;
  const batchFinishedCount = batchSucceededCount + batchFailedCount;
  const batchUnfinishedCount = Math.max(0, batchItems.length - batchFinishedCount);
  const batchPausedOnly = batchUnfinishedCount > 0 && batchPausedCount === batchUnfinishedCount;
  const batchProgressPercent = batchItems.length > 0 ? Math.round((batchFinishedCount / batchItems.length) * 100) : 0;
  const batchElapsedLabel = formatDuration(batchElapsedSeconds);
  const batchHasTooManyPrompts = batchPrompts.length > MAX_BATCH_PROMPTS;
  const batchHasTooLongPrompt = batchPrompts.some((item) => item.length > MAX_PROMPT_LENGTH);
  const batchPromptCounterLabel = generationInputMode === "batch"
    ? (batchParseErrorKey ? t(batchParseErrorKey) : `${batchPrompts.length}/${MAX_BATCH_PROMPTS} ${t("batchPrompts")}`)
    : `${prompt.length}/${MAX_PROMPT_LENGTH}`;
  const allTags = useMemo(
    () => Array.from(new Set(records.flatMap((record) => record.tags))).sort((left, right) => left.localeCompare(right)),
    [records]
  );
  const visibleTemplates = useMemo(
    () => templates.filter((template) => template.mode === "universal" || template.mode === mode),
    [mode, templates]
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => isActiveImageJobStatus(job.status)),
    [jobs]
  );
  const failedJobs = useMemo(
    () => jobs.filter((job) => job.status === "failed"),
    [jobs]
  );
  const jobMonitorClearedAt = useMemo(() => {
    if (!currentUser?.jobMonitorClearedAt) return null;

    const clearedAt = new Date(currentUser.jobMonitorClearedAt);
    return Number.isNaN(clearedAt.getTime()) ? null : clearedAt;
  }, [currentUser?.jobMonitorClearedAt]);
  const visibleFailedJobs = useMemo(() => {
    if (!jobMonitorClearedAt) return failedJobs;

    const clearedAtMs = jobMonitorClearedAt.getTime();
    return failedJobs.filter((job) => {
      const failedAt = job.finishedAt ? new Date(job.finishedAt) : new Date(job.createdAt);
      return !Number.isNaN(failedAt.getTime()) && failedAt.getTime() > clearedAtMs;
    });
  }, [failedJobs, jobMonitorClearedAt]);
  const jobMonitorAlertCount = activeJobs.length + visibleFailedJobs.length;
  const succeededJobs = useMemo(
    () => jobs.filter((job) => job.status === "succeeded"),
    [jobs]
  );
  const finishedJobs = useMemo(
    () => jobs.filter((job) => isFinishedImageJobStatus(job.status)),
    [jobs]
  );
  const aspectRatioOptions = selectedModel?.supportedAspectRatios ?? ["auto", "1:1", "3:4", "4:3", "9:16", "16:9"];
  const renderBrandMark = () => (
    <div className={`brand-mark ${brandLogoUrl ? "has-logo" : ""}`}>
      {brandLogoUrl ? (
        <RawImage className="brand-logo" src={brandLogoUrl} alt="" aria-hidden="true" onError={() => setLogoLoadFailed(true)} />
      ) : (
        <Wand2 size={21} />
      )}
    </div>
  );

  function resetAuthenticatedState(message?: string) {
    resetAuthSession(message);
    resetGalleryData();
    resetCatalogState();
    setSelectedRecordId("");
    setSourceImageIds([]);
    setFiles([]);
    setSettingsOpen(false);
    setAdminOpen(false);
    resetAdminPanelState();
    resetGenerationRunsState();
    resetImageJobsState();
    setBatchPromptText("");
    setJobMonitorOpen(false);
    setDeletingTemplateId("");
    setGenerationInputMode("single");
    setLoading(false);
    setError("");
    setActiveView("gallery");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUnauthorized(response: Response) {
    if (response.status !== 401) return false;

    resetAuthenticatedState(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
    return true;
  }

  async function loadWorkspaceMeta() {
    await Promise.all([
      loadJobs(),
      loadGalleryMeta()
    ]);
  }

  function isBatchDetailActive(batch: ImageBatchDetailResponse) {
    return batch.items.some((item) => item.status === "queued" || item.status === "creating" || isActiveImageJobStatus(item.status));
  }

  async function loadBatchDetail(batchId: string, options: { showInStudio?: boolean; pollActive?: boolean } = {}) {
    const response = await fetch(`/api/images/batches/${batchId}`, { cache: "no-store" });
    if (handleUnauthorized(response)) return null;
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || (locale === "zh" ? "批次详情加载失败。" : "Batch detail could not be loaded."));
    }

    const batch = (await response.json()) as ImageBatchDetailResponse;
    const active = isBatchDetailActive(batch);
    setActiveBatchId(batch.id);
    setBatchItems(batch.items.map(batchItemToGenerationItem));
    setGenerationInputMode("batch");
    setBatchRunning(active);
    updateBatchTiming(batch, active);

    if (options.showInStudio) {
      setActiveView("studio");
      setSelectedRecordId("");
      closeLightbox();
    }

    if (options.pollActive) {
      await pollBatchUntilFinished(batch.id);
    }

    return batch;
  }

  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(STUDIO_LAYOUT_STORAGE_KEY);
      if (savedLayout === "controls-left" || savedLayout === "controls-right") {
        setStudioLayout(savedLayout);
      }
    } catch {
      // Layout preference is cosmetic; ignore storage failures.
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    void loadCatalog().catch(() => setError(t("catalogLoadFailed")));
    void loadHistory().catch(() => setError(t("historyLoadFailed")));
    void loadWorkspaceMeta().catch((caught) => setError(caught instanceof Error ? caught.message : t("historyLoadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reload workspace bootstrap only when the authenticated user or locale changes.
  }, [currentUser?.id, locale]);

  useEffect(() => {
    if (!settingsOpen || providerSettingsLoaded) return;

    void loadProviderSettings().catch(() => setSettingsMessage(t("settingsLoadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Load provider settings once per settings drawer open until the loaded flag resets.
  }, [settingsOpen, providerSettingsLoaded]);

  useEffect(() => {
    if (!currentUser || !catalog || !selectedModel) return;
    if (supportsCustomSize || resolution === OFFICIAL_OPENAI_RESOLUTION) return;

    setResolution(OFFICIAL_OPENAI_RESOLUTION);
    setQuickMenu((current) => current === "resolution" ? null : current);
    setError(locale === "zh"
      ? "官方 OpenAI 仅开放 1K；配置 OpenAI-compatible Base URL 后可使用 2K/4K。"
      : "Official OpenAI only allows 1K here. Configure an OpenAI-compatible Base URL to use 2K/4K.");
  }, [catalog, currentUser, locale, resolution, selectedModel, supportsCustomSize]);

  useEffect(() => {
    if (providerModels.length === 0) return;

    const nextModel = providerModels.find((item) => item.modelId === model) ?? providerModels[0];
    if (!nextModel) return;

    if (nextModel.modelId !== model) {
      setModel(nextModel.modelId);
    }

    const nextAspectRatio = nextModel.defaultAspectRatio ?? "3:4";
    const nextResolution = supportsCustomSize ? DEFAULT_RESOLUTION : OFFICIAL_OPENAI_RESOLUTION;
    setAspectRatio(nextAspectRatio);
    setResolution(nextResolution);
    setQuality(nextModel.defaultQuality ?? "medium");
    setInputFidelity(nextModel.inputFidelityOptions?.[0] ?? "high");

    if (!modelSupports(nextModel, "image-to-image")) {
      setMode("text-to-image");
      setSourceImageIds([]);
    }
  }, [model, providerModels, supportsCustomSize]);

  useEffect(() => {
    if (!quickMenu) return;

    const closeQuickMenu = () => setQuickMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".quick-control")) return;
      closeQuickMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeQuickMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeQuickMenu);
    window.addEventListener("scroll", closeQuickMenu, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeQuickMenu);
      window.removeEventListener("scroll", closeQuickMenu);
    };
  }, [quickMenu]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("image2.favoriteRecords");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setFavoriteRecordIds(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      setFavoriteRecordIds([]);
    } finally {
      setFavoritesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    window.localStorage.setItem("image2.favoriteRecords", JSON.stringify(favoriteRecordIds));
  }, [favoriteRecordIds, favoritesLoaded]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setFilePreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    const visibleIds = new Set(filteredRecords.map((record) => record.id));
    setSelectedHistoryIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredRecords]);

  function updateProvider(nextProvider: ProviderId) {
    setProvider(nextProvider);
    setError("");
    setQuickMenu(null);
  }

  function chooseModel(nextModel: string) {
    setModel(nextModel);
    setQuickMenu(null);
  }

  function chooseAspectRatio(nextAspectRatio: string) {
    setAspectRatio(nextAspectRatio);
    setQuickMenu(null);
  }

  function chooseResolution(nextResolution: string) {
    if (!supportsCustomSize && nextResolution !== OFFICIAL_OPENAI_RESOLUTION) {
      setResolution(OFFICIAL_OPENAI_RESOLUTION);
      setQuickMenu(null);
      setError(locale === "zh"
        ? "官方 OpenAI 仅开放 1K；配置 OpenAI-compatible Base URL 后可使用 2K/4K。"
        : "Official OpenAI only allows 1K here. Configure an OpenAI-compatible Base URL to use 2K/4K.");
      return;
    }

    setResolution(nextResolution);
    setQuickMenu(null);

    if (isHighLoadResolution(nextResolution)) {
      setError(locale === "zh"
        ? "4K 会显著增加上游网关负载，部分 OpenAI-compatible 网关可能拒绝或超时；如果失败请改用 2K。"
        : "4K is high load for upstream gateways. Some OpenAI-compatible gateways may reject it or time out; use 2K if it fails.");
    } else {
      setError("");
    }
  }

  function chooseQuality(nextQuality: string) {
    setQuality(nextQuality);
    setQuickMenu(null);
  }

  function chooseInputFidelity(nextInputFidelity: string) {
    setInputFidelity(nextInputFidelity);
    setQuickMenu(null);
  }

  function sendActiveRunToBackground(options: { showNotice?: boolean } = {}) {
    const runId = getActiveStudioRunId();
    if (runId) {
      updateStudioRun(runId, { background: true });
      setActiveStudioRun("");
      setPendingGeneration(null);
      setBatchRunning(false);
      if (options.showNotice !== false) {
        showRunNotice(t("backgroundRunQueued"));
      }
    }

    setActiveView("gallery");
    setParamsOpen(false);
    setQuickMenu(null);
    void loadJobs("active");
  }

  function keepActiveRunInStudio() {
    const runId = getActiveStudioRunId();
    if (!runId) return;

    updateStudioRun(runId, { background: false });
    setActiveView("studio");
    setParamsOpen(false);
    setQuickMenu(null);
  }

  function updateMode(nextMode: ImageMode) {
    if (nextMode === "image-to-image" && !canUseImageMode) {
      setError(t("imageOff"));
      return;
    }

    setMode(nextMode);
    setError("");
  }

  function updateGenerationInputMode(nextMode: GenerationInputMode) {
    if (loading) return;

    setGenerationInputMode(nextMode);
    setError("");
    setQuickMenu(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function insertBatchPromptTemplate() {
    if (loading) return;

    const template = getBatchPromptTemplate(mode, locale);
    const emptyBlock = `${BATCH_PROMPT_START}\n\n${BATCH_PROMPT_END}`;
    setBatchPromptText((current) => current.trim() ? `${current.trimEnd()}\n\n${emptyBlock}` : template);
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function updateFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;

    const combined = [...files, ...Array.from(nextFiles)].slice(0, 4);
    setFiles(combined);

    if (combined.length > 0 && canUseImageMode) {
      setMode("image-to-image");
      setParamsOpen(true);
    }
  }

  function handleReferenceDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (loading || !canUseImageMode) return;
    setReferenceDragging(true);
  }

  function handleReferenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setReferenceDragging(false);

    if (loading || !canUseImageMode) return;
    updateFiles(event.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function openGenerationStudio() {
    const activeRunId = getActiveStudioRunId();
    if (activeRunId) {
      updateStudioRun(activeRunId, { background: true });
      setActiveStudioRun("");
      showRunNotice(t("backgroundRunQueued"));
    }

    setActiveView("studio");
    setParamsOpen(false);
    setQuickMenu(null);
    setSourceImageIds([]);
    setFiles([]);
    setPrompt("");
    setBatchPromptText("");
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setGenerationInputMode("single");
    setError("");
    setMode(DEFAULT_MODE);
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function returnToGallery() {
    if (loading) return;
    if (activeStudioRunIsRunning) {
      sendActiveRunToBackground();
      return;
    }

    setActiveView("gallery");
    setParamsOpen(false);
    setQuickMenu(null);
  }

  function clearOutputResult() {
    if (loading) return;
    const activeRunId = getActiveStudioRunId();
    if (activeRunId) {
      updateStudioRun(activeRunId, { background: true });
      setActiveStudioRun("");
    }

    setSelectedRecordId("");
    closeLightbox();
    setCopiedId("");
    setCopiedPromptId("");
    setPendingGeneration(null);
    setBatchRunning(false);
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setError("");
  }

  function toggleStudioLayout() {
    setStudioLayout((current) => {
      const next = current === "controls-left" ? "controls-right" : "controls-left";
      try {
        window.localStorage.setItem(STUDIO_LAYOUT_STORAGE_KEY, next);
      } catch {
        // Keep the in-memory preference even if persistence is unavailable.
      }
      return next;
    });
    setQuickMenu(null);
  }

  function startContinueEdit(record: ImageRecord) {
    if (!isProviderId(record.provider)) return;

    setActiveView("studio");
    setGenerationInputMode("single");
    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    setProvider(record.provider);
    setModel(record.model);
    setMode("image-to-image");
    setSourceImageIds([record.id]);
    setParamsOpen(true);
    setPrompt("");
    setError("");
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function canContinueRecord(record: ImageRecord) {
    return Boolean(
      isProviderId(record.provider)
      && catalog?.providers.find((item) => item.provider === record.provider)?.configured
      && modelSupports(catalog?.models.find((item) => item.provider === record.provider && item.modelId === record.model), "continue-edit")
    );
  }

  function toggleFavoriteRecord(id: string) {
    setFavoriteRecordIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [id, ...current];
    });
  }

  function toggleHistorySelection(id: string) {
    setSelectedHistoryIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function selectAllVisibleHistory() {
    setSelectedHistoryIds(filteredRecords.map((record) => record.id));
  }

  async function copySelectedImageLinks() {
    const links = selectedHistoryRecords.map((record) => new URL(record.imageUrl, window.location.origin).toString());
    await navigator.clipboard.writeText(links.join("\n"));
  }

  function downloadSelectedImages() {
    selectedHistoryRecords.forEach((record, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = record.imageUrl;
        link.download = `image-2-${record.id}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 120);
    });
  }

  async function deleteHistoryImages(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const confirmed = window.confirm(uniqueIds.length === 1
      ? (locale === "zh" ? "删除这张图片？此操作不可撤销。" : "Delete this image? This cannot be undone.")
      : (locale === "zh" ? `删除选中的 ${uniqueIds.length} 张图片？此操作不可撤销。` : `Delete ${uniqueIds.length} selected images? This cannot be undone.`));
    if (!confirmed) return;

    setError("");
    setDeletingHistoryIds((current) => Array.from(new Set([...current, ...uniqueIds])));

    try {
      const response = await fetch("/api/images/history", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds })
      });
      const body = (await response.json().catch(() => ({}))) as { deletedIds?: unknown; error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        throw new Error(body.error || (locale === "zh" ? "图片删除失败。" : "Images could not be deleted."));
      }

      const deletedIds = Array.isArray(body.deletedIds)
        ? body.deletedIds.filter((id): id is string => typeof id === "string")
        : uniqueIds;
      const deletedSet = new Set(deletedIds);

      setRecords((current) => current.filter((record) => !deletedSet.has(record.id)));
      setSelectedHistoryIds((current) => current.filter((id) => !deletedSet.has(id)));
      setFavoriteRecordIds((current) => current.filter((id) => !deletedSet.has(id)));
      setSourceImageIds((current) => current.filter((id) => !deletedSet.has(id)));
      setSelectedRecordId((current) => deletedSet.has(current) ? "" : current);
      if (lightboxRecordId && deletedSet.has(lightboxRecordId)) {
        closeLightbox();
      }
      setCopiedId((current) => deletedSet.has(current) ? "" : current);
      setCopiedPromptId((current) => deletedSet.has(current) ? "" : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "zh" ? "图片删除失败。" : "Images could not be deleted."));
    } finally {
      setDeletingHistoryIds((current) => current.filter((id) => !uniqueIds.includes(id)));
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;

    const response = await fetch("/api/images/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageProjectResponse> & { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok || !body.id) {
      setError(body.error || (locale === "zh" ? "项目创建失败。" : "Project could not be created."));
      return;
    }

    setNewProjectName("");
    setAssignProjectId(body.id);
    await loadProjects();
  }

  function parseAssignTags() {
    return assignTagsText
      .split(/[,\n，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function assignSelectedImages() {
    if (selectedHistoryIds.length === 0) return;

    const response = await fetch("/api/images/projects/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recordIds: selectedHistoryIds,
        projectId: assignProjectId || null,
        tags: parseAssignTags()
      })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      setError(body.error || (locale === "zh" ? "图片整理失败。" : "Images could not be organized."));
      return;
    }

    await Promise.all([loadHistory(), loadProjects()]);
    setSelectedHistoryIds([]);
  }

  async function exportSelectedImagesZip() {
    if (selectedHistoryIds.length === 0) return;

    const response = await fetch("/api/images/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selectedHistoryIds, naming: "prompt" })
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error || (locale === "zh" ? "导出失败。" : "Export failed."));
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `image-2-export-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function applyPromptTemplate(template: PromptTemplateResponse) {
    if (generationInputMode === "batch") {
      const block = `${BATCH_PROMPT_START}\n${template.content}\n${BATCH_PROMPT_END}`;
      setBatchPromptText((current) => current.trim() ? `${current.trimEnd()}\n\n${block}` : block);
    } else {
      setPrompt((current) => current.trim() ? `${current.trimEnd()}\n${template.content}` : template.content);
    }
    setTemplateOpen(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function saveCurrentPromptAsTemplate() {
    const content = generationInputMode === "batch" ? batchPromptText.trim() : prompt.trim();
    if (!content) {
      setError(t("enterPrompt"));
      return;
    }

    const title = templateTitle.trim() || content.split(/\s+/).slice(0, 8).join(" ").slice(0, 60) || "Prompt template";
    const response = await fetch("/api/images/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        category: templateCategory.trim() || "Default",
        mode: templateMode,
        content
      })
    });
    const body = (await response.json().catch(() => ({}))) as Partial<PromptTemplateResponse> & { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok || !body.id) {
      setError(body.error || (locale === "zh" ? "模板保存失败。" : "Template could not be saved."));
      return;
    }

    setTemplateTitle("");
    setTemplateCategory("");
    setTemplateOpen(true);
    await loadTemplates();
  }

  async function deletePromptTemplate(template: PromptTemplateResponse) {
    if (deletingTemplateId) return;

    const confirmed = window.confirm(`${locale === "zh" ? "\u5220\u9664\u6a21\u677f" : "Delete template"}: ${template.title}`);
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    setError("");

    try {
      const response = await fetch(`/api/images/templates/${template.id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        throw new Error(body.error || (locale === "zh" ? "模板删除失败。" : "Template could not be deleted."));
      }

      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "zh" ? "模板删除失败。" : "Template could not be deleted."));
    } finally {
      setDeletingTemplateId("");
    }
  }

  function clearSource(id: string) {
    setSourceImageIds((current) => current.filter((item) => item !== id));
  }

  function buildImageJobFormData(promptValue: string, batchMeta?: { batchId: string; itemId: string }) {
    const formData = new FormData();
    formData.set("provider", provider);
    formData.set("model", model);
    formData.set("mode", mode);
    formData.set("prompt", promptValue);
    formData.set("size", computedSize);
    formData.set("aspectRatio", aspectRatio);
    formData.set("resolution", resolution);
    formData.set("quality", quality);
    formData.set("inputFidelity", inputFidelity);
    if (batchMeta) {
      formData.set("batchId", batchMeta.batchId);
      formData.set("batchItemId", batchMeta.itemId);
    }
    sourceImageIds.forEach((id) => formData.append("sourceImageIds", id));
    files.forEach((file) => formData.append("files", file));

    return formData;
  }

  function buildBatchStartFormData(prompts: string[]) {
    const formData = buildImageJobFormData(prompts[0] ?? "");
    formData.delete("prompt");
    formData.set("prompts", JSON.stringify(prompts));
    formData.set("promptFormat", getPromptFormat(batchPromptText));

    return formData;
  }

  async function createImageJob(promptValue: string, batchMeta?: { batchId: string; itemId: string }) {
    const response = await fetch("/api/images/create", {
      method: "POST",
      body: buildImageJobFormData(promptValue, batchMeta)
    });
    const body = (await response.json().catch(() => ({}))) as Partial<CreateImageJobResponse> & { error?: string };

    if (handleUnauthorized(response)) return null;

    if (!response.ok) {
      throw new Error(body.error || t("generationFailed"));
    }

    if (!body.jobId) {
      throw new Error(t("generationFailed"));
    }

    return {
      jobId: body.jobId,
      status: body.status ?? "pending"
    };
  }

  async function startBatch(prompts: string[]) {
    const response = await fetch("/api/images/batches/start", {
      method: "POST",
      body: buildBatchStartFormData(prompts)
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

    if (handleUnauthorized(response)) return null;

    if (!response.ok || !body.id || !Array.isArray(body.items)) {
      throw new Error(body.error || (locale === "zh" ? "批次启动失败。" : "Batch could not be started."));
    }

    return body as ImageBatchDetailResponse;
  }

  async function changeImageJobState(jobId: string, action: "pause" | "resume" | "kill") {
    const job = await changeImageJobStateOnServer(jobId, action);
    if (!job) return null;

    if (job.batchId && job.batchId === activeBatchId) {
      await loadBatchDetail(job.batchId, { showInStudio: true, pollActive: false });
      if (action === "resume") {
        void pollBatchUntilFinished(job.batchId);
      }
    } else if (job.batchId) {
      await loadBatches();
    }

    return job;
  }

  async function runBatchItem(item: BatchGenerationItem) {
    updateBatchItem(item.id, {
      status: "creating",
      error: undefined,
      imageUrl: undefined,
      resultId: undefined
    });

    const created = await createImageJob(item.prompt, item.batchId ? { batchId: item.batchId, itemId: item.id } : undefined);
    if (!created) {
      throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
    }

    updateBatchItem(item.id, {
      status: "pending",
      jobId: created.jobId
    });
    updateBatchItem(item.id, { status: "running" });

    const job = await pollImageJob(created.jobId);
    updateBatchItem(item.id, {
      status: "succeeded",
      resultId: job.resultId,
      imageUrl: job.imageUrl,
      error: undefined
    });

    return job;
  }

  function isSessionExpiredError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("session expired") || message.includes("登录已过期");
  }

  async function pollImageJob(jobId: string) {
    const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const response = await fetch(`/api/images/jobs/${jobId}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<ImageJobResponse> & { error?: string };

      if (handleUnauthorized(response)) {
        throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
      }

      if (!response.ok) {
        throw new Error(body.error || t("generationFailed"));
      }

      const job = body.id && body.status ? body as ImageJobResponse : null;
      if (job) {
        mergeJobState(job);
      }

      if (job?.status === "succeeded") {
        if (!job.resultId) {
          throw new Error(t("generationFailed"));
        }

        return job;
      }

      if (job?.status === "failed") {
        throw new Error(job.error || t("generationFailed"));
      }

      if (job?.status === "paused") {
        throw new Error(locale === "zh" ? "\u4efb\u52a1\u5df2\u6682\u505c\uff0c\u6062\u590d\u540e\u4f1a\u7ee7\u7eed\u6392\u961f\u3002" : "The job is paused. Resume it to continue.");
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    throw new Error(locale === "zh"
      ? "生成任务仍在运行，请稍后刷新历史记录查看结果。"
      : "The generation job is still running. Refresh history later to check the result.");
  }

  async function pollBatchUntilFinished(batchId: string, options: { runId?: string } = {}) {
    let deadline = Date.now() + BATCH_QUEUE_TIMEOUT_MS;
    let latest: ImageBatchDetailResponse | null = null;
    const shouldUpdateStudio = () => !options.runId || isActiveStudioRun(options.runId);

    while (Date.now() < deadline) {
      const response = await fetch(`/api/images/batches/${batchId}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

      if (handleUnauthorized(response)) {
        throw new Error(locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.");
      }

      if (!response.ok || !body.id || !Array.isArray(body.items)) {
        throw new Error(body.error || (locale === "zh" ? "批次状态加载失败。" : "Batch status could not be loaded."));
      }

      latest = body as ImageBatchDetailResponse;
      const updateStudio = shouldUpdateStudio();
      mergeBatchJobStates(latest, { updateBatchItems: updateStudio });
      const batchStartedAt = new Date(latest.createdAt).getTime();
      if (!Number.isNaN(batchStartedAt)) {
        deadline = batchStartedAt + BATCH_QUEUE_TIMEOUT_MS + JOB_POLL_INTERVAL_MS;
      }

      const active = isBatchDetailActive(latest);
      if (updateStudio) {
        setBatchItems(latest.items.map(batchItemToGenerationItem));
        setBatchRunning(active);
        updateBatchTiming(latest, active);
      }

      if (!active) {
        await loadBatches();
        await loadHistory({ selectFirst: updateStudio });
        await loadJobs();
        if (updateStudio && latest.items.some((item) => item.error?.includes("10 minute queue limit"))) {
          setError(t("batchTimedOut"));
        }

        const lastSuccessful = [...latest.items].reverse().find((item) => item.resultId);
        if (updateStudio && lastSuccessful?.resultId) {
          setSelectedRecordId(lastSuccessful.resultId);
        }
        return latest;
      }

      await wait(JOB_POLL_INTERVAL_MS);
    }

    const finalBatch = shouldUpdateStudio()
      ? await loadBatchDetail(batchId, { showInStudio: false, pollActive: false })
      : latest;
    if (shouldUpdateStudio() && finalBatch?.items.some((item) => item.error?.includes("10 minute queue limit"))) {
      setError(t("batchTimedOut"));
    }

    await loadBatches();
    return latest;
  }

  function startSingleRunPoll(runId: string, jobId: string) {
    void (async () => {
      try {
        const job = await pollImageJob(jobId);
        updateStudioRun(runId, {
          status: "succeeded",
          background: !isActiveStudioRun(runId),
          resultId: job.resultId,
          error: undefined
        });
        await loadHistory({ selectFirst: isActiveStudioRun(runId) });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setPendingGeneration(null);
          if (job.resultId) {
            setSelectedRecordId(job.resultId);
          }
        } else {
          showRunNotice(t("backgroundRunComplete"));
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t("generationFailed");
        updateStudioRun(runId, {
          status: "failed",
          background: !isActiveStudioRun(runId),
          error: message
        });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setPendingGeneration(null);
          setError(message);
        } else {
          showRunNotice(t("backgroundRunFailed"));
        }
      }
    })();
  }

  function startBatchRunPoll(runId: string, batchId: string) {
    void (async () => {
      try {
        const batch = await pollBatchUntilFinished(batchId, { runId });
        const failed = batch?.items.some((item) => item.status === "failed") ?? false;
        const timedOut = batch?.items.some((item) => item.error?.includes("10 minute queue limit")) ?? false;

        updateStudioRun(runId, {
          status: failed ? "failed" : "succeeded",
          background: !isActiveStudioRun(runId),
          error: failed ? (timedOut ? t("batchTimedOut") : t("generationFailed")) : undefined
        });
        await loadBatches();
        await loadHistory({ selectFirst: isActiveStudioRun(runId) });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setBatchRunning(false);
          if (timedOut) {
            setError(t("batchTimedOut"));
          }
        } else {
          showRunNotice(failed ? t("backgroundRunFailed") : t("backgroundRunComplete"));
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t("generationFailed");
        updateStudioRun(runId, {
          status: "failed",
          background: !isActiveStudioRun(runId),
          error: message
        });
        await loadJobs();

        if (isActiveStudioRun(runId)) {
          setBatchRunning(false);
          setError(message);
        } else {
          showRunNotice(t("backgroundRunFailed"));
        }
      }
    })();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setActiveView("studio");

    if (generationInputMode === "batch") {
      await submitBatch();
      return;
    }

    await submitSingle();
  }

  async function submitSingle() {
    if (!selectedModel) {
      setError(t("chooseModelFirst"));
      setSettingsOpen(true);
      return;
    }

    if (!isConfigured) {
      setError(t("providerNoKey"));
      setSettingsOpen(true);
      return;
    }

    const singlePrompt = prompt.trim();
    if (!singlePrompt) {
      setError(t("enterPrompt"));
      return;
    }

    if (singlePrompt.length > MAX_PROMPT_LENGTH) {
      setError(t("batchPromptTooLong"));
      return;
    }

    if (mode === "image-to-image" && files.length + sourceImageIds.length === 0) {
      setError(t("imageNeedsReference"));
      return;
    }

    setBatchItems([]);
    setActiveBatchId("");
    resetBatchTiming();
    const runStartedAt = Date.now();
    const pending: PendingGeneration = {
      provider,
      model,
      mode,
      prompt: singlePrompt,
      size: computedSize,
      aspectRatio,
      quality,
      sourceImageIds: [...sourceImageIds],
      fileNames: files.map((file) => file.name),
      startedAt: runStartedAt
    };
    setPendingGeneration(pending);
    setLoading(true);
    let launched = false;

    try {
      const created = await createImageJob(singlePrompt);
      if (!created) return;

      launched = true;
      const runId = createStudioRunId("single", created.jobId);
      upsertStudioRun({
        id: runId,
        kind: "single",
        status: "running",
        startedAt: runStartedAt,
        background: false,
        jobId: created.jobId,
        prompt: singlePrompt
      });
      setActiveStudioRun(runId);
      mergeJobState({
        id: created.jobId,
        status: created.status ?? "pending",
        provider,
        model,
        mode,
        prompt: singlePrompt,
        createdAt: new Date(runStartedAt).toISOString()
      });
      startSingleRunPoll(runId, created.jobId);
      void loadJobs("active").catch((caught) => {
        console.warn("[images/jobs] active jobs refresh failed after single launch", {
          jobId: created.jobId,
          cause: caught instanceof Error ? caught.message : String(caught)
        });
      });
      setPrompt("");
      setFiles([]);
      setSourceImageIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
    } finally {
      setLoading(false);
      if (!launched) {
        setPendingGeneration(null);
      }
    }
  }

  async function submitBatch() {
    try {
      if (!selectedModel) {
        setError(t("chooseModelFirst"));
        setSettingsOpen(true);
        return;
      }

      if (!isConfigured) {
        setError(t("providerNoKey"));
        setSettingsOpen(true);
        return;
      }

      if (batchParseErrorKey) {
        setError(t(batchParseErrorKey));
        return;
      }

      const prompts = batchPrompts;
      if (prompts.length === 0) {
        setError(t("enterPrompt"));
        return;
      }

      if (prompts.length > MAX_BATCH_PROMPTS) {
        setError(t("batchTooManyPrompts"));
        return;
      }

      if (prompts.some((item) => item.length > MAX_PROMPT_LENGTH)) {
        setError(t("batchPromptTooLong"));
        return;
      }

      if (mode === "image-to-image" && files.length + sourceImageIds.length === 0) {
        setError(t("imageNeedsReference"));
        return;
      }

      setLoading(true);
      const batch = await startBatch(prompts);
      if (!batch) return;

      const initialItems = batch.items.map((item) => ({
        ...batchItemToGenerationItem(item),
        size: computedSize,
        aspectRatio,
        quality
      }));

      const runId = createStudioRunId("batch", batch.id);
      upsertStudioRun({
        id: runId,
        kind: "batch",
        status: "running",
        startedAt: new Date(batch.createdAt).getTime() || Date.now(),
        background: false,
        batchId: batch.id,
        totalCount: batch.items.length
      });
      setActiveStudioRun(runId);
      setActiveBatchId(batch.id);
      setBatchItems(initialItems);
      setSelectedRecordId("");
      closeLightbox();
      setPendingGeneration(null);
      setBatchRunning(true);
      updateBatchTiming(batch, true);
      await Promise.all([loadJobs("active"), loadBatches()]);
      startBatchRunPoll(runId, batch.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function retryBatchOnServer(itemIds: string[]) {
    if (!activeBatchId || itemIds.length === 0) return;

    const response = await fetch(`/api/images/batches/${activeBatchId}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds })
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageBatchDetailResponse> & { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok || !body.id || !Array.isArray(body.items)) {
      throw new Error(body.error || (locale === "zh" ? "重试失败。" : "Retry failed."));
    }

    const batch = body as ImageBatchDetailResponse;
    setBatchItems(batch.items.map(batchItemToGenerationItem));
    updateBatchTiming(batch, true);
    await pollBatchUntilFinished(activeBatchId);
    await loadJobs();
  }

  async function retryBatchItem(item: BatchGenerationItem) {
    if (loading || item.status !== "failed") return;

    setError("");
    setBatchRunning(true);
    setLoading(true);

    try {
      if (activeBatchId && item.batchId) {
        await retryBatchOnServer([item.id]);
      } else {
        const job = await runBatchItem(item);
        await loadHistory();
        if (job.resultId) {
          setSelectedRecordId(job.resultId);
        }
      }
    } catch (caught) {
      if (!isSessionExpiredError(caught)) {
        updateBatchItem(item.id, {
          status: "failed",
          error: caught instanceof Error ? caught.message : t("generationFailed")
        });
      }
    } finally {
      setLoading(false);
      setBatchRunning(false);
    }
  }

  async function retryFailedBatchItems() {
    const failedItems = batchItems.filter((item) => isRetryableBatchItemStatus(item.status));
    if (loading || failedItems.length === 0) return;

    setError("");
    setBatchRunning(true);
    setLoading(true);
    let lastResultId = "";

    try {
      if (activeBatchId && failedItems.every((item) => item.batchId)) {
        await retryBatchOnServer(failedItems.map((item) => item.id));
        return;
      }

      await Promise.all(failedItems.map(async (item) => {
        updateBatchItem(item.id, {
          retryCount: (item.retryCount ?? 0) + 1
        });

        try {
          const job = await runBatchItem(item);
          if (job.resultId) {
            lastResultId = job.resultId;
          }
        } catch (caught) {
          if (isSessionExpiredError(caught)) return;

          updateBatchItem(item.id, {
            status: "failed",
            error: caught instanceof Error ? caught.message : t("generationFailed")
          });
        }
      }));

      await loadHistory();
      if (lastResultId) {
        setSelectedRecordId(lastResultId);
      }
    } finally {
      setLoading(false);
      setBatchRunning(false);
    }
  }

  async function trackImageJob(job: ImageJobResponse) {
    setError("");

    if (job.batchId) {
      await loadBatchDetail(job.batchId, {
        showInStudio: true,
        pollActive: isActiveImageJobStatus(job.status)
      });
      await loadJobs();
      return;
    }

    if (job.status === "succeeded" && job.resultId) {
      await loadHistory();
      setSelectedRecordId(job.resultId);
      setActiveView("studio");
      return;
    }

    if (job.status === "failed") {
      setError(job.error || t("generationFailed"));
      return;
    }

    if (job.status === "paused") {
      setError(locale === "zh" ? "\u4efb\u52a1\u5df2\u6682\u505c\uff0c\u8bf7\u5148\u6062\u590d\u4efb\u52a1\u3002" : "This job is paused. Resume it before tracking.");
      return;
    }

    setTrackingJobId(job.id);
    try {
      const finished = await pollImageJob(job.id);
      await loadHistory();
      await loadJobs();
      if (finished.resultId) {
        setSelectedRecordId(finished.resultId);
        setActiveView("studio");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
      await loadJobs();
    } finally {
      setTrackingJobId("");
    }
  }

  async function retryStandaloneJob(job: ImageJobResponse) {
    if (job.batchId) {
      await loadBatchDetail(job.batchId, { showInStudio: true, pollActive: false });
      return;
    }

    setError("");
    setTrackingJobId(job.id);

    try {
      const response = await fetch(`/api/images/jobs/${job.id}/retry`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as Partial<CreateImageJobResponse> & { error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok || !body.jobId) {
        throw new Error(body.error || (locale === "zh" ? "任务重试失败。" : "Job retry failed."));
      }

      await loadJobs();
      const finished = await pollImageJob(body.jobId);
      await loadHistory();
      await loadJobs();
      if (finished.resultId) {
        setSelectedRecordId(finished.resultId);
        setActiveView("studio");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("generationFailed"));
      await loadJobs();
    } finally {
      setTrackingJobId("");
    }
  }

  async function copyImage(record: ImageRecord) {
    const url = new URL(record.imageUrl, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopiedId(record.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function copyPromptText(record: ImageRecord) {
    await navigator.clipboard.writeText(record.prompt);
    setCopiedPromptId(record.id);
    window.setTimeout(() => setCopiedPromptId(""), 1400);
  }

  async function clearHistory() {
    setTopbarMenuOpen(false);
    if (!window.confirm(t("clearHistoryConfirm"))) return;

    setError("");

    try {
      const response = await fetch("/api/images/history/clear", { method: "POST" });

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        setError(t("clearHistoryFailed"));
        return;
      }

      setRecords([]);
      setHistoryNextCursor(undefined);
      setSourceImageIds([]);
      setSelectedRecordId("");
      closeLightbox();
      setSelectedHistoryIds([]);
      setFavoriteRecordIds([]);
      setDeletingHistoryIds([]);
      setCopiedId("");
      setCopiedPromptId("");
    } catch {
      setError(t("clearHistoryFailed"));
    }
  }

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <Loader2 className="spin" size={24} />
          <h1>{branding.siteTitle}</h1>
          <p>正在加载账户状态...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-shell">
        <form className="auth-card" data-testid="auth-form" onSubmit={(event) => void submitAuth(event)}>
          <div className="brand center-brand">
            {renderBrandMark()}
            <div>
              <p className="brand-title">{branding.siteTitle}</p>
              <p className="brand-subtitle">Multi-user image workspace</p>
            </div>
          </div>
          <h1>{authMode === "login" ? "登录" : "注册"}</h1>
          <label className="key-field">
            <span>邮箱</span>
            <input className="field" data-testid="auth-email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label className="key-field">
            <span>密码</span>
            <input className="field" data-testid="auth-password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} />
          </label>
          {authError && <div className="alert">{authError}</div>}
          <button className="primary-button" data-testid="auth-submit" type="submit">
            {authMode === "login" ? "登录" : "创建账号"}
          </button>
          <div className="auth-switch">
            <button className="text-button tiny" type="button" onClick={() => setAuthMode("login")}>登录</button>
            <button className="text-button tiny" type="button" disabled={!registrationOpen} onClick={() => setAuthMode("register")}>注册</button>
          </div>
          {!registrationOpen && <p className="settings-note">注册已关闭，请联系管理员创建账号。</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="studio-shell">
      {(settingsOpen || adminOpen) && <button className="drawer-scrim" aria-label={t("closePreview")} type="button" onClick={() => { setSettingsOpen(false); setAdminOpen(false); }} />}

      <aside className={`settings-drawer ${settingsOpen ? "is-open" : ""}`} aria-hidden={!settingsOpen}>
        <div className="drawer-head">
          <div>
            <p className="section-label">{t("settings")}</p>
            <h2>{t("apiProvider")}</h2>
          </div>
          <button className="icon-button" type="button" title={t("closePreview")} onClick={() => setSettingsOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <section className="drawer-section">
          <p className="section-label">{t("provider")}</p>
          <div className="provider-pills">
            {catalog?.providers.map((item) => (
              <button
                className={`provider-pill ${provider === item.provider ? "is-selected" : ""}`}
                key={item.provider}
                onClick={() => updateProvider(item.provider)}
                type="button"
              >
                <span>{item.label}</span>
                <span className={`status-dot ${item.configured ? "is-ready" : ""}`} title={item.configured ? t("ready") : t("missingKey")} />
              </button>
            ))}
          </div>
        </section>

        <section className="drawer-section">
          <p className="section-label">{t("apiKeys")}</p>
          <div className="filter-stack">
            <label className="key-field">
              <span>{t("openaiKey")}</span>
              <input
                className="field"
                value={openaiKey}
                onChange={(event) => setOpenaiKey(event.target.value)}
                placeholder={userOpenaiKeyConfigured ? t("configuredReplace") : "sk-..."}
                type="password"
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <section className="drawer-section">
          <p className="section-label">{t("openaiCompatible")}</p>
          <div className="filter-stack">
            <label className="key-field">
              <span>{t("baseUrl")}</span>
              <input
                className="field"
                value={openaiBaseUrl}
                onChange={(event) => setOpenaiBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                type="url"
              />
            </label>
            <label className="key-field">
              <span>{t("modelId")}</span>
              <input
                className="field"
                value={openaiModel}
                onChange={(event) => setOpenaiModel(event.target.value)}
                placeholder="gpt-image-2 or provider image model"
                type="text"
              />
            </label>
            <p className="settings-note">
              {t("baseUrlNote")}
            </p>
          </div>
        </section>

        <section className="drawer-section drawer-save-section">
          <button className="primary-button drawer-save" type="button" disabled={savingSettings} onClick={() => void saveProviderSettings()}>
            {savingSettings ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
            {savingSettings ? t("saving") : t("saveKeys")}
          </button>
          {settingsMessage && <p className="settings-message">{settingsMessage}</p>}
          <p className="settings-note">{locale === "zh" ? "会同时保存供应商、API 密钥、Base URL 和模型覆盖。" : "Saves provider, API keys, Base URL, and model overrides together."}</p>
        </section>

        <section className="drawer-section">
          <p className="section-label">{t("historyFilter")}</p>
          <div className="filter-stack">
            <select
              className="select"
              value={historyFilter.provider}
              onChange={(event) => setHistoryFilter((current) => ({ ...current, provider: event.target.value as HistoryFilter["provider"] }))}
              aria-label={t("provider")}
            >
              <option value="all">{t("allProviders")}</option>
              {catalog?.providers.map((item) => (
                <option key={item.provider} value={item.provider}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={historyFilter.model}
              onChange={(event) => setHistoryFilter((current) => ({ ...current, model: event.target.value }))}
              aria-label={t("model")}
            >
              <option value="all">{t("allModels")}</option>
              {catalog?.models.map((item) => (
                <option key={`${item.provider}:${item.modelId}`} value={item.modelId}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      </aside>

      <aside className={`settings-drawer admin-drawer ${adminOpen ? "is-open" : ""}`} aria-hidden={!adminOpen}>
        <div className="drawer-head">
          <div>
            <p className="section-label">Admin</p>
            <h2>管理后台</h2>
          </div>
          <button className="icon-button" type="button" title={t("closePreview")} onClick={() => setAdminOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {adminOverview ? (
          <>
            <section className="drawer-section">
              <p className="section-label">站点设置</p>
              <label className="key-field">
                <span>站点标题</span>
                <input
                  className="field"
                  maxLength={80}
                  placeholder={DEFAULT_SITE_TITLE}
                  value={adminOverview.settings.siteTitle ?? ""}
                  onChange={(event) => setAdminOverview((current) => current ? {
                    ...current,
                    settings: { ...current.settings, siteTitle: event.target.value }
                  } : current)}
                />
              </label>
              <label className="key-field">
                <span>浏览器小图标 URL</span>
                <input
                  className="field"
                  maxLength={500}
                  placeholder="/favicon.ico"
                  value={adminOverview.settings.faviconUrl ?? ""}
                  onChange={(event) => setAdminOverview((current) => current ? {
                    ...current,
                    settings: { ...current.settings, faviconUrl: event.target.value }
                  } : current)}
                />
              </label>
              <label className="key-field">
                <span>品牌 Logo URL</span>
                <input
                  className="field"
                  maxLength={500}
                  placeholder="/logo.png"
                  value={adminOverview.settings.logoUrl ?? ""}
                  onChange={(event) => setAdminOverview((current) => current ? {
                    ...current,
                    settings: { ...current.settings, logoUrl: event.target.value }
                  } : current)}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={adminOverview.settings.registrationOpen}
                  onChange={(event) => void saveAdminSettings({ registrationOpen: event.target.checked })}
                />
                <span>允许个人自行注册</span>
              </label>
              <label className="key-field">
                <span>平台 key 每日额度</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={adminOverview.settings.dailyPlatformQuota}
                  onChange={(event) => setAdminOverview((current) => current ? {
                    ...current,
                    settings: { ...current.settings, dailyPlatformQuota: Number(event.target.value) }
                  } : current)}
                />
              </label>
              <button className="text-button" type="button" onClick={() => void saveAdminSettings()}>
                <Check size={16} />
                保存站点设置
              </button>
            </section>

            <section className="drawer-section">
              <p className="section-label">平台供应商</p>
              <div className="filter-stack">
                <label className="field-label">
                  <span>
                    OpenAI platform key
                    {adminOverview.platformProvider?.keys?.openai?.configured ? "（已配置；输入新 key 替换）" : ""}
                  </span>
                  <input className="field" type="password" placeholder="留空不清除旧 key" value={platformOpenaiKey} onChange={(event) => setPlatformOpenaiKey(event.target.value)} />
                </label>
                <label className="field-label">
                  <span>OpenAI Base URL（留空使用官方 OpenAI）</span>
                  <input className="field" placeholder="https://api.example.com/v1" value={platformOpenaiBaseUrl} onChange={(event) => setPlatformOpenaiBaseUrl(event.target.value)} />
                </label>
                <label className="field-label">
                  <span>OpenAI model override（留空使用默认模型）</span>
                  <input className="field" placeholder="gpt-image-2" value={platformOpenaiModel} onChange={(event) => setPlatformOpenaiModel(event.target.value)} />
                </label>
                <button className="primary-button drawer-save" type="button" onClick={() => void savePlatformProvider()}>
                  <Check size={17} />
                  保存平台配置
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">Job queue</p>
              <div className="admin-list">
                <div className="admin-row">
                  <div>
                    <strong>{adminOverview.jobQueue.active} / {adminOverview.jobQueue.concurrency}</strong>
                    <span>web inline active / limit</span>
                  </div>
                  <span>user {adminOverview.jobQueue.userConcurrency}</span>
                </div>
                <div className="admin-row">
                  <div>
                    <strong>{adminOverview.jobQueue.pending}</strong>
                    <span>DB pending jobs</span>
                  </div>
                  <span>DB running {adminOverview.jobQueue.running}</span>
                </div>
                {adminOverview.jobQueue.bullmq && (
                  <div className="admin-row">
                    <div>
                      <strong>{adminOverview.jobQueue.bullmq.waiting} / {adminOverview.jobQueue.bullmq.active}</strong>
                      <span>BullMQ waiting / active</span>
                    </div>
                    <span>delayed {adminOverview.jobQueue.bullmq.delayed}</span>
                  </div>
                )}
                <div className="admin-row">
                  <div>
                    <strong>{adminOverview.jobQueue.recentSucceeded}</strong>
                    <span>succeeded in 1h</span>
                  </div>
                  <span>failed {adminOverview.jobQueue.recentFailed}</span>
                </div>
                <div className="admin-row">
                  <div>
                    <strong>{formatMilliseconds(adminOverview.jobQueue.recent.averageQueueWaitMs)}</strong>
                    <span>avg queue</span>
                  </div>
                  <span>run {formatMilliseconds(adminOverview.jobQueue.recent.averageExecutionMs)}</span>
                </div>
                <div className="admin-row">
                  <div>
                    <strong>{adminOverview.jobQueue.recent.inspected}</strong>
                    <span>recent inspected / failure rate</span>
                  </div>
                  <span>{formatPercent(adminOverview.jobQueue.recent.inspected > 0 ? (adminOverview.jobQueue.recentFailed / adminOverview.jobQueue.recent.inspected) * 100 : null)}</span>
                </div>
                <div className="admin-row">
                  <div>
                    <strong>{formatMilliseconds(adminOverview.jobQueue.recent.averageUpstreamMs)}</strong>
                    <span>avg upstream</span>
                  </div>
                  <span>save {formatMilliseconds(adminOverview.jobQueue.recent.averageFileSaveMs)}</span>
                </div>
              </div>

              <div className="admin-subsection">
                <p className="section-label">Provider health</p>
                {adminOverview.jobQueue.providerHealth.length > 0 ? (
                  <div className="admin-list">
                    {adminOverview.jobQueue.providerHealth.map((item) => (
                      <div className={`admin-row admin-row-status is-${item.status}`} key={item.provider}>
                        <div>
                          <strong>{item.provider}</strong>
                          <span>{item.succeeded} ok / {item.failed} failed / {item.total} total</span>
                        </div>
                        <span>{item.status} {formatPercent(item.failureRate)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty">No recent provider jobs.</p>
                )}
              </div>

              <div className="admin-subsection">
                <p className="section-label">Model usage</p>
                {adminOverview.jobQueue.modelUsage.length > 0 ? (
                  <div className="admin-list">
                    {adminOverview.jobQueue.modelUsage.map((item) => (
                      <div className="admin-row" key={`${item.provider}:${item.model}`}>
                        <div>
                          <strong>{item.model}</strong>
                          <span>{item.provider} / {item.succeeded} ok / {item.failed} failed</span>
                        </div>
                        <span>{item.total} / {formatMilliseconds(item.averageExecutionMs)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty">No recent model usage.</p>
                )}
              </div>

              <div className="admin-subsection">
                <p className="section-label">Failure reasons</p>
                {adminOverview.jobQueue.failureReasons.length > 0 ? (
                  <div className="admin-list">
                    {adminOverview.jobQueue.failureReasons.map((item) => (
                      <div className="admin-row admin-row-multiline" key={item.reason}>
                        <div>
                          <strong>{item.reason}</strong>
                          <span>{item.sample}</span>
                        </div>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty">No recent failures.</p>
                )}
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">创建用户</p>
              <div className="filter-stack">
                <input className="field" type="email" placeholder="user@example.com" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} />
                <input className="field" type="password" placeholder="至少 8 位密码" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} />
                <button className="text-button" type="button" onClick={() => void createAdminUser()}>
                  <Check size={16} />
                  创建用户
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">用户</p>
              <div className="admin-list">
                {adminOverview.users.map((user) => (
                  <div className="admin-row" key={user.id}>
                    <div>
                      <strong>{user.email}</strong>
                      <span>{user.role}{user.disabled ? " / disabled" : ""}</span>
                    </div>
                    <div className="admin-row-actions">
                      <button className="text-button tiny" type="button" disabled={Boolean(deletingUserId)} onClick={() => void toggleUserDisabled(user)}>
                        {user.disabled ? "启用" : "禁用"}
                      </button>
                      <button
                        className="text-button tiny danger-button"
                        type="button"
                        disabled={Boolean(deletingUserId) || user.id === currentUser?.id}
                        onClick={() => void deleteAdminUser(user)}
                      >
                        {deletingUserId === user.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">用量</p>
              <div className="admin-list">
                {adminOverview.usage.slice(0, 12).map((item) => (
                  <div className="admin-row" key={item.id}>
                    <div>
                      <strong>{item.userEmail}</strong>
                      <span>{item.date}</span>
                    </div>
                    <span>{item.platformUses}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <p className="section-label">最近历史</p>
              <div className="admin-list">
                {adminOverview.images.slice(0, 12).map((item) => (
                  <div className="admin-row" key={item.id}>
                    <div>
                      <strong>{item.userEmail}</strong>
                      <span>{item.provider} / {item.model}</span>
                    </div>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="composer-status">
            <Loader2 className="spin" size={17} />
            <span>加载管理数据...</span>
          </div>
        )}
        {adminMessage && <p className="settings-message">{adminMessage}</p>}
      </aside>

      <main className={`main view-${activeView} studio-layout-${studioLayout} ${selectedHistoryIds.length > 0 ? "has-selection-sidebar" : ""}`}>
        <header className="topbar">
          <div className="topbar-main">
            <div className="brand compact">
              {renderBrandMark()}
              <div>
                <p className="brand-title">{branding.siteTitle}</p>
                <p className="brand-subtitle">
                  {getProviderLabel(catalog, provider)} / {selectedModel?.label ?? model}
                </p>
              </div>
            </div>
            {activeView === "gallery" && (
              <div className={`topbar-search history-toolbar ${historyFiltersOpen ? "is-open" : ""}`} role="search">
                <label className="history-search-field">
                  <Search size={18} />
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder={locale === "zh" ? "搜索提示词、模型、尺寸..." : "Search prompts, models, sizes..."}
                    aria-label={locale === "zh" ? "搜索历史" : "Search history"}
                  />
                </label>
                <button
                  className={`icon-button history-favorite-filter ${favoriteOnly ? "is-active" : ""}`}
                  type="button"
                  title={locale === "zh" ? "只看收藏" : "Show favorites"}
                  aria-pressed={favoriteOnly}
                  onClick={() => setFavoriteOnly((current) => !current)}
                >
                  <Star size={18} fill={favoriteOnly ? "currentColor" : "none"} />
                </button>
                <button
                  className={`icon-button history-filter-toggle ${historyFiltersOpen ? "is-active" : ""}`}
                  type="button"
                  title={locale === "zh" ? "筛选" : "Filters"}
                  aria-expanded={historyFiltersOpen}
                  onClick={() => setHistoryFiltersOpen((current) => !current)}
                >
                  <Settings2 size={18} />
                </button>
                {historyFiltersActive && (
                  <button
                    className="icon-button history-reset-button"
                    type="button"
                    title={locale === "zh" ? "重置筛选" : "Reset filters"}
                    onClick={() => {
                      setHistorySearch("");
                      setFavoriteOnly(false);
                      setHistoryFilter({ provider: "all", model: "all" });
                      setHistoryBatchFilter("all");
                      setHistoryProjectFilter("all");
                      setHistoryTagFilter("");
                    }}
                  >
                    <X size={17} />
                  </button>
                )}
                <div className="history-filter-drawer" hidden={!historyFiltersOpen}>
                  <select
                    className="history-filter-select"
                    value={historyFilter.provider}
                    onChange={(event) => setHistoryFilter((current) => ({ ...current, provider: event.target.value as HistoryFilter["provider"], model: "all" }))}
                    aria-label={t("provider")}
                  >
                    <option value="all">{t("allProviders")}</option>
                    {catalog?.providers.map((item) => (
                      <option key={item.provider} value={item.provider}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="history-filter-select"
                    value={historyFilter.model}
                    onChange={(event) => setHistoryFilter((current) => ({ ...current, model: event.target.value }))}
                    aria-label={t("model")}
                  >
                    <option value="all">{t("allModels")}</option>
                    {catalog?.models
                      .filter((item) => historyFilter.provider === "all" || item.provider === historyFilter.provider)
                      .map((item) => (
                        <option key={`${item.provider}:${item.modelId}`} value={item.modelId}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                  <select
                    className="history-filter-select"
                    value={historyBatchFilter}
                    onChange={(event) => setHistoryBatchFilter(event.target.value)}
                    aria-label={locale === "zh" ? "批次" : "Batch"}
                  >
                    <option value="all">{locale === "zh" ? "全部批次" : "All batches"}</option>
                    {batches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="history-filter-select"
                    value={historyProjectFilter}
                    onChange={(event) => setHistoryProjectFilter(event.target.value)}
                    aria-label={locale === "zh" ? "项目" : "Project"}
                  >
                    <option value="all">{locale === "zh" ? "全部项目" : "All projects"}</option>
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="history-filter-select"
                    value={historyTagFilter}
                    onChange={(event) => setHistoryTagFilter(event.target.value)}
                    list="history-tags"
                    placeholder={locale === "zh" ? "标签" : "Tag"}
                    aria-label={locale === "zh" ? "标签" : "Tag"}
                  />
                  <datalist id="history-tags">
                    {allTags.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}
            <div className="toolbar topbar-actions">
              <div className="topbar-action-group topbar-user-actions">
                <span className="icon-button topbar-account-button" title={`${t("account")}: ${currentUser.email}`} aria-label={`${t("account")}: ${currentUser.email}`} role="img">
                  <UserCog size={18} />
                </span>
                {currentUser.role === "ADMIN" && (
                  <button
                    className="icon-button topbar-admin-button"
                    type="button"
                    title={t("admin")}
                    aria-label={t("admin")}
                    onClick={() => {
                      setTopbarMenuOpen(false);
                      setAdminOpen(true);
                    }}
                  >
                    <ShieldCheck size={18} />
                  </button>
                )}
                <button
                  className="icon-button topbar-language-button"
                  type="button"
                  title={t("languageTitle")}
                  aria-label={t("languageTitle")}
                  onClick={() => {
                    setTopbarMenuOpen(false);
                    setLocale((current) => current === "zh" ? "en" : "zh");
                  }}
                >
                  <Languages size={18} />
                </button>
              </div>
              <button
                className="primary-button topbar-create-button"
                data-testid="open-generation-studio"
                type="button"
                title={locale === "zh" ? "生成新图" : "New image"}
                aria-label={locale === "zh" ? "生成新图" : "New image"}
                onClick={() => {
                  setTopbarMenuOpen(false);
                  setJobMonitorOpen(false);
                  openGenerationStudio();
                }}
              >
                <ImagePlus size={17} />
                {locale === "zh" ? "生成新图" : "New image"}
              </button>
              <div className="topbar-action-group topbar-tool-actions">
              {activeView === "gallery" && (
                <>
                <button
                  className="icon-button"
                  data-testid="refresh-gallery"
                  type="button"
                  title={locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"}
                  aria-label={locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"}
                  disabled={historyLoading}
                  onClick={() => {
                    setTopbarMenuOpen(false);
                    void loadHistory({ selectFirst: false });
                  }}
                >
                  {historyLoading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                </button>
                <JobMonitor
                  open={jobMonitorOpen}
                  catalog={catalog}
                  jobs={jobs}
                  activeCount={activeJobs.length}
                  alertCount={jobMonitorAlertCount}
                  finishedCount={finishedJobs.length}
                  jobsLoading={jobsLoading}
                  historyLoading={historyLoading}
                  clearingAlerts={jobMonitorClearing}
                  clearingFinished={jobMonitorFinishedClearing}
                  trackingJobId={trackingJobId}
                  jobActionId={jobActionId}
                  labels={{
                    title: locale === "zh" ? "\u4efb\u52a1\u76d1\u63a7" : "Job monitor",
                    activity: locale === "zh" ? "\u6d3b\u52a8\u4e2d\u5fc3" : "Activity",
                    summary: locale === "zh"
                      ? `${activeJobs.length} \u6392\u961f/\u8fd0\u884c / ${failedJobs.length} \u5931\u8d25 / ${succeededJobs.length} \u5b8c\u6210`
                      : `${activeJobs.length} active / ${failedJobs.length} failed / ${succeededJobs.length} done`,
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
                    batch: locale === "zh" ? "\u6253\u5f00\u6279\u6b21" : "Batch",
                    track: locale === "zh" ? "\u8ffd\u8e2a" : "Track",
                    view: locale === "zh" ? "\u67e5\u770b" : "View",
                    noRecentJobs: locale === "zh" ? "\u6682\u65e0\u6700\u8fd1\u4efb\u52a1\u3002" : "No recent jobs.",
                    clearFinished: locale === "zh" ? "\u6e05\u7a7a\u5b8c\u6210/\u5931\u8d25" : "Clear finished",
                    clearAlerts: locale === "zh" ? "\u6e05\u7a7a\u63d0\u793a" : "Clear alerts",
                    refreshGallery: locale === "zh" ? "\u5237\u65b0\u56fe\u5e93" : "Refresh gallery"
                  }}
                  onToggle={() => {
                    setTopbarMenuOpen(false);
                    setJobMonitorOpen((current) => !current);
                  }}
                  onRefreshJobs={() => void loadJobs()}
                  onTrackJob={(job) => void trackImageJob(job)}
                  onChangeJobState={(jobId, action) => void changeImageJobState(jobId, action)}
                  onRetryStandaloneJob={(job) => void retryStandaloneJob(job)}
                  onClearFinished={() => void clearFinishedJobMonitorItems()}
                  onClearAlerts={() => void clearJobMonitorAlerts()}
                  onRefreshGallery={() => void loadHistory()}
                />
                </>
              )}
              <button
                className="icon-button"
                type="button"
                title={t("settings")}
                aria-label={t("settings")}
                onClick={() => {
                  setTopbarMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <Settings2 size={18} />
              </button>
              <div className={`topbar-more ${topbarMenuOpen ? "is-open" : ""}`}>
                <button
                  className="icon-button topbar-more-button"
                  type="button"
                  title={t("moreActions")}
                  aria-label={t("moreActions")}
                  aria-expanded={topbarMenuOpen}
                  onClick={() => {
                    setJobMonitorOpen(false);
                    setTopbarMenuOpen((current) => !current);
                  }}
                >
                  <Ellipsis size={18} />
                </button>
                {topbarMenuOpen && (
                  <div className="topbar-menu" role="menu">
                    <div className="topbar-menu-meta">
                      <span>{t("account")}</span>
                      <strong>{currentUser.email}</strong>
                    </div>
                    {currentUser.role === "ADMIN" && (
                      <button
                        className="topbar-menu-item topbar-menu-admin"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setTopbarMenuOpen(false);
                          setAdminOpen(true);
                        }}
                      >
                        <ShieldCheck size={15} />
                        {t("admin")}
                      </button>
                    )}
                    <button
                      className="topbar-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTopbarMenuOpen(false);
                        void logout();
                      }}
                    >
                      <LogOut size={15} />
                      {t("logout")}
                    </button>
                    <button
                      className="topbar-menu-item is-danger"
                      type="button"
                      role="menuitem"
                      disabled={records.length === 0 && !historyNextCursor}
                      onClick={() => void clearHistory()}
                    >
                      <Trash2 size={15} />
                      {t("clearHistory")}
                    </button>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </header>

        {runNotice && (
          <div className="app-toast" role="status">
            <Check size={16} />
            <span>{runNotice}</span>
          </div>
        )}

        <section className="workspace">
          {activeView === "studio" && (
            <div className="studio-stage-head">
              <button className="text-button" type="button" disabled={loading} onClick={returnToGallery}>
                <ChevronDown size={16} />
                {locale === "zh" ? "返回图库" : "Back to gallery"}
              </button>
              <div>
                <p className="section-label">{locale === "zh" ? "统一生图台" : "Generation studio"}</p>
                <h1>{locale === "zh" ? "生成新图片" : "Create a new image"}</h1>
              </div>
              <span className={`status-pill ${isConfigured ? "is-ready" : ""}`}>
                {isConfigured ? t("providerReady") : t("missingKey")}
              </span>
            </div>
          )}

          <form
            className={`control-panel ${loading ? "is-busy" : ""} ${paramsOpen ? "is-params-open" : ""}`}
            onSubmit={(event) => void submit(event)}
            aria-busy={loading}
          >
            <div className="panel-heading">
              {activeView === "studio" && (
                <button className="text-button studio-back-button" type="button" disabled={loading} onClick={returnToGallery}>
                  <ChevronDown size={15} />
                  {locale === "zh" ? "返回图库" : "Gallery"}
                </button>
              )}
              <div>
                <p className="section-label">{t("create")}</p>
                <h1>{t("promptStudio")}</h1>
              </div>
              <div className="control-heading-actions">
                <button className="icon-button" type="button" title={locale === "zh" ? "清空输出" : "Clear output"} disabled={loading || (!selectedRecord && batchItems.length === 0)} onClick={clearOutputResult}>
                  <RefreshCw size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title={studioLayout === "controls-left"
                    ? (locale === "zh" ? "切换为输出在左" : "Move output left")
                    : (locale === "zh" ? "切换为控制台在左" : "Move console left")}
                  aria-pressed={studioLayout === "controls-right"}
                  onClick={toggleStudioLayout}
                >
                  <ArrowLeftRight size={18} />
                </button>
                <button className="icon-button" type="button" title={t("settings")} onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={18} />
                </button>
              </div>
            </div>

            <div className="mode-toggle full-width input-mode-toggle" aria-label={locale === "zh" ? "输入方式" : "Input mode"}>
              <button
                className={generationInputMode === "single" ? "is-active" : ""}
                type="button"
                disabled={loading}
                onClick={() => updateGenerationInputMode("single")}
              >
                {t("singleMode")}
              </button>
              <button
                className={generationInputMode === "batch" ? "is-active" : ""}
                type="button"
                disabled={loading}
                onClick={() => updateGenerationInputMode("batch")}
              >
                {t("batchMode")}
              </button>
            </div>

            <div className="mode-toggle full-width" aria-label={locale === "zh" ? "生成模式" : "Generation mode"}>
              <button
                className={mode === "text-to-image" ? "is-active" : ""}
                type="button"
                disabled={loading}
                onClick={() => updateMode("text-to-image")}
              >
                {t("textToImage")}
              </button>
              <button
                className={mode === "image-to-image" ? "is-active" : ""}
                type="button"
                disabled={loading || !canUseImageMode}
                onClick={() => updateMode("image-to-image")}
              >
                {t("imageToImage")}
              </button>
            </div>

            <div className="quick-bar">
              <div className="quick-control">
                <button
                  className={`quick-chip ${quickMenu === "model" ? "is-open" : ""}`}
                  type="button"
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "model" ? null : "model")}
                >
                  <span>{t("model")}</span>
                  <strong>{selectedModel?.label ?? model}</strong>
                  <ChevronDown size={15} />
                </button>
                {quickMenu === "model" && (
                  <div className="quick-menu quick-menu-model">
                    {providerModels.map((item) => (
                      <button
                        className={item.modelId === model ? "is-selected" : ""}
                        key={item.modelId}
                        type="button"
                        onClick={() => chooseModel(item.modelId)}
                      >
                        <span>{item.label}</span>
                        {item.modelId === model && <Check size={15} />}
                      </button>
                    ))}
                    <div className="quick-capabilities">
                      <span>{modelSupports(selectedModel, "text-to-image") ? t("textReady") : t("textOff")}</span>
                      <span>{canUseImageMode ? t("imageReady") : t("imageOff")}</span>
                      <span>{canContinueEdit ? t("continueReady") : t("continueOff")}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="quick-control spec-control">
                <button
                  className={`spec-select ${quickMenu === "aspect" ? "is-open" : ""}`}
                  type="button"
                  aria-label={t("aspectRatio")}
                  title={t("aspectRatio")}
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "aspect" ? null : "aspect")}
                >
                  <span>{t("aspectRatio")}</span>
                  <strong>{getAspectRatioLabel(aspectRatio)}</strong>
                  <ChevronDown size={16} />
                </button>
                {quickMenu === "aspect" && (
                  <div className="quick-menu spec-menu quick-menu-aspect">
                    {aspectRatioOptions.map((item) => (
                      <button
                        className={item === aspectRatio ? "is-selected" : ""}
                        key={item}
                        type="button"
                        onClick={() => chooseAspectRatio(item)}
                      >
                        <span>{getAspectRatioLabel(item)}</span>
                        {item === aspectRatio && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="quick-control spec-control">
                <button
                  className={`spec-select ${quickMenu === "resolution" ? "is-open" : ""}`}
                  type="button"
                  aria-label={t("resolution")}
                  title={t("resolution")}
                  disabled={loading}
                  onClick={() => setQuickMenu((current) => current === "resolution" ? null : "resolution")}
                >
                  <span>{t("resolution")}</span>
                  <strong>{getResolutionLabel(resolution, locale)}</strong>
                  <ChevronDown size={16} />
                </button>
                {quickMenu === "resolution" && (
                  <div className="quick-menu spec-menu quick-menu-resolution">
                    {resolutionOptions.map((item) => (
                      <button
                        className={item.value === resolution ? "is-selected" : ""}
                        key={item.value}
                        type="button"
                        onClick={() => chooseResolution(item.value)}
                      >
                        <span>{item.labels[locale]}</span>
                        {item.value === resolution && <Check size={15} />}
                      </button>
                    ))}
                    {!supportsCustomSize && (
                      <div className="quick-capabilities">
                        <span>{locale === "zh" ? "2K/4K 需要 OpenAI-compatible Base URL" : "2K/4K needs an OpenAI-compatible Base URL"}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedModel?.qualityOptions && selectedModel.qualityOptions.length > 1 && (
                <div className="quick-control">
                  <button
                    className={`quick-chip ${quickMenu === "quality" ? "is-open" : ""}`}
                    type="button"
                    disabled={loading}
                    onClick={() => setQuickMenu((current) => current === "quality" ? null : "quality")}
                  >
                    <span>{t("quality")}</span>
                    <strong>{quality}</strong>
                    <ChevronDown size={15} />
                  </button>
                  {quickMenu === "quality" && (
                    <div className="quick-menu quick-menu-quality">
                      {selectedModel.qualityOptions.map((item) => (
                        <button
                          className={item === quality ? "is-selected" : ""}
                          key={item}
                          type="button"
                          onClick={() => chooseQuality(item)}
                        >
                          <span>{item}</span>
                          {item === quality && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {mode === "image-to-image" && selectedModel?.inputFidelityOptions && (
                <div className="quick-control">
                  <button
                    className={`quick-chip ${quickMenu === "fidelity" ? "is-open" : ""}`}
                    type="button"
                    disabled={loading}
                    onClick={() => setQuickMenu((current) => current === "fidelity" ? null : "fidelity")}
                  >
                    <span>{t("fidelity")}</span>
                    <strong>{inputFidelity}</strong>
                    <ChevronDown size={15} />
                  </button>
                  {quickMenu === "fidelity" && (
                    <div className="quick-menu quick-menu-fidelity">
                      {selectedModel.inputFidelityOptions.map((item) => (
                        <button
                          className={item === inputFidelity ? "is-selected" : ""}
                          key={item}
                          type="button"
                          onClick={() => chooseInputFidelity(item)}
                        >
                          <span>{item}</span>
                          {item === inputFidelity && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <label className="prompt-field">
              <span>{generationInputMode === "batch" ? `${t("prompt")} / ${t("batchMode")}` : t("prompt")}</span>
              <textarea
                className={`textarea ${generationInputMode === "batch" ? "batch-textarea" : ""}`}
                data-testid="prompt-input"
                ref={promptRef}
                value={generationInputMode === "batch" ? batchPromptText : prompt}
                onChange={(event) => {
                  if (generationInputMode === "batch") {
                    setBatchPromptText(event.target.value);
                  } else {
                    setPrompt(event.target.value);
                  }
                }}
                placeholder={generationInputMode === "batch"
                  ? (mode === "text-to-image" ? t("batchPromptPlaceholderText") : t("batchPromptPlaceholderImage"))
                  : (mode === "text-to-image" ? t("promptPlaceholderText") : t("promptPlaceholderImage"))}
                disabled={loading}
              />
            </label>
            <div className="prompt-tools">
              <div className="prompt-tool-actions">
                <button
                  className="text-button tiny"
                  type="button"
                  disabled={loading || (generationInputMode === "batch" ? !batchPromptText : !prompt)}
                  onClick={() => {
                    if (generationInputMode === "batch") {
                      setBatchPromptText("");
                    } else {
                      setPrompt("");
                    }
                  }}
                >
                  {t("clear")}
                </button>
                {generationInputMode === "batch" && (
                  <button className="text-button tiny" type="button" disabled={loading} onClick={insertBatchPromptTemplate}>
                    <Sparkles size={14} />
                    {t("batchTemplate")}
                  </button>
                )}
                <button className="text-button tiny" type="button" disabled={loading} onClick={() => setTemplateOpen((current) => !current)}>
                  <Archive size={14} />
                  {locale === "zh" ? "模板库" : "Templates"}
                </button>
                <button className="text-button tiny" type="button" disabled={loading} onClick={() => void saveCurrentPromptAsTemplate()}>
                  <Save size={14} />
                  {locale === "zh" ? "保存模板" : "Save"}
                </button>
              </div>
              <span className={batchParseErrorKey || batchHasTooManyPrompts || batchHasTooLongPrompt ? "is-warning" : ""}>{batchPromptCounterLabel}</span>
            </div>

            {templateOpen && (
              <div className="template-panel">
                <div className="template-save-row">
                  <input
                    className="field"
                    value={templateTitle}
                    onChange={(event) => setTemplateTitle(event.target.value)}
                    placeholder={locale === "zh" ? "模板标题" : "Template title"}
                  />
                  <input
                    className="field"
                    value={templateCategory}
                    onChange={(event) => setTemplateCategory(event.target.value)}
                    placeholder={locale === "zh" ? "分类" : "Category"}
                  />
                  <select className="field" value={templateMode} onChange={(event) => setTemplateMode(event.target.value as PromptTemplateMode)}>
                    <option value="universal">{locale === "zh" ? "通用" : "Universal"}</option>
                    <option value="text-to-image">{t("textToImage")}</option>
                    <option value="image-to-image">{t("imageToImage")}</option>
                  </select>
                </div>
                <div className="template-list">
                  {visibleTemplates.length > 0 ? visibleTemplates.map((template) => (
                    <div className="template-row" key={template.id}>
                      <button className="template-row-main" type="button" onClick={() => applyPromptTemplate(template)}>
                        <strong>{template.title}</strong>
                        <span>{template.category} / {template.mode}</span>
                      </button>
                      <button
                        className="icon-button template-delete-button"
                        type="button"
                        title={locale === "zh" ? "删除模板" : "Delete template"}
                        aria-label={locale === "zh" ? "删除模板" : "Delete template"}
                        disabled={Boolean(deletingTemplateId)}
                        onClick={() => void deletePromptTemplate(template)}
                      >
                        {deletingTemplateId === template.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  )) : (
                    <p>{locale === "zh" ? "还没有模板。输入提示词后点击保存模板。" : "No templates yet. Enter a prompt and save it."}</p>
                  )}
                </div>
              </div>
            )}

            <button
              className={`text-button composer-drawer-toggle ${paramsOpen ? "is-open" : ""}`}
              type="button"
              aria-expanded={paramsOpen}
              onClick={() => setParamsOpen((current) => !current)}
            >
              <Settings2 size={16} />
              <span>{locale === "zh" ? "参数" : "Params"}</span>
              <strong>{getAspectRatioLabel(aspectRatio)} / {getResolutionLabel(resolution, locale)}</strong>
              <ChevronDown size={15} />
            </button>

            {(activeSourceRecords.length > 0 || files.length > 0) && (
              <div className="reference-strip" aria-label={locale === "zh" ? "参考图" : "Reference images"}>
                {activeSourceRecords.map((record) => (
                  <div className="reference-chip" key={record.id}>
                    <RawImage src={record.imageUrl} alt={t("imagePreview")} />
                    <span>{getModelLabel(catalog, record.provider, record.model)}</span>
                    <button className="icon-button" type="button" title={locale === "zh" ? "移除来源" : "Remove source"} onClick={() => clearSource(record.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {files.map((file, index) => (
                  <div className="reference-chip" key={`${file.name}:${file.lastModified}`}>
                    {filePreviewUrls[index] ? <RawImage src={filePreviewUrls[index]} alt={file.name} /> : <ImagePlus size={18} />}
                    <span>{file.name}</span>
                    <button className="icon-button" type="button" title={locale === "zh" ? "移除文件" : "Remove file"} onClick={() => removeFile(index)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="composer-actions">
              <div
                className={`drop-zone ${referenceDragging ? "is-dragging" : ""} ${loading || !canUseImageMode ? "is-disabled" : ""}`}
                onDragEnter={handleReferenceDrag}
                onDragOver={handleReferenceDrag}
                onDragLeave={() => setReferenceDragging(false)}
                onDrop={handleReferenceDrop}
              >
                <label className="upload-chip">
                  <Upload size={17} />
                  <span>{files.length > 0 ? `${files.length} ${locale === "zh" ? "张参考图" : `reference${files.length > 1 ? "s" : ""}`}` : t("addReference")}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => updateFiles(event.target.files)}
                    disabled={loading || !canUseImageMode}
                  />
                </label>
                <p>{t("dragImages")}</p>
              </div>

              <p className="hint">
                {loading ? t("requestSent") : activeStudioRunIsRunning ? t("backgroundRunning") : isConfigured ? t("ready") : t("missingKey")}
                {" / "}
                {activeStudioRunIsRunning
                  ? (batchRunning ? `${batchFinishedCount}/${batchItems.length}` : t("generatingSmall"))
                  : t("referencesEnabled")}
              </p>
            </div>

            {(loading || activeStudioRunIsRunning) && (pendingGeneration || batchRunning) && (
              <div className="composer-status" role="status">
                <Loader2 className="spin" size={17} />
                <span>
                  {batchRunning
                    ? `${t("generatingBatch")} ${batchFinishedCount}/${batchItems.length}`
                    : `${t("generatingWith")} ${pendingGeneration ? getProviderLabel(catalog, pendingGeneration.provider) : ""}`}
                </span>
                <strong>{batchRunning ? `${batchProgressPercent}% / ${batchElapsedLabel}` : `${elapsedSeconds}s`}</strong>
              </div>
            )}

            {activeStudioRunIsRunning && (
              <div className="background-run-panel" data-testid="background-run-panel" role="status">
                <div>
                  <Loader2 className="spin" size={16} />
                  <span>{t("backgroundRunning")}</span>
                  {runningBackgroundRuns.length > 0 && <strong>{runningBackgroundRuns.length}</strong>}
                </div>
                <div className="background-run-actions">
                  <button className="text-button tiny" type="button" onClick={keepActiveRunInStudio}>
                    <Check size={14} />
                    {t("stayInStudio")}
                  </button>
                  <button className="text-button tiny" data-testid="send-background-run" type="button" onClick={() => sendActiveRunToBackground()}>
                    <ArrowLeftRight size={14} />
                    {t("runInBackground")}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="alert">{error}</div>}

            <button className="primary-button generate-button" data-testid="generate-submit" type="submit" disabled={loading || !isConfigured}>
              {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {loading
                ? t("requestSent")
                : (generationInputMode === "batch" ? t("generateBatch") : t("generateImage"))}
            </button>
          </form>

          <section className="result-panel">
            <div className="panel-heading">
              <div>
                <p className="section-label">{t("result")}</p>
                <h2>{t("imageOutput")}</h2>
              </div>
              <span className={`status-pill ${isConfigured ? "is-ready" : ""}`}>
                {isConfigured ? t("providerReady") : t("missingKey")}
              </span>
            </div>

            {generationInputMode === "batch" && batchItems.length === 0 && !batchRunning ? (
              <div className="result-empty">
                <Sparkles size={36} />
                <h2>{t("batchOutput")}</h2>
                <p>{t("batchEmpty")}</p>
              </div>
            ) : batchItems.length > 0 && (generationInputMode === "batch" || batchRunning) ? (
              <div className={`result-stage batch-result-stage ${batchRunning ? "is-pending" : ""}`} aria-live="polite" aria-busy={batchRunning}>
                <div className="batch-result-summary">
                  <div>
                    <p className="section-label">{t("batchProgress")}</p>
                    <h2>{t("batchOutput")}</h2>
                  </div>
                  <div className="batch-result-actions">
                    {activeBatchId && (
                      <button className="text-button tiny" type="button" disabled={loading} onClick={() => void loadBatchDetail(activeBatchId, { showInStudio: true, pollActive: true })}>
                        <RefreshCw size={14} />
                        {locale === "zh" ? "刷新批次" : "Refresh batch"}
                      </button>
                    )}
                    {batchFailedCount > 0 && (
                      <button className="text-button tiny" type="button" disabled={loading} onClick={() => void retryFailedBatchItems()}>
                        <RefreshCw size={14} />
                        {t("batchRetryAllFailed")}
                      </button>
                    )}
                    <span className={`status-pill ${batchRunning ? "is-ready" : ""}`}>
                      {batchRunning ? `${batchFinishedCount}/${batchItems.length}` : batchPausedOnly ? t("batchPaused") : t("batchComplete")}
                    </span>
                  </div>
                </div>
                <div className="batch-progress-grid">
                  <div>
                    <strong>{batchSucceededCount}</strong>
                    <span>{t("batchSucceeded")}</span>
                  </div>
                  <div>
                    <strong>{batchFailedCount}</strong>
                    <span>{t("batchFailed")}</span>
                  </div>
                  <div>
                    <strong>{batchItems.length}</strong>
                    <span>{t("batchPrompts")}</span>
                  </div>
                  <div>
                    <strong>{batchElapsedLabel}</strong>
                    <span>{t("batchElapsed")}</span>
                  </div>
                </div>
                <div className="batch-progress-bar" aria-hidden="true">
                  <span style={{ width: `${batchProgressPercent}%` }} />
                </div>
                <div className="batch-result-list">
                  {batchItems.map((item) => {
                    const statusLabel = item.status === "queued"
                      ? t("batchQueued")
                      : item.status === "creating"
                        ? t("batchCreating")
                        : item.status === "pending"
                          ? t("batchPending")
                          : item.status === "paused"
                            ? t("batchPaused")
                            : item.status === "running"
                              ? t("batchRunning")
                              : item.status === "succeeded"
                                ? t("batchSucceeded")
                                : t("batchFailed");

                    return (
                      <div className={`batch-result-item is-${item.status}`} key={item.id}>
                        <div className="batch-result-thumb">
                          {item.imageUrl ? (
                            <RawImage src={item.imageUrl} alt={t("imagePreview")} />
                          ) : item.status === "failed" ? (
                            <X size={18} />
                          ) : item.status === "succeeded" ? (
                            <Check size={18} />
                          ) : item.status === "paused" ? (
                            <Pause size={18} />
                          ) : (
                            <Loader2 className={item.status === "queued" ? "" : "spin"} size={18} />
                          )}
                        </div>
                        <div className="batch-result-copy">
                          <div className="batch-result-line">
                            <strong>#{item.index + 1}</strong>
                            <span className="tag">{statusLabel}</span>
                            <span className="tag">{getModelLabel(catalog, item.provider, item.model)}</span>
                          </div>
                          <p>{item.prompt}</p>
                          {item.error && <small>{item.error}</small>}
                        </div>
                        <div className="batch-item-actions">
                          {isPausableImageJobStatus(item.status) && item.jobId && (
                            <button className="text-button tiny" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => void changeImageJobState(item.jobId!, "pause")}>
                              {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Pause size={14} />}
                              {t("batchPause")}
                            </button>
                          )}
                          {isResumableImageJobStatus(item.status) && item.jobId && (
                            <button className="text-button tiny" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => void changeImageJobState(item.jobId!, "resume")}>
                              {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                              {t("batchResume")}
                            </button>
                          )}
                          {isForceKillableImageJobStatus(item.status) && item.jobId && (
                            <button className="text-button tiny danger-button" type="button" disabled={Boolean(jobActionId || trackingJobId)} onClick={() => void changeImageJobState(item.jobId!, "kill")}>
                              {jobActionId === item.jobId ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                              {t("jobKill")}
                            </button>
                          )}
                          {isRetryableBatchItemStatus(item.status) && (
                            <button className="text-button tiny" type="button" disabled={loading} onClick={() => void retryBatchItem(item)}>
                              <RefreshCw size={14} />
                              {t("batchRetry")}
                            </button>
                          )}
                          {item.imageUrl && (
                            <a className="icon-button" title={t("open")} href={item.imageUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={16} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : pendingGeneration ? (
              <div className="result-stage is-pending" aria-live="polite" aria-busy="true">
                <div className="result-meta">
                  <span className="tag is-provider">{getProviderLabel(catalog, pendingGeneration.provider)}</span>
                  <span className="tag">{getModelLabel(catalog, pendingGeneration.provider, pendingGeneration.model)}</span>
                  <span className="tag is-live">{t("generating")} {elapsedSeconds}s</span>
                </div>
                <div className="generation-preview large">
                  <div className="generation-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="generation-center">
                    <Loader2 className="spin" size={26} />
                    <strong>{t("generatingImage")}</strong>
                    <span>{t("keepOpen")}</span>
                  </div>
                </div>
                <div className="generation-progress">
                  <span />
                </div>
                <details className="result-details">
                  <summary>
                    <span>{t("generationDetails")}</span>
                    <strong>{getGenerationDetailLabel(pendingGeneration)}</strong>
                    <ChevronDown size={16} />
                  </summary>
                  <p className="result-prompt">{pendingGeneration.prompt}</p>
                </details>
              </div>
            ) : selectedRecord ? (
              <div className="result-stage">
                <div className="result-meta">
                  <span className="tag is-provider">{getProviderLabel(catalog, selectedRecord.provider)}</span>
                  <span className="tag">{getModelLabel(catalog, selectedRecord.provider, selectedRecord.model)}</span>
                  <span className="tag">{selectedRecord.mode === "text-to-image" ? t("text") : t("imageInput")}</span>
                  <span className="tag">{formatDate(selectedRecord.createdAt)}</span>
                </div>
                <button className="hero-image-button" type="button" onClick={() => openLightbox(selectedRecord.id)} title={t("preview")}>
                  <RawImage className="hero-result-image" src={selectedRecord.imageUrl} alt={t("imagePreview")} />
                  <span>
                    <ExternalLink size={15} />
                    {t("preview")}
                  </span>
                </button>
                <div className="result-actions">
                  <button
                    className="text-button"
                    title={t("editThisImage")}
                    type="button"
                    disabled={!selectedRecordCanContinue}
                    onClick={() => startContinueEdit(selectedRecord)}
                  >
                    <ImagePlus size={17} />
                    {t("editThisImage")}
                  </button>
                  <button className="text-button" title={t("copyLink")} type="button" onClick={() => void copyImage(selectedRecord)}>
                    {copiedId === selectedRecord.id ? <Check size={17} /> : <Copy size={17} />}
                    {copiedId === selectedRecord.id ? t("copied") : t("copyLink")}
                  </button>
                  <a className="text-button" title={t("download")} href={selectedRecord.imageUrl} download>
                    <Download size={17} />
                    {t("download")}
                  </a>
                  <a className="text-button" title={t("open")} href={selectedRecord.imageUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={17} />
                    {t("open")}
                  </a>
                </div>
                <details className="result-details">
                  <summary>
                    <span>{t("generationDetails")}</span>
                    <strong>{getGenerationDetailLabel(selectedRecord)}</strong>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="result-detail-body">
                    <div className="result-detail-head">
                      <span>{t("promptUsed")}</span>
                      <button className="text-button tiny" type="button" onClick={() => void copyPromptText(selectedRecord)}>
                        {copiedPromptId === selectedRecord.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedPromptId === selectedRecord.id ? t("copied") : t("copyPrompt")}
                      </button>
                    </div>
                    <p className="result-prompt">{selectedRecord.prompt}</p>
                  </div>
                </details>
              </div>
            ) : (
              <div className="result-empty">
                <Sparkles size={36} />
                <h2>{t("noImageYet")}</h2>
                <p>{selectedModel?.description ?? t("emptyResult")}</p>
              </div>
            )}

          </section>

          <GalleryPanel
            catalog={catalog}
            batches={batches}
            projects={projects}
            records={filteredRecords}
            selectedRecordId={selectedRecordId}
            favoriteRecordIdSet={favoriteRecordIdSet}
            selectedHistoryIds={selectedHistoryIds}
            selectedHistoryIdSet={selectedHistoryIdSet}
            deletingHistoryIdSet={deletingHistoryIdSet}
            historyFilter={historyFilter}
            historyBatchFilter={historyBatchFilter}
            historyProjectFilter={historyProjectFilter}
            historyTagFilter={historyTagFilter}
            historySearch={historySearch}
            favoriteOnly={favoriteOnly}
            historyFiltersOpen={historyFiltersOpen}
            historyFiltersActive={historyFiltersActive}
            historyNextCursor={historyNextCursor}
            historyLoading={historyLoading}
            newProjectName={newProjectName}
            assignProjectId={assignProjectId}
            assignTagsText={assignTagsText}
            copiedId={copiedId}
            labels={getGalleryLabels(locale, t)}
            getAspectRatioLabel={getAspectRatioLabel}
            canContinueRecord={canContinueRecord}
            onOpenGenerationStudio={openGenerationStudio}
            onToggleFavoriteOnly={() => setFavoriteOnly((current) => !current)}
            onHistorySearchChange={setHistorySearch}
            onHistoryProviderChange={(nextProvider) => setHistoryFilter((current) => ({ ...current, provider: nextProvider, model: "all" }))}
            onHistoryModelChange={(nextModel) => setHistoryFilter((current) => ({ ...current, model: nextModel }))}
            onHistoryBatchFilterChange={setHistoryBatchFilter}
            onHistoryProjectFilterChange={setHistoryProjectFilter}
            onHistoryTagFilterChange={setHistoryTagFilter}
            onToggleHistoryFilters={() => setHistoryFiltersOpen((current) => !current)}
            onResetFilters={() => {
              setHistorySearch("");
              setFavoriteOnly(false);
              setHistoryFilter({ provider: "all", model: "all" });
              setHistoryBatchFilter("all");
              setHistoryProjectFilter("all");
              setHistoryTagFilter("");
            }}
            onClearSelection={() => setSelectedHistoryIds([])}
            onNewProjectNameChange={setNewProjectName}
            onCreateProject={() => void createProject()}
            onAssignProjectIdChange={setAssignProjectId}
            onAssignTagsTextChange={setAssignTagsText}
            onAssignSelectedImages={() => void assignSelectedImages()}
            onSelectAllVisibleHistory={selectAllVisibleHistory}
            onCopySelectedImageLinks={() => void copySelectedImageLinks()}
            onDownloadSelectedImages={downloadSelectedImages}
            onExportSelectedImagesZip={() => void exportSelectedImagesZip()}
            onDeleteHistoryImages={(ids) => void deleteHistoryImages(ids)}
            onToggleHistorySelection={toggleHistorySelection}
            onOpenRecord={(recordId) => {
              setSelectedRecordId(recordId);
              openLightbox(recordId);
            }}
            onToggleFavoriteRecord={toggleFavoriteRecord}
            onStartContinueEdit={startContinueEdit}
            onCopyImage={(record) => void copyImage(record)}
            onLoadHistoryPage={() => void loadHistoryPage()}
          />
        </section>
      </main>

      {lightboxRecord && (
        <StudioLightbox
          record={lightboxRecord}
          mode={lightboxMode}
          isDragging={lightboxDragging}
          stageRef={lightboxInspectorStageRef}
          zoomLabel={lightboxZoomLabel}
          inspectorMeta={lightboxInspectorMeta}
          scale={lightboxScale}
          offset={lightboxOffset}
          providerLabel={getProviderLabel(catalog, lightboxRecord.provider)}
          modelLabel={getModelLabel(catalog, lightboxRecord.provider, lightboxRecord.model)}
          detailLabel={getGenerationDetailLabel(lightboxRecord)}
          copiedPrompt={copiedPromptId === lightboxRecord.id}
          labels={{
            imagePreview: t("imagePreview"),
            closePreview: t("closePreview"),
            download: t("download"),
            preview: t("preview"),
            promptUsed: t("promptUsed"),
            copied: t("copied"),
            copyPrompt: t("copyPrompt"),
            zoomOut: locale === "zh" ? "\u7f29\u5c0f" : "Zoom out",
            resetZoom: locale === "zh" ? "\u91cd\u7f6e\u7f29\u653e" : "Reset zoom",
            zoomIn: locale === "zh" ? "\u653e\u5927" : "Zoom in"
          }}
          onClose={closeLightbox}
          onEnterInspector={enterLightboxInspector}
          onLeaveInspector={leaveLightboxInspector}
          onResetZoom={resetLightboxTransform}
          onZoomOut={() => updateLightboxScale(lightboxScale / LIGHTBOX_BUTTON_ZOOM_STEP)}
          onZoomIn={() => updateLightboxScale(lightboxScale * LIGHTBOX_BUTTON_ZOOM_STEP)}
          onCopyPrompt={() => void copyPromptText(lightboxRecord)}
          onImageLoad={handleLightboxImageLoad}
          onPointerDown={handleLightboxPointerDown}
          onPointerMove={handleLightboxPointerMove}
          onPointerEnd={handleLightboxPointerEnd}
        />
      )}
    </div>
  );
}
