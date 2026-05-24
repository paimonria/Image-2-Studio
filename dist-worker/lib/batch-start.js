"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BATCH_START_MAX_PROMPT_LENGTH = exports.BATCH_START_MAX_PROMPTS = void 0;
exports.parseBatchStartPrompts = parseBatchStartPrompts;
exports.BATCH_START_MAX_PROMPTS = 20;
exports.BATCH_START_MAX_PROMPT_LENGTH = 2000;
function parseBatchStartPrompts(values, options = {}) {
    const maxPrompts = options.maxPrompts ?? exports.BATCH_START_MAX_PROMPTS;
    const maxPromptLength = options.maxPromptLength ?? exports.BATCH_START_MAX_PROMPT_LENGTH;
    const stringValues = values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
    const prompts = stringValues.length === 1 && stringValues[0].startsWith("[")
        ? parsePromptJsonArray(stringValues[0])
        : stringValues;
    if (prompts.length === 0)
        return { prompts, error: "empty" };
    if (prompts.length > maxPrompts)
        return { prompts, error: "too-many" };
    if (prompts.some((prompt) => prompt.length > maxPromptLength))
        return { prompts, error: "too-long" };
    return { prompts };
}
function parsePromptJsonArray(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
            : [];
    }
    catch {
        return [];
    }
}
