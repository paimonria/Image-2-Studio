import type { CatalogResponse } from "../../../lib/types";
import {
  getComputedImageSize,
  modelSupports,
  RESOLUTION_OPTIONS
} from "./generation-options";

type ProviderModelContextInput = {
  catalog: CatalogResponse | null;
  provider: string;
  model: string;
  aspectRatio: string;
  resolution: string;
};

export type ProviderModelContext = {
  providerStatus: CatalogResponse["providers"][number] | undefined;
  providerModels: CatalogResponse["models"];
  selectedModel: CatalogResponse["models"][number] | undefined;
  canUseImageMode: boolean;
  canContinueEdit: boolean;
  isConfigured: boolean;
  supportsCustomSize: boolean;
  resolutionOptions: ReadonlyArray<(typeof RESOLUTION_OPTIONS)[number]>;
  computedSize: string;
  aspectRatioOptions: string[];
};

export function getProviderModelContext(input: ProviderModelContextInput): ProviderModelContext {
  const providerStatus = input.catalog?.providers.find((item) => item.provider === input.provider);
  const providerModels = input.catalog?.models.filter((item) => item.provider === input.provider) ?? [];
  const selectedModel = providerModels.find((item) => item.modelId === input.model);
  const supportsCustomSize = Boolean(providerStatus?.supportsCustomSize);

  return {
    providerStatus,
    providerModels,
    selectedModel,
    canUseImageMode: modelSupports(selectedModel, "image-to-image"),
    canContinueEdit: modelSupports(selectedModel, "continue-edit"),
    isConfigured: Boolean(providerStatus?.configured),
    supportsCustomSize,
    resolutionOptions: supportsCustomSize ? RESOLUTION_OPTIONS : RESOLUTION_OPTIONS.slice(0, 1),
    computedSize: getComputedImageSize(input.aspectRatio, input.resolution, supportsCustomSize),
    aspectRatioOptions: selectedModel?.supportedAspectRatios ?? ["auto", "1:1", "3:4", "4:3", "9:16", "16:9"]
  };
}
