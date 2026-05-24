import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBatchStartPrompts } from "../src/lib/batch-start";

describe("batch start prompt parsing", () => {
  it("parses a JSON prompt array without splitting prompt commas", () => {
    assert.deepEqual(
      parseBatchStartPrompts(['["red car, dusk", "blue sea"]']).prompts,
      ["red car, dusk", "blue sea"]
    );
  });

  it("parses repeated prompt fields", () => {
    assert.deepEqual(
      parseBatchStartPrompts([" first prompt ", "second prompt"]).prompts,
      ["first prompt", "second prompt"]
    );
  });

  it("rejects empty, oversized count, and oversized prompt inputs", () => {
    assert.equal(parseBatchStartPrompts([]).error, "empty");
    assert.equal(parseBatchStartPrompts(["one", "two"], { maxPrompts: 1 }).error, "too-many");
    assert.equal(parseBatchStartPrompts(["abcd"], { maxPromptLength: 3 }).error, "too-long");
  });
});
