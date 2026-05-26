import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateBatchGenerationInput,
  validateSingleGenerationInput
} from "../src/components/studio/utils/generation-validation";
import {
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH
} from "../src/components/studio/utils/generation-options";

const baseInput = {
  hasSelectedModel: true,
  isConfigured: true,
  mode: "text-to-image" as const,
  referenceCount: 0
};

describe("generation input validation", () => {
  it("asks users to select a model before validating other single-image fields", () => {
    const result = validateSingleGenerationInput({
      ...baseInput,
      hasSelectedModel: false,
      isConfigured: false,
      prompt: ""
    });

    assert.deepEqual(result, {
      ok: false,
      errorKey: "chooseModelFirst",
      openSettings: true
    });
  });

  it("requires a configured provider before accepting prompts", () => {
    const result = validateSingleGenerationInput({
      ...baseInput,
      isConfigured: false,
      prompt: "A product image"
    });

    assert.deepEqual(result, {
      ok: false,
      errorKey: "providerNoKey",
      openSettings: true
    });
  });

  it("normalizes valid single-image prompts", () => {
    const result = validateSingleGenerationInput({
      ...baseInput,
      prompt: "  A product image  "
    });

    assert.deepEqual(result, {
      ok: true,
      prompt: "A product image"
    });
  });

  it("rejects empty, oversized, and reference-less single-image prompts", () => {
    assert.deepEqual(validateSingleGenerationInput({
      ...baseInput,
      prompt: "   "
    }), {
      ok: false,
      errorKey: "enterPrompt"
    });

    assert.deepEqual(validateSingleGenerationInput({
      ...baseInput,
      prompt: "x".repeat(MAX_PROMPT_LENGTH + 1)
    }), {
      ok: false,
      errorKey: "batchPromptTooLong"
    });

    assert.deepEqual(validateSingleGenerationInput({
      ...baseInput,
      mode: "image-to-image",
      referenceCount: 0,
      prompt: "Restyle this image"
    }), {
      ok: false,
      errorKey: "imageNeedsReference"
    });
  });

  it("preserves batch parser errors before count checks", () => {
    const result = validateBatchGenerationInput({
      ...baseInput,
      batchParseErrorKey: "batchFormatIncomplete",
      prompts: Array.from({ length: MAX_BATCH_PROMPTS + 1 }, (_, index) => `Prompt ${index}`)
    });

    assert.deepEqual(result, {
      ok: false,
      errorKey: "batchFormatIncomplete"
    });
  });

  it("rejects empty, oversized, and reference-less batch prompts", () => {
    assert.deepEqual(validateBatchGenerationInput({
      ...baseInput,
      prompts: []
    }), {
      ok: false,
      errorKey: "enterPrompt"
    });

    assert.deepEqual(validateBatchGenerationInput({
      ...baseInput,
      prompts: Array.from({ length: MAX_BATCH_PROMPTS + 1 }, (_, index) => `Prompt ${index}`)
    }), {
      ok: false,
      errorKey: "batchTooManyPrompts"
    });

    assert.deepEqual(validateBatchGenerationInput({
      ...baseInput,
      prompts: ["x".repeat(MAX_PROMPT_LENGTH + 1)]
    }), {
      ok: false,
      errorKey: "batchPromptTooLong"
    });

    assert.deepEqual(validateBatchGenerationInput({
      ...baseInput,
      mode: "image-to-image",
      referenceCount: 0,
      prompts: ["Restyle this image"]
    }), {
      ok: false,
      errorKey: "imageNeedsReference"
    });
  });

  it("accepts valid batch prompts", () => {
    const prompts = ["First image", "Second image"];

    assert.deepEqual(validateBatchGenerationInput({
      ...baseInput,
      prompts
    }), {
      ok: true,
      prompts
    });
  });
});
