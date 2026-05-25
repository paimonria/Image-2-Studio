import type { Dispatch, SetStateAction } from "react";
import type { ImageBatchDetailResponse } from "@/lib/types";
import { isActiveImageJobStatus } from "@/lib/image-job-state";
import { batchItemToGenerationItem, type BatchGenerationItem } from "@/components/studio/hooks/use-image-jobs";
import { useStudioState } from "@/components/studio/state/studio-context";
import type { Locale } from "@/components/studio/utils/copy";

type UseWorkspaceActionsOptions = {
  locale: Locale;
  loadJobs: () => Promise<unknown>;
  loadGalleryMeta: () => Promise<unknown>;
  handleUnauthorized: (response: Response) => boolean;
  closeLightbox: () => void;
  setBatchItems: Dispatch<SetStateAction<BatchGenerationItem[]>>;
  setBatchRunning: Dispatch<SetStateAction<boolean>>;
  setActiveBatchId: Dispatch<SetStateAction<string>>;
  updateBatchTiming: (batch: ImageBatchDetailResponse, active: boolean) => void;
};

export function useWorkspaceActions({
  locale,
  loadJobs,
  loadGalleryMeta,
  handleUnauthorized,
  closeLightbox,
  setBatchItems,
  setBatchRunning,
  setActiveBatchId,
  updateBatchTiming
}: UseWorkspaceActionsOptions) {
  const { actions } = useStudioState();
  const {
    setActiveView,
    setSelectedRecordId,
    setGenerationInputMode
  } = actions;

  async function loadWorkspaceMeta() {
    await Promise.all([
      loadJobs(),
      loadGalleryMeta()
    ]);
  }

  function isBatchDetailActive(batch: ImageBatchDetailResponse) {
    return batch.items.some((item) => item.status === "queued" || item.status === "creating" || isActiveImageJobStatus(item.status));
  }

  async function loadBatchDetail(batchId: string, options: { showInStudio?: boolean } = {}) {
    const response = await fetch(`/api/images/batches/${batchId}`, { cache: "no-store" });
    if (handleUnauthorized(response)) return null;
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || (locale === "zh" ? "批次详情加载失败。" : "Batch detail could not be loaded."));
    }

    const batch = (await response.json()) as ImageBatchDetailResponse;
    const active = isBatchDetailActive(batch);
    setActiveBatchId(batch.id);
    setBatchItems(batch.items.map(batchItemToGenerationItem));
    setGenerationInputMode("batch");
    setBatchRunning(active);
    updateBatchTiming(batch, active);

    if (options.showInStudio) {
      setActiveView("studio");
      setSelectedRecordId("");
      closeLightbox();
    }

    return batch;
  }

  return {
    loadWorkspaceMeta,
    loadBatchDetail,
    isBatchDetailActive
  };
}
