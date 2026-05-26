import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogResponse } from "../src/lib/types";
import { getProviderModelContext } from "../src/components/studio/utils/provider-model-context";

const catalog: CatalogResponse = {
  providers: [
    {
      provider: "openai",
      label: "OpenAI",
      configured: true,
      supportsCustomSize: false
    }
  ],
  models: [
    {
      provider: "openai",
      modelId: "gpt-image-2",
      label: "GPT Image 2",
      description: "",
      capabilities: ["text-to-image", "image-to-image", "continue-edit"],
      supportedAspectRatios: ["1:1", "16:9"]
    }
  ]
};

describe("provider model context", () => {
  it("resolves provider status, selected model, and model capabilities", () => {
    const context = getProviderModelContext({
      catalog,
      provider: "openai",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1024"
    });

    assert.equal(context.providerStatus?.label, "OpenAI");
    assert.equal(context.providerModels.length, 1);
    assert.equal(context.selectedModel?.modelId, "gpt-image-2");
    assert.equal(context.canUseImageMode, true);
    assert.equal(context.canContinueEdit, true);
    assert.equal(context.isConfigured, true);
    assert.equal(context.supportsCustomSize, false);
    assert.deepEqual(context.aspectRatioOptions, ["1:1", "16:9"]);
  });

  it("limits official providers to the official resolution option and size mapping", () => {
    const context = getProviderModelContext({
      catalog,
      provider: "openai",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "1024"
    });

    assert.deepEqual(context.resolutionOptions.map((option) => option.value), ["1024"]);
    assert.equal(context.computedSize, "1536x1024");
  });

  it("allows custom providers to use custom resolution sizing", () => {
    const context = getProviderModelContext({
      catalog: {
        ...catalog,
        providers: catalog.providers.map((provider) => ({
          ...provider,
          supportsCustomSize: true
        }))
      },
      provider: "openai",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "2048"
    });

    assert.deepEqual(context.resolutionOptions.map((option) => option.value), ["1024", "2048", "4096"]);
    assert.equal(context.computedSize, "2048x1152");
  });

  it("falls back safely when catalog data is missing", () => {
    const context = getProviderModelContext({
      catalog: null,
      provider: "openai",
      model: "missing",
      aspectRatio: "auto",
      resolution: "1024"
    });

    assert.equal(context.providerStatus, undefined);
    assert.deepEqual(context.providerModels, []);
    assert.equal(context.selectedModel, undefined);
    assert.equal(context.canUseImageMode, false);
    assert.equal(context.canContinueEdit, false);
    assert.equal(context.isConfigured, false);
    assert.equal(context.supportsCustomSize, false);
    assert.deepEqual(context.aspectRatioOptions, ["auto", "1:1", "3:4", "4:3", "9:16", "16:9"]);
    assert.equal(context.computedSize, "1024x1024");
  });
});
