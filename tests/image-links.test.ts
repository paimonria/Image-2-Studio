import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatImageRecordLinks,
  getImageRecordUrl,
  getImageRecordUrls
} from "../src/components/studio/utils/image-links";

describe("image link formatting", () => {
  it("formats relative image URLs against the current origin", () => {
    assert.equal(
      getImageRecordUrl({ imageUrl: "/api/images/file/one" }, "https://studio.example"),
      "https://studio.example/api/images/file/one"
    );
  });

  it("preserves absolute image URLs", () => {
    assert.equal(
      getImageRecordUrl({ imageUrl: "https://cdn.example/image.png" }, "https://studio.example"),
      "https://cdn.example/image.png"
    );
  });

  it("formats multiple records for clipboard copy", () => {
    const records = [
      { imageUrl: "/api/images/file/one" },
      { imageUrl: "/api/images/file/two" }
    ];

    assert.deepEqual(getImageRecordUrls(records, "https://studio.example"), [
      "https://studio.example/api/images/file/one",
      "https://studio.example/api/images/file/two"
    ]);
    assert.equal(
      formatImageRecordLinks(records, "https://studio.example"),
      "https://studio.example/api/images/file/one\nhttps://studio.example/api/images/file/two"
    );
  });
});
