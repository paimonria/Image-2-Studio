import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldIgnoreImageJobProviderResult } from "../src/lib/image-job-runner";

describe("image job runner late result policy", () => {
  it("accepts provider results only for jobs still owned by this worker", () => {
    assert.equal(
      shouldIgnoreImageJobProviderResult({ status: "running", lockedBy: "worker-1" }, "worker-1"),
      false
    );
  });

  it("ignores provider results after timeout cleanup marks a job failed", () => {
    assert.equal(
      shouldIgnoreImageJobProviderResult({ status: "failed", lockedBy: null }, "worker-1"),
      true
    );
  });

  it("ignores provider results when another worker owns the job", () => {
    assert.equal(
      shouldIgnoreImageJobProviderResult({ status: "running", lockedBy: "worker-2" }, "worker-1"),
      true
    );
  });
});
