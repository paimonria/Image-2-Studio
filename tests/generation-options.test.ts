import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getHighLoadResolutionMessage,
  getOfficialOpenAIResolutionMessage,
  getResolutionSelection
} from "../src/components/studio/utils/generation-options";

describe("generation option helpers", () => {
  it("forces official OpenAI providers back to the supported resolution", () => {
    assert.deepEqual(getResolutionSelection({
      supportsCustomSize: false,
      resolution: "2048",
      locale: "en"
    }), {
      resolution: "1024",
      error: getOfficialOpenAIResolutionMessage("en")
    });
  });

  it("keeps custom 4K selections while returning a high-load warning", () => {
    assert.deepEqual(getResolutionSelection({
      supportsCustomSize: true,
      resolution: "4096",
      locale: "zh"
    }), {
      resolution: "4096",
      error: getHighLoadResolutionMessage("zh")
    });
  });

  it("keeps ordinary supported resolutions without an error", () => {
    assert.deepEqual(getResolutionSelection({
      supportsCustomSize: true,
      resolution: "2048",
      locale: "en"
    }), {
      resolution: "2048",
      error: ""
    });
  });
});
