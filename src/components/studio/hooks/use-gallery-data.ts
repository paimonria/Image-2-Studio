import { useState } from "react";
import type { HistoryResponse, ImageBatchResponse, ImageProjectResponse, ImageRecord, PromptTemplateResponse } from "@/lib/types";
import { mergeHistoryRecords } from "@/lib/history-records";

type LoadHistoryOptions = {
  reset?: boolean;
  selectFirst?: boolean;
};

type UseGalleryDataOptions = {
  pageSize: number;
  messages: {
    historyLoadFailed: string;
    batchesLoadFailed: string;
    projectsLoadFailed: string;
    templatesLoadFailed: string;
    generationFailed: string;
  };
  onUnauthorized: (response: Response) => boolean;
  onError: (message: string) => void;
  onSelectFirstRecord: (recordId: string) => void;
};

export function useGalleryData({
  pageSize,
  messages,
  onUnauthorized,
  onError,
  onSelectFirstRecord
}: UseGalleryDataOptions) {
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [batches, setBatches] = useState<ImageBatchResponse[]>([]);
  const [projects, setProjects] = useState<ImageProjectResponse[]>([]);
  const [templates, setTemplates] = useState<PromptTemplateResponse[]>([]);

  function resetGalleryData() {
    setRecords([]);
    setHistoryNextCursor(undefined);
    setBatches([]);
    setProjects([]);
    setTemplates([]);
  }

  async function loadHistory(options: { selectFirst?: boolean } = {}) {
    return loadHistoryPage({ reset: true, selectFirst: options.selectFirst });
  }

  async function loadHistoryPage(options: LoadHistoryOptions = {}) {
    if (historyLoading) return;

    const cursor = options.reset ? undefined : historyNextCursor;
    if (!options.reset && !cursor) return;

    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(`/api/images/history?${params.toString()}`, { cache: "no-store" });
      if (onUnauthorized(response)) return;
      if (!response.ok) throw new Error(messages.historyLoadFailed);

      const body = (await response.json()) as HistoryResponse;
      const nextRecords = Array.isArray(body.records) ? body.records : [];

      setRecords((current) => options.reset ? nextRecords : mergeHistoryRecords(current, nextRecords));
      setHistoryNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : undefined);
      if (options.selectFirst !== false) {
        onSelectFirstRecord(nextRecords[0]?.id || "");
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadBatches() {
    try {
      const response = await fetch("/api/images/batches?limit=30", { cache: "no-store" });
      if (onUnauthorized(response)) return;
      if (!response.ok) throw new Error(messages.batchesLoadFailed);

      const body = (await response.json()) as { batches?: ImageBatchResponse[] };
      setBatches(Array.isArray(body.batches) ? body.batches : []);
    } catch (loadError) {
      onError(loadError instanceof Error ? loadError.message : messages.generationFailed);
    }
  }

  async function loadProjects() {
    const response = await fetch("/api/images/projects", { cache: "no-store" });
    if (onUnauthorized(response)) return;
    if (!response.ok) throw new Error(messages.projectsLoadFailed);

    const body = (await response.json()) as { projects?: ImageProjectResponse[] };
    setProjects(Array.isArray(body.projects) ? body.projects : []);
  }

  async function loadTemplates() {
    const response = await fetch("/api/images/templates", { cache: "no-store" });
    if (onUnauthorized(response)) return;
    if (!response.ok) throw new Error(messages.templatesLoadFailed);

    const body = (await response.json()) as { templates?: PromptTemplateResponse[] };
    setTemplates(Array.isArray(body.templates) ? body.templates : []);
  }

  async function loadGalleryMeta() {
    await Promise.all([
      loadBatches(),
      loadProjects(),
      loadTemplates()
    ]);
  }

  return {
    records,
    setRecords,
    historyNextCursor,
    setHistoryNextCursor,
    historyLoading,
    batches,
    setBatches,
    projects,
    setProjects,
    templates,
    setTemplates,
    resetGalleryData,
    loadHistory,
    loadHistoryPage,
    loadBatches,
    loadProjects,
    loadTemplates,
    loadGalleryMeta
  };
}
