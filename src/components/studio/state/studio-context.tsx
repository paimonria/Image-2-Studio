"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useMemo,
  useReducer
} from "react";
import type { ImageMode, ProviderId } from "@/lib/models";
import type { Locale } from "@/components/studio/utils/copy";
import type { GenerationInputMode, QuickMenu, StudioLayout, StudioView } from "@/components/studio/utils/generation-options";
import { createInitialStudioState, type HistoryFilter, type PromptTemplateMode, type StudioState } from "./studio-state";
import { studioReducer } from "./studio-reducer";

type StateSetter<K extends keyof StudioState> = Dispatch<SetStateAction<StudioState[K]>>;

export type StudioActions = {
  setSelectedRecordId: StateSetter<"selectedRecordId">;
  setActiveView: StateSetter<"activeView">;
  setStudioLayout: StateSetter<"studioLayout">;
  setProvider: StateSetter<"provider">;
  setModel: StateSetter<"model">;
  setMode: StateSetter<"mode">;
  setPrompt: StateSetter<"prompt">;
  setGenerationInputMode: StateSetter<"generationInputMode">;
  setBatchPromptText: StateSetter<"batchPromptText">;
  setJobMonitorOpen: StateSetter<"jobMonitorOpen">;
  setTopbarMenuOpen: StateSetter<"topbarMenuOpen">;
  setAspectRatio: StateSetter<"aspectRatio">;
  setResolution: StateSetter<"resolution">;
  setQuality: StateSetter<"quality">;
  setInputFidelity: StateSetter<"inputFidelity">;
  setFiles: StateSetter<"files">;
  setSourceImageIds: StateSetter<"sourceImageIds">;
  setHistoryFilter: StateSetter<"historyFilter">;
  setHistoryBatchFilter: StateSetter<"historyBatchFilter">;
  setHistoryProjectFilter: StateSetter<"historyProjectFilter">;
  setHistoryTagFilter: StateSetter<"historyTagFilter">;
  setHistorySearch: StateSetter<"historySearch">;
  setFavoriteOnly: StateSetter<"favoriteOnly">;
  setFavoriteRecordIds: StateSetter<"favoriteRecordIds">;
  setSelectedHistoryIds: StateSetter<"selectedHistoryIds">;
  setDeletingHistoryIds: StateSetter<"deletingHistoryIds">;
  setFavoritesLoaded: StateSetter<"favoritesLoaded">;
  setFilePreviewUrls: StateSetter<"filePreviewUrls">;
  setSettingsOpen: StateSetter<"settingsOpen">;
  setAdminOpen: StateSetter<"adminOpen">;
  setParamsOpen: StateSetter<"paramsOpen">;
  setHistoryFiltersOpen: StateSetter<"historyFiltersOpen">;
  setQuickMenu: StateSetter<"quickMenu">;
  setLoading: StateSetter<"loading">;
  setReferenceDragging: StateSetter<"referenceDragging">;
  setLocale: StateSetter<"locale">;
  setError: StateSetter<"error">;
  setCopiedId: StateSetter<"copiedId">;
  setCopiedPromptId: StateSetter<"copiedPromptId">;
  setNewProjectName: StateSetter<"newProjectName">;
  setAssignProjectId: StateSetter<"assignProjectId">;
  setAssignTagsText: StateSetter<"assignTagsText">;
  setTemplateTitle: StateSetter<"templateTitle">;
  setTemplateCategory: StateSetter<"templateCategory">;
  setTemplateMode: StateSetter<"templateMode">;
  setTemplateOpen: StateSetter<"templateOpen">;
  setDeletingTemplateId: StateSetter<"deletingTemplateId">;
  patchStudioState: (values: Partial<StudioState>) => void;
};

