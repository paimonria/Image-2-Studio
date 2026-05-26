import { parseBatchPrompts } from "./batch-prompts";
import {
  MAX_BATCH_PROMPTS,
  MAX_PROMPT_LENGTH,
  type GenerationInputMode
} from "./generation-options";

type BatchInputSummaryInput = {
  batchPromptText: string;
  generationInputMode: GenerationInputMode;
  prompt: string;
  t: (key: string) => string;
};

export type BatchInputSummary = {
  prompts: string[];
  parseErrorKey?: string;
  hasTooManyPrompts: boolean;
  hasTooLongPrompt: boolean;
  counterLabel: string;
};

export function getBatchInputSummary(input: BatchInputSummaryInput): BatchInputSummary {
  const parsed = parseBatchPrompts(input.batchPromptText);
  const hasTooManyPrompts = parsed.prompts.length > MAX_BATCH_PROMPTS;
  const hasTooLongPrompt = parsed.prompts.some((item) => item.length > MAX_PROMPT_LENGTH);

  return {
    prompts: parsed.prompts,
    parseErrorKey: parsed.errorKey,
    hasTooManyPrompts,
    hasTooLongPrompt,
    counterLabel: input.generationInputMode === "batch"
      ? (parsed.errorKey ? input.t(parsed.errorKey) : `${parsed.prompts.length}/${MAX_BATCH_PROMPTS} ${input.t("batchPrompts")}`)
      : `${input.prompt.length}/${MAX_PROMPT_LENGTH}`
  };
}
