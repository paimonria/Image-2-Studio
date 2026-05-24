import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeHistoryRecords } from "../src/lib/history-records";
import type { ImageRecord } from "../src/lib/types";

function record(id: string, createdAt: string): ImageRecord {
  return {
    id,
    createdAt,
    provider: "openai",
    model: "test-model",
    mode: "text-to-image",
    prompt: id,
    imageUrl: `/api/images/file/${id}`,
    imagePath: `${id}.png`,
    sourceImageIds: [],
    uploadUrls: [],
    tags: []
  };
}

describe("history record merge policy", () => {
  it("appends older pages after the current gallery records", () => {
    const current = [
      record("newest", "2026-05-23T10:00:00.000Z"),
      record("newer", "2026-05-23T09:00:00.000Z")
    ];
    const incoming = [
      record("older", "2026-05-23T08:00:00.000Z"),
      record("oldest", "2026-05-23T07:00:00.000Z")
    ];

    assert.deepEqual(
      mergeHistoryRecords(current, incoming).map((item) => item.id),
      ["newest", "newer", "older", "oldest"]
    );
  });

  it("keeps the already displayed record when ids overlap", () => {
    const current = [
      record("newest", "2026-05-23T10:00:00.000Z"),
      record("shared", "2026-05-23T09:00:00.000Z")
    ];
    const incoming = [
      record("shared", "2026-05-23T09:00:00.000Z"),
      record("older", "2026-05-23T08:00:00.000Z")
    ];

    const merged = mergeHistoryRecords(current, incoming);

    assert.deepEqual(merged.map((item) => item.id), ["newest", "shared", "older"]);
    assert.equal(merged[1], current[1]);
  });

  it("handles empty current or incoming pages", () => {
    const older = record("older", "2026-05-23T08:00:00.000Z");
    const newest = record("newest", "2026-05-23T10:00:00.000Z");

    assert.deepEqual(mergeHistoryRecords([], [older]), [older]);
    assert.deepEqual(mergeHistoryRecords([newest], []), [newest]);
  });
});
