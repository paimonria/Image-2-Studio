import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendPromptTemplate,
  getPromptTemplateSaveContent,
  getPromptTemplateTitle,
  getTemplateDeleteConfirmMessage,
  getTemplateDeleteFailedMessage,
  getTemplateSaveFailedMessage
} from "../src/components/studio/utils/template-action-helpers";

describe("template action helpers", () => {
  it("appends single prompt templates without trimming leading text", () => {
    assert.equal(appendPromptTemplate("", "Template body"), "Template body");
    assert.equal(appendPromptTemplate("  Existing prompt  \n", "Template body"), "  Existing prompt\nTemplate body");
  });

  it("selects save content from the active input mode", () => {
    assert.equal(getPromptTemplateSaveContent({
      generationInputMode: "single",
      prompt: "  Single prompt  ",
      batchPromptText: "  Batch prompt  "
    }), "Single prompt");

    assert.equal(getPromptTemplateSaveContent({
      generationInputMode: "batch",
      prompt: "  Single prompt  ",
      batchPromptText: "  Batch prompt  "
    }), "Batch prompt");
  });

  it("derives template titles from explicit titles or prompt content", () => {
    assert.equal(getPromptTemplateTitle({
      templateTitle: "  Product shot  ",
      content: "ignored content"
    }), "Product shot");

    assert.equal(getPromptTemplateTitle({
      templateTitle: "",
      content: "one two three four five six seven eight nine"
    }), "one two three four five six seven eight");

    assert.equal(getPromptTemplateTitle({
      templateTitle: "",
      content: ""
    }), "Prompt template");
  });

  it("returns localized template action messages", () => {
    assert.equal(getTemplateSaveFailedMessage("zh"), "模板保存失败。");
    assert.equal(getTemplateSaveFailedMessage("en"), "Template could not be saved.");
    assert.equal(getTemplateDeleteFailedMessage("zh"), "模板删除失败。");
    assert.equal(getTemplateDeleteFailedMessage("en"), "Template could not be deleted.");
    assert.equal(getTemplateDeleteConfirmMessage("Portrait", "zh"), "删除模板: Portrait");
    assert.equal(getTemplateDeleteConfirmMessage("Portrait", "en"), "Delete template: Portrait");
  });
});
