import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATCH_PROMPT_END,
  BATCH_PROMPT_START,
  appendBatchPromptBlock,
  getEmptyBatchPromptBlock,
  getBatchPromptBlock,
  getPromptFormat,
  insertBatchPromptTemplate,
  parseBatchPrompts
} from "../src/components/studio/utils/batch-prompts";

describe("batch prompt helpers", () => {
  it("builds empty prompt blocks for insertion", () => {
    assert.equal(getEmptyBatchPromptBlock(), `${BATCH_PROMPT_START}\n\n${BATCH_PROMPT_END}`);
  });

  it("wraps and appends template content as batch prompt blocks", () => {
    assert.equal(getBatchPromptBlock("Template body"), `${BATCH_PROMPT_START}\nTemplate body\n${BATCH_PROMPT_END}`);
    assert.equal(appendBatchPromptBlock("", "Template body"), `${BATCH_PROMPT_START}\nTemplate body\n${BATCH_PROMPT_END}`);
    assert.equal(
      appendBatchPromptBlock("Existing\n", "Template body"),
      `Existing\n\n${BATCH_PROMPT_START}\nTemplate body\n${BATCH_PROMPT_END}`
    );
  });

  it("inserts a default template when the current value is empty", () => {
    const next = insertBatchPromptTemplate("  \n ", "text-to-image", "en");

    assert.equal(next.includes("Subject: glass greenhouse"), true);
    assert.equal(next.includes(BATCH_PROMPT_START), true);
    assert.equal(next.includes(BATCH_PROMPT_END), true);
  });

  it("appends an empty block after existing content without trimming leading text", () => {
    assert.equal(
      insertBatchPromptTemplate("  existing prompt  \n", "text-to-image", "en"),
      `  existing prompt\n\n${BATCH_PROMPT_START}\n\n${BATCH_PROMPT_END}`
    );
  });

  it("detects prompt formats from block markers", () => {
    assert.equal(getPromptFormat("plain line prompt"), "lines");
    assert.equal(getPromptFormat(`${BATCH_PROMPT_START}\nA prompt\n${BATCH_PROMPT_END}`), "blocks");
  });

  it("parses inserted empty blocks as incomplete user input", () => {
    assert.deepEqual(parseBatchPrompts(getEmptyBatchPromptBlock()), {
      prompts: [],
      errorKey: "batchFormatEmptyBlock"
    });
  });
});
