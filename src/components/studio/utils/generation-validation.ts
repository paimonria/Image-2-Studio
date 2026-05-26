import type { ImageMode } from "@/lib/models";
import {
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH
} from "./generation-options";

export type GenerationValidationErrorKey =
  | "chooseModelFirst"
  | "providerNoKey"
  | "enterPrompt"
  | "batchPromptTooLong"
  | "imageNeedsReference"
  | "batchTooManyPrompts"
  | string;

type BaseGenerationValidationInput = {
  hasSelectedModel: boolean;
  isConfigured: boolean;
  mode: ImageMode;
  referenceCount: number;
};

export type GenerationValidationFailure = {
  ok: false;
  errorKey: GenerationValidationErrorKey;
  openSettings?: boolean;
};

export type SingleGenerationValidationSuccess = {
  ok: true;
  prompt: string;
};

export type BatchGenerationValidationSuccess = {
  ok: true;
  prompts: string[];
};

export function validateSingleGenerationInput(
  input: BaseGenerationValidationInput & { prompt: string }
): SingleGenerationValidationSuccess | GenerationValidationFailure {
  const baseError = validateBaseGenerationInput(input);
  if (baseError) return baseError;

  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, errorKey: "enterPrompt" };
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, errorKey: "batchPromptTooLong" };
  }

  const referenceError = validateReferenceInput(input);
  if (referenceError) return referenceError;

  return { ok: true, prompt };
}

export function validateBatchGenerationInput(
  input: BaseGenerationValidationInput & {
    batchParseErrorKey?: string;
    prompts: string[];
  }
): BatchGenerationValidationSuccess | GenerationValidationFailure {
  const baseError = validateBaseGenerationInput(input);
  if (baseError) return baseError;

  if (input.batchParseErrorKey) {
    return { ok: false, errorKey: input.batchParseErrorKey };
  }

  if (input.prompts.length === 0) {
    return { ok: false, errorKey: "enterPrompt" };
  }

  if (input.prompts.length > MAX_BATCH_PROMPTS) {
    return { ok: false, errorKey: "batchTooManyPrompts" };
  }

  if (input.prompts.some((item) => item.length > MAX_PROMPT_LENGTH)) {
    return { ok: false, errorKey: "batchPromptTooLong" };
  }

  const referenceError = validateReferenceInput(input);
  if (referenceError) return referenceError;

  return { ok: true, prompts: input.prompts };
}

function validateBaseGenerationInput(input: BaseGenerationValidationInput): GenerationValidationFailure | null {
  if (!input.hasSelectedModel) {
    return {
      ok: false,
      errorKey: "chooseModelFirst",
      openSettings: true
    };
  }

  if (!input.isConfigured) {
    return {
      ok: false,
      errorKey: "providerNoKey",
      openSettings: true
    };
  }

  return null;
}

function validateReferenceInput(input: BaseGenerationValidationInput): GenerationValidationFailure | null {
  if (input.mode === "image-to-image" && input.referenceCount === 0) {
    return { ok: false, errorKey: "imageNeedsReference" };
  }

  return null;
}
