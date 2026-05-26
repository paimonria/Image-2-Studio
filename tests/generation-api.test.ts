import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildBatchStartFormData,
  buildImageJobFormData,
  requestCreateImageJob,
  requestImageBatch,
  requestImageJob,
  requestRetryImageBatchItems,
  requestRetryImageJob,
  requestStartImageBatch,
  type ImageJobFormInput
} from "../src/components/studio/utils/generation-api";

const originalFetch = globalThis.fetch;

const baseInput: ImageJobFormInput = {
  provider: "openai",
  model: "gpt-image-2",
  mode: "text-to-image",
  prompt: "A product image",
  size: "1024x1024",
  aspectRatio: "1:1",
  resolution: "1K",
  quality: "medium",
  inputFidelity: "high",
  sourceImageIds: ["source-1"],
  files: []
};

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input, init) => handler(input, init)) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("generation API helpers", () => {
  it("builds single job form data with sources and batch metadata", () => {
    const file = new File(["image-bytes"], "source.png", { type: "image/png" });
    const formData = buildImageJobFormData({
      ...baseInput,
      files: [file]
    }, {
      batchId: "batch-1",
      itemId: "item-1"
    });

    assert.equal(formData.get("provider"), "openai");
    assert.equal(formData.get("model"), "gpt-image-2");
    assert.equal(formData.get("prompt"), "A product image");
    assert.equal(formData.get("sourceImageIds"), "source-1");
    assert.equal(formData.get("batchId"), "batch-1");
    assert.equal(formData.get("batchItemId"), "item-1");
    assert.equal(formData.get("files"), file);
  });

  it("builds batch start form data without the single prompt field", () => {
    const prompts = ["First image", "Second image"];
    const formData = buildBatchStartFormData(baseInput, prompts, "blocks");

    assert.equal(formData.has("prompt"), false);
    assert.equal(formData.get("prompts"), JSON.stringify(prompts));
    assert.equal(formData.get("promptFormat"), "blocks");
    assert.equal(formData.get("provider"), "openai");
  });

  it("creates image jobs and requires a job id", async () => {
    mockFetch((input, init) => {
      assert.equal(String(input), "/api/images/create");
      assert.equal(init?.method, "POST");
      assert.equal(init?.body instanceof FormData, true);
      return Response.json({ jobId: "job-1", status: "pending" }, { status: 202 });
    });

    const created = await requestCreateImageJob(new FormData(), "Generation failed.");

    assert.deepEqual(created, { jobId: "job-1", status: "pending" });

    mockFetch(() => Response.json({}, { status: 200 }));
    await assert.rejects(() => requestCreateImageJob(new FormData(), "Generation failed."), /Generation failed/);
  });

  it("loads jobs and batches through stable endpoints", async () => {
    mockFetch((input) => {
      assert.equal(String(input), "/api/images/jobs/job-1");
      return Response.json({
        id: "job-1",
        status: "succeeded",
        provider: "openai",
        model: "gpt-image-2",
        mode: "text-to-image",
        resultId: "image-1",
        createdAt: "2026-05-26T00:00:00.000Z"
      });
    });

    const job = await requestImageJob("job-1", "Job failed.");
    assert.equal(job?.id, "job-1");

    mockFetch((input) => {
      assert.equal(String(input), "/api/images/batches/batch-1");
      return Response.json({
        id: "batch-1",
        name: "Batch",
        provider: "openai",
        model: "gpt-image-2",
        mode: "text-to-image",
        status: "running",
        totalCount: 1,
        successCount: 0,
        failedCount: 0,
        promptFormat: "blocks",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
        items: []
      });
    });

    const batch = await requestImageBatch("batch-1", "Batch failed.");
    assert.equal(batch.id, "batch-1");
  });

  it("starts and retries batches with validated batch details", async () => {
    mockFetch((input, init) => {
      assert.equal(String(input), "/api/images/batches/start");
      assert.equal(init?.method, "POST");
      return Response.json({
        id: "batch-1",
        name: "Batch",
        provider: "openai",
        model: "gpt-image-2",
        mode: "text-to-image",
        status: "running",
        totalCount: 1,
        successCount: 0,
        failedCount: 0,
        promptFormat: "blocks",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
        items: []
      }, { status: 202 });
    });

    assert.equal((await requestStartImageBatch(new FormData(), "Batch failed.")).id, "batch-1");

    mockFetch((input, init) => {
      assert.equal(String(input), "/api/images/batches/batch-1/retry");
      assert.equal(init?.method, "POST");
      assert.equal(init?.headers && (init.headers as Record<string, string>)["content-type"], "application/json");
      assert.equal(init?.body, JSON.stringify({ itemIds: ["item-1"] }));
      return Response.json({
        id: "batch-1",
        name: "Batch",
        provider: "openai",
        model: "gpt-image-2",
        mode: "text-to-image",
        status: "running",
        totalCount: 1,
        successCount: 0,
        failedCount: 0,
        promptFormat: "blocks",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
        items: []
      });
    });

    assert.equal((await requestRetryImageBatchItems("batch-1", ["item-1"], "Retry failed.")).id, "batch-1");
  });

  it("retries standalone jobs and requires the replacement job id", async () => {
    mockFetch((input, init) => {
      assert.equal(String(input), "/api/images/jobs/job-1/retry");
      assert.equal(init?.method, "POST");
      return Response.json({ jobId: "job-2", status: "pending" }, { status: 202 });
    });

    assert.deepEqual(await requestRetryImageJob("job-1", "Retry failed."), { jobId: "job-2", status: "pending" });

    mockFetch(() => Response.json({}, { status: 200 }));
    await assert.rejects(() => requestRetryImageJob("job-1", "Retry failed."), /Retry failed/);
  });
});