type StudioContextValue = {
  state: StudioState;
  actions: StudioActions;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function createStateSetter<K extends keyof StudioState>(
  key: K,
  dispatch: Dispatch<import("./studio-reducer").StudioAction>
): StateSetter<K> {
  return (value) => {
    dispatch({
      type: "set",
      key,
      value: value as StudioState[keyof StudioState]
    });
  };
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(studioReducer, undefined, createInitialStudioState);

  const actions = useMemo<StudioActions>(() => ({
    setSelectedRecordId: createStateSetter("selectedRecordId", dispatch),
    setActiveView: createStateSetter("activeView", dispatch),
    setStudioLayout: createStateSetter("studioLayout", dispatch),
    setProvider: createStateSetter("provider", dispatch),
    setModel: createStateSetter("model", dispatch),
    setMode: createStateSetter("mode", dispatch),
    setPrompt: createStateSetter("prompt", dispatch),
    setGenerationInputMode: createStateSetter("generationInputMode", dispatch),
    setBatchPromptText: createStateSetter("batchPromptText", dispatch),
    setJobMonitorOpen: createStateSetter("jobMonitorOpen", dispatch),
    setTopbarMenuOpen: createStateSetter("topbarMenuOpen", dispatch),
    setAspectRatio: createStateSetter("aspectRatio", dispatch),
    setResolution: createStateSetter("resolution", dispatch),
    setQuality: createStateSetter("quality", dispatch),
    setInputFidelity: createStateSetter("inputFidelity", dispatch),
    setFiles: createStateSetter("files", dispatch),
    setSourceImageIds: createStateSetter("sourceImageIds", dispatch),
    setHistoryFilter: createStateSetter("historyFilter", dispatch),
    setHistoryBatchFilter: createStateSetter("historyBatchFilter", dispatch),
    setHistoryProjectFilter: createStateSetter("historyProjectFilter", dispatch),
    setHistoryTagFilter: createStateSetter("historyTagFilter", dispatch),
    setHistorySearch: createStateSetter("historySearch", dispatch),
    setFavoriteOnly: createStateSetter("favoriteOnly", dispatch),
    setFavoriteRecordIds: createStateSetter("favoriteRecordIds", dispatch),
    setSelectedHistoryIds: createStateSetter("selectedHistoryIds", dispatch),
    setDeletingHistoryIds: createStateSetter("deletingHistoryIds", dispatch),
    setFavoritesLoaded: createStateSetter("favoritesLoaded", dispatch),
    setFilePreviewUrls: createStateSetter("filePreviewUrls", dispatch),
    setSettingsOpen: createStateSetter("settingsOpen", dispatch),
    setAdminOpen: createStateSetter("adminOpen", dispatch),
    setParamsOpen: createStateSetter("paramsOpen", dispatch),
    setHistoryFiltersOpen: createStateSetter("historyFiltersOpen", dispatch),
    setQuickMenu: createStateSetter("quickMenu", dispatch),
    setLoading: createStateSetter("loading", dispatch),
    setReferenceDragging: createStateSetter("referenceDragging", dispatch),
    setLocale: createStateSetter("locale", dispatch),
    setError: createStateSetter("error", dispatch),
    setCopiedId: createStateSetter("copiedId", dispatch),
    setCopiedPromptId: createStateSetter("copiedPromptId", dispatch),
    setNewProjectName: createStateSetter("newProjectName", dispatch),
    setAssignProjectId: createStateSetter("assignProjectId", dispatch),
    setAssignTagsText: createStateSetter("assignTagsText", dispatch),
    setTemplateTitle: createStateSetter("templateTitle", dispatch),
    setTemplateCategory: createStateSetter("templateCategory", dispatch),
    setTemplateMode: createStateSetter("templateMode", dispatch),
    setTemplateOpen: createStateSetter("templateOpen", dispatch),
    setDeletingTemplateId: createStateSetter("deletingTemplateId", dispatch),
    patchStudioState: (values) => dispatch({ type: "patch", values })
  }), []);

  const value = useMemo(() => ({ state, actions }), [actions, state]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudioState() {
  const value = useContext(StudioContext);
  if (!value) {
    throw new Error("useStudioState must be used within StudioProvider");
  }

  return value;
}

export type {
  GenerationInputMode,
  HistoryFilter,
  ImageMode,
  Locale,
  PromptTemplateMode,
  ProviderId,
  QuickMenu,
  StudioLayout,
  StudioView
};
