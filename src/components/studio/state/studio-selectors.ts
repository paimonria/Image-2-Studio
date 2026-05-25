import type { StudioState } from "./studio-state";

export function selectStudioLocale(state: StudioState) {
  return state.locale;
}

export function selectGenerationParameters(state: StudioState) {
  return {
    provider: state.provider,
    model: state.model,
    mode: state.mode,
    prompt: state.prompt,
    generationInputMode: state.generationInputMode,
    batchPromptText: state.batchPromptText,
    aspectRatio: state.aspectRatio,
    resolution: state.resolution,
    quality: state.quality,
    inputFidelity: state.inputFidelity
  };
}
