import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCopy } from "../src/components/studio/utils/copy";
import {
  getJobMonitorLabels,
  getLightboxLabels,
  getResetHistoryFiltersState,
  getStudioMainClassName
} from "../src/components/studio/utils/studio-view-model";

describe("studio view model", () => {
  it("returns the canonical history filter reset state", () => {
    assert.deepEqual(getResetHistoryFiltersState(), {
      historySearch: "",
      favoriteOnly: false,
      historyFilter: { provider: "all", model: "all" },
      historyBatchFilter: "all",
      historyProjectFilter: "all",
      historyTagFilter: ""
    });
  });

  it("builds the studio shell class name from view, layout, and selection state", () => {
    assert.equal(
      getStudioMainClassName({
        activeView: "gallery",
        studioLayout: "controls-left",
        selectedHistoryCount: 0
      }),
      "main view-gallery studio-layout-controls-left"
    );

    assert.equal(
      getStudioMainClassName({
        activeView: "studio",
        studioLayout: "controls-right",
        selectedHistoryCount: 3
      }),
      "main view-studio studio-layout-controls-right has-selection-sidebar"
    );
  });

  it("builds localized job monitor labels with status counts", () => {
    const labels = getJobMonitorLabels({
      locale: "en",
      t: (key) => getCopy("en", key),
      activeCount: 2,
      failedCount: 1,
      succeededCount: 4
    });

    assert.equal(labels.title, "Job monitor");
    assert.equal(labels.summary, "2 active / 1 failed / 4 done");
    assert.equal(labels.openBatch, "Open batch");
    assert.equal(labels.trackProgress, "Track progress");
  });

  it("builds localized lightbox labels", () => {
    const labels = getLightboxLabels({
      locale: "zh",
      t: (key) => getCopy("zh", key)
    });

    assert.equal(labels.imagePreview, "图片预览");
    assert.equal(labels.closePreview, "关闭预览");
    assert.equal(labels.fitToScreen, "适应屏幕");
    assert.equal(labels.originalSize, "100% 原图");
  });
});
