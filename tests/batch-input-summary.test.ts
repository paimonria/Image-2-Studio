import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATCH_PROMPT_END,
  BATCH_PROMPT_START
} from "../src/components/studio/utils/batch-prompts";
import { getBatchInputSummary } from "../src/components/studio/utils/batch-input-summary";
import {
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH
} from "../src/components/studio/utils/generation-options";

const t = (key: string) => key === "batchPrompts" ? "prompts" : `translated:${key}`;

describe("batch input summary", () => {
  it("summarizes line-based batch prompts", () => {
    const summary = getBatchInputSummary({
      batchPromptText: " first image \n\n second image ",
      generationInputMode: "batch",
      prompt: "",
      t
    });

    assert.deepEqual(summary, {
      prompts: ["first image", "second image"],
      parseErrorKey: undefined,
      hasTooManyPrompts: false,
      hasTooLongPrompt: false,
      counterLabel: "2/20 prompts"
    });
  });

  it("uses translated parser errors as the counter label", () => {
    const summary = getBatchInputSummary({
      batchPromptText: `${BATCH_PROMPT_START}\nMissing end marker`,
      generationInputMode: "batch",
      prompt: "",
      t
    });

    assert.equal(summary.parseErrorKey, "batchFormatIncomplete");
    assert.equal(summary.counterLabel, "translated:batchFormatIncomplete");
  });

  it("marks oversized batch input", () => {
    const tooMany = getBatchInputSummary({
      batchPromptText: Array.from({ length: MAX_BATCH_PROMPTS + 1 }, (_, index) => `Prompt ${index}`).join("\n"),
      generationInputMode: "batch",
      prompt: "",
      t
    });

    assert.equal(tooMany.hasTooManyPrompts, true);
    assert.equal(tooMany.hasTooLongPrompt, false);

    const tooLong = getBatchInputSummary({
      batchPromptText: "x".repeat(MAX_PROMPT_LENGTH + 1),
      generationInputMode: "batch",
      prompt: "",
      t
    });

    assert.equal(tooLong.hasTooManyPrompts, false);
    assert.equal(tooLong.hasTooLongPrompt, true);
  });

  it("uses the single prompt length when single mode is active", () => {
    const summary = getBatchInputSummary({
      batchPromptText: `${BATCH_PROMPT_START}\nIgnored batch prompt\n${BATCH_PROMPT_END}`,
      generationInputMode: "single",
      prompt: "A short prompt",
      t
    });

    assert.equal(summary.counterLabel, `14/${MAX_PROMPT_LENGTH}`);
  });
});
