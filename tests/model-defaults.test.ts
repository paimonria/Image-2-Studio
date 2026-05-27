import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogResponse } from "../src/lib/types";
import {
  getModelDefaultsKey,
  resolveModelDefaultSelection
} from "../src/components/studio/utils/model-defaults";

const models: CatalogResponse["models"] = [
  {
    provider: "openai",
    modelId: "gpt-image-2",
    label: "GPT Image 2",
    description: "",
    capabilities: ["text-to-image", "image-to-image", "continue-edit"],
    defaultAspectRatio: "3:4",
    supportedAspectRatios: ["1:1", "3:4", "16:9"],
    defaultQuality: "medium",
    qualityOptions: ["low", "medium", "high"],
    inputFidelityOptions: ["high", "low"]
  },
  {
    provider: "openai",
    modelId: "alternate-image-model",
    label: "Alternate",
    description: "",
    capabilities: ["text-to-image"],
    defaultAspectRatio: "1:1",
    supportedAspectRatios: ["1:1"],
    defaultQuality: "low",
    qualityOptions: ["low", "high"],
    inputFidelityOptions: ["low"]
  }
];

describe("model default selection", () => {
  it("applies defaults the first time a model is selected", () => {
    const selection = resolveModelDefaultSelection({
      providerModels: models,
      model: "gpt-image-2",
      lastAppliedModelKey: null,
      supportsCustomSize: true
    });

    assert.equal(selection?.model.modelId, "gpt-image-2");
    assert.equal(selection?.shouldSwitchModel, false);
    assert.equal(selection?.shouldApplyDefaults, true);
    assert.equal(selection?.defaultAspectRatio, "3:4");
    assert.equal(selection?.defaultResolution, "2048");
    assert.equal(selection?.defaultQuality, "medium");
    assert.equal(selection?.defaultInputFidelity, "high");
  });

  it("does not reapply defaults for the same model after user-edited parameters", () => {
    const lastAppliedModelKey = getModelDefaultsKey(models[0]);
    const selection = resolveModelDefaultSelection({
      providerModels: [...models],
      model: "gpt-image-2",
      lastAppliedModelKey,
      supportsCustomSize: true
    });

    assert.equal(selection?.modelKey, lastAppliedModelKey);
    assert.equal(selection?.shouldSwitchModel, false);
    assert.equal(selection?.shouldApplyDefaults, false);
  });

  it("falls back to the first available model and applies its defaults", () => {
    const selection = resolveModelDefaultSelection({
      providerModels: models,
      model: "missing-model",
      lastAppliedModelKey: getModelDefaultsKey(models[1]),
      supportsCustomSize: false
    });

    assert.equal(selection?.model.modelId, "gpt-image-2");
    assert.equal(selection?.shouldSwitchModel, true);
    assert.equal(selection?.shouldApplyDefaults, true);
    assert.equal(selection?.defaultResolution, "1024");
  });

  it("clears image mode for text-only models", () => {
    const selection = resolveModelDefaultSelection({
      providerModels: models,
      model: "alternate-image-model",
      lastAppliedModelKey: null,
      supportsCustomSize: true
    });

    assert.equal(selection?.shouldClearImageMode, true);
  });
});
