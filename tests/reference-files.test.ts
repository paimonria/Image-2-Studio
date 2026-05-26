import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_REFERENCE_FILES,
  mergeReferenceFiles,
  shouldSwitchToImageMode
} from "../src/components/studio/utils/reference-files";

function createFile(name: string) {
  return new File(["image-bytes"], name, { type: "image/png" });
}

describe("reference file helpers", () => {
  it("appends new reference files up to the supported limit", () => {
    const current = [createFile("one.png"), createFile("two.png")];
    const next = [createFile("three.png"), createFile("four.png"), createFile("five.png")];

    assert.equal(MAX_REFERENCE_FILES, 4);
    assert.deepEqual(
      mergeReferenceFiles(current, next).map((file) => file.name),
      ["one.png", "two.png", "three.png", "four.png"]
    );
  });

  it("supports custom limits for isolated callers", () => {
    assert.deepEqual(
      mergeReferenceFiles([createFile("one.png")], [createFile("two.png")], 1).map((file) => file.name),
      ["one.png"]
    );
  });

  it("switches to image mode only when references exist and the model allows it", () => {
    assert.equal(shouldSwitchToImageMode([createFile("one.png")], true), true);
    assert.equal(shouldSwitchToImageMode([createFile("one.png")], false), false);
    assert.equal(shouldSwitchToImageMode([], true), false);
  });
});
