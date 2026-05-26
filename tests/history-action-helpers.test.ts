import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAssignImagesFailedMessage,
  getCreateProjectFailedMessage,
  getDeletedHistoryIds,
  getDeleteHistoryImagesConfirmMessage,
  getExportImagesFailedMessage,
  getExportZipFileName,
  getHistoryImageDownloadDelay,
  getHistoryImageDownloadFileName,
  getHistoryImagesDeleteFailedMessage,
  getUniqueHistoryIds,
  mergeHistoryIds,
  removeHistoryIds,
  parseAssignTags
} from "../src/components/studio/utils/history-action-helpers";

describe("history action helpers", () => {
  it("deduplicates non-empty history ids in first-seen order", () => {
    assert.deepEqual(getUniqueHistoryIds(["one", "", "two", "one", "three"]), ["one", "two", "three"]);
  });

  it("uses server deleted ids when present and falls back otherwise", () => {
    assert.deepEqual(getDeletedHistoryIds(["one", 2, "two", null], ["fallback"]), ["one", "two"]);
    assert.deepEqual(getDeletedHistoryIds(undefined, ["fallback"]), ["fallback"]);
  });

  it("merges and removes history ids without changing order", () => {
    assert.deepEqual(mergeHistoryIds(["one", "two"], ["two", "three", ""]), ["one", "two", "three"]);
    assert.deepEqual(removeHistoryIds(["one", "two", "three"], ["two", "missing"]), ["one", "three"]);
  });

  it("returns localized delete confirmation and failure messages", () => {
    assert.equal(getDeleteHistoryImagesConfirmMessage(1, "en"), "Delete this image? This cannot be undone.");
    assert.equal(getDeleteHistoryImagesConfirmMessage(3, "zh"), "删除选中的 3 张图片？此操作不可撤销。");
    assert.equal(getHistoryImagesDeleteFailedMessage("zh"), "图片删除失败。");
  });

  it("returns localized project assignment and export failure messages", () => {
    assert.equal(getCreateProjectFailedMessage("zh"), "项目创建失败。");
    assert.equal(getAssignImagesFailedMessage("en"), "Images could not be organized.");
    assert.equal(getExportImagesFailedMessage("zh"), "导出失败。");
  });

  it("parses comma, Chinese comma, and newline separated tags", () => {
    assert.deepEqual(parseAssignTags("hero, product\n  campaign，banner ,, "), [
      "hero",
      "product",
      "campaign",
      "banner"
    ]);
  });

  it("formats per-image download filenames and staggered delays", () => {
    assert.equal(getHistoryImageDownloadFileName("record-1"), "image-2-record-1.png");
    assert.equal(getHistoryImageDownloadDelay(3), 360);
  });

  it("formats export zip filenames from a supplied timestamp", () => {
    assert.equal(getExportZipFileName(1779793000000), "image-2-export-1779793000000.zip");
  });
});
