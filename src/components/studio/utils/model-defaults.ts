import type { CatalogResponse } from "@/lib/types";
import {
  DEFAULT_RESOLUTION,
  OFFICIAL_OPENAI_RESOLUTION,
  modelSupports
} from "./generation-options";

type CatalogModel = CatalogResponse["models"][number];

export type ModelDefaultSelection = {
  model: CatalogModel;
  modelKey: string;
  shouldSwitchModel: boolean;
  shouldApplyDefaults: boolean;
  defaultAspectRatio: string;
  defaultResolution: string;
  defaultQuality: string;
  defaultInputFidelity: string;
  shouldClearImageMode: boolean;
};

export function getModelDefaultsKey(model: Pick<CatalogModel, "provider" | "modelId">) {
  return `${model.provider}:${model.modelId}`;
}

export function resolveModelDefaultSelection(input: {
  providerModels: CatalogResponse["models"];
  model: string;
  lastAppliedModelKey: string | null;
  supportsCustomSize: boolean;
}): ModelDefaultSelection | null {
  const nextModel = input.providerModels.find((item) => item.modelId === input.model) ?? input.providerModels[0];
  if (!nextModel) return null;

  const modelKey = getModelDefaultsKey(nextModel);
  const shouldSwitchModel = nextModel.modelId !== input.model;

  return {
    model: nextModel,
    modelKey,
    shouldSwitchModel,
    shouldApplyDefaults: shouldSwitchModel || input.lastAppliedModelKey !== modelKey,
    defaultAspectRatio: nextModel.defaultAspectRatio ?? "3:4",
    defaultResolution: input.supportsCustomSize ? DEFAULT_RESOLUTION : OFFICIAL_OPENAI_RESOLUTION,
    defaultQuality: nextModel.defaultQuality ?? "medium",
    defaultInputFidelity: nextModel.inputFidelityOptions?.[0] ?? "high",
    shouldClearImageMode: !modelSupports(nextModel, "image-to-image")
  };
}
