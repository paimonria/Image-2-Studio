export const BATCH_START_MAX_PROMPTS = 20;
export const BATCH_START_MAX_PROMPT_LENGTH = 2000;

export type BatchStartPromptParseError = "empty" | "too-many" | "too-long";

export function parseBatchStartPrompts(values: unknown[], options: {
  maxPrompts?: number;
  maxPromptLength?: number;
} = {}) {
  const maxPrompts = options.maxPrompts ?? BATCH_START_MAX_PROMPTS;
  const maxPromptLength = options.maxPromptLength ?? BATCH_START_MAX_PROMPT_LENGTH;
  const stringValues = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const prompts = stringValues.length === 1 && stringValues[0].startsWith("[")
    ? parsePromptJsonArray(stringValues[0])
    : stringValues;

  if (prompts.length === 0) return { prompts, error: "empty" as BatchStartPromptParseError };
  if (prompts.length > maxPrompts) return { prompts, error: "too-many" as BatchStartPromptParseError };
  if (prompts.some((prompt) => prompt.length > maxPromptLength)) return { prompts, error: "too-long" as BatchStartPromptParseError };

  return { prompts };
}

function parsePromptJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
      : [];
  } catch {
    return [];
  }
}
