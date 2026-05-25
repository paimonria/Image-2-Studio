import { useEffect } from "react";
import type { CatalogResponse, ImageRecord, PublicUser } from "@/lib/types";
import type { ImageMode } from "@/lib/models";
import type { Locale } from "@/components/studio/utils/copy";
import {
  DEFAULT_RESOLUTION,
  OFFICIAL_OPENAI_RESOLUTION,
  STUDIO_LAYOUT_STORAGE_KEY,
  modelSupports,
  type QuickMenu,
  type StudioLayout
} from "@/components/studio/utils/generation-options";

type Setter<T> = (value: T | ((current: T) => T)) => void;

type UseStudioEffectsOptions = {
  currentUser: PublicUser | null;
  locale: Locale;
  catalog: CatalogResponse | null;
  selectedModel: CatalogResponse["models"][number] | undefined;
  providerModels: CatalogResponse["models"];
  model: string;
  supportsCustomSize: boolean;
  resolution: string;
  quickMenu: QuickMenu;
  settingsOpen: boolean;
  providerSettingsLoaded: boolean;
  favoritesLoaded: boolean;
  favoriteRecordIds: string[];
  files: File[];
  filteredRecords: ImageRecord[];
  t: (key: string) => string;
  loadCatalog: () => Promise<void>;
  loadHistory: () => Promise<unknown>;
  loadWorkspaceMeta: () => Promise<void>;
  loadProviderSettings: () => Promise<void>;
  setStudioLayout: Setter<StudioLayout>;
  setError: Setter<string>;
  setSettingsMessage: Setter<string>;
  setResolution: Setter<string>;
  setQuickMenu: Setter<QuickMenu>;
  setModel: Setter<string>;
  setAspectRatio: Setter<string>;
  setQuality: Setter<string>;
  setInputFidelity: Setter<string>;
  setMode: Setter<ImageMode>;
  setSourceImageIds: Setter<string[]>;
  setFavoriteRecordIds: Setter<string[]>;
  setFavoritesLoaded: Setter<boolean>;
  setFilePreviewUrls: Setter<string[]>;
  setSelectedHistoryIds: Setter<string[]>;
};

export function useStudioEffects({
  currentUser,
  locale,
  catalog,
  selectedModel,
  providerModels,
  model,
  supportsCustomSize,
  resolution,
  quickMenu,
  settingsOpen,
  providerSettingsLoaded,
  favoritesLoaded,
  favoriteRecordIds,
  files,
  filteredRecords,
  t,
  loadCatalog,
  loadHistory,
  loadWorkspaceMeta,
  loadProviderSettings,
  setStudioLayout,
  setError,
  setSettingsMessage,
  setResolution,
  setQuickMenu,
  setModel,
  setAspectRatio,
  setQuality,
  setInputFidelity,
  setMode,
  setSourceImageIds,
  setFavoriteRecordIds,
  setFavoritesLoaded,
  setFilePreviewUrls,
  setSelectedHistoryIds
}: UseStudioEffectsOptions) {
  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(STUDIO_LAYOUT_STORAGE_KEY);
      if (savedLayout === "controls-left" || savedLayout === "controls-right") {
        setStudioLayout(savedLayout);
      }
    } catch {
      // Layout preference is cosmetic; ignore storage failures.
    }
  }, [setStudioLayout]);

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
  }, [catalog, currentUser, locale, resolution, selectedModel, setError, setQuickMenu, setResolution, supportsCustomSize]);

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
  }, [model, providerModels, setAspectRatio, setInputFidelity, setMode, setModel, setQuality, setResolution, setSourceImageIds, supportsCustomSize]);

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
  }, [quickMenu, setQuickMenu]);

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
  }, [setFavoriteRecordIds, setFavoritesLoaded]);

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
  }, [files, setFilePreviewUrls]);

  useEffect(() => {
    const visibleIds = new Set(filteredRecords.map((record) => record.id));
    setSelectedHistoryIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredRecords, setSelectedHistoryIds]);
}
