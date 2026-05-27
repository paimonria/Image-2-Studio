import { useEffect, useRef } from "react";
import type { CatalogResponse, ImageRecord, PublicUser } from "@/lib/types";
import type { ImageMode } from "@/lib/models";
import type { Locale } from "@/components/studio/utils/copy";
import {
  STUDIO_LAYOUT_STORAGE_KEY,
  getResolutionSelection,
  type QuickMenu,
  type StudioLayout
} from "@/components/studio/utils/generation-options";
import { resolveModelDefaultSelection } from "@/components/studio/utils/model-defaults";

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
  const lastAppliedModelDefaultsRef = useRef<string | null>(null);

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
    const selection = getResolutionSelection({
      supportsCustomSize,
      resolution,
      locale
    });
    if (selection.resolution === resolution) return;

    setResolution(selection.resolution);
    setQuickMenu((current) => current === "resolution" ? null : current);
    setError(selection.error);
  }, [catalog, currentUser, locale, resolution, selectedModel, setError, setQuickMenu, setResolution, supportsCustomSize]);

  useEffect(() => {
    const selection = resolveModelDefaultSelection({
      providerModels,
      model,
      lastAppliedModelKey: lastAppliedModelDefaultsRef.current,
      supportsCustomSize
    });
    if (!selection) return;

    if (selection.shouldSwitchModel) {
      setModel(selection.model.modelId);
    }

    if (selection.shouldApplyDefaults) {
      setAspectRatio(selection.defaultAspectRatio);
      setResolution(selection.defaultResolution);
      setQuality(selection.defaultQuality);
      setInputFidelity(selection.defaultInputFidelity);
      lastAppliedModelDefaultsRef.current = selection.modelKey;
    }

    if (selection.shouldClearImageMode) {
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

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeQuickMenu);
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
