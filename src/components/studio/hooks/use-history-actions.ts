import type { ImageProjectResponse, ImageRecord } from "@/lib/types";
import type { Locale } from "@/components/studio/utils/copy";
import { useStudioState } from "@/components/studio/state/studio-context";

type UseHistoryActionsOptions = {
  locale: Locale;
  filteredRecords: ImageRecord[];
  selectedHistoryRecords: ImageRecord[];
  lightboxRecordId: string;
  t: (key: string) => string;
  handleUnauthorized: (response: Response) => boolean;
  closeLightbox: () => void;
  loadHistory: () => Promise<unknown>;
  loadProjects: () => Promise<void>;
  setRecords: (value: ImageRecord[] | ((current: ImageRecord[]) => ImageRecord[])) => void;
  setHistoryNextCursor: (value: string | undefined) => void;
};

export function useHistoryActions({
  locale,
  filteredRecords,
  selectedHistoryRecords,
  lightboxRecordId,
  t,
  handleUnauthorized,
  closeLightbox,
  loadHistory,
  loadProjects,
  setRecords,
  setHistoryNextCursor
}: UseHistoryActionsOptions) {
  const { state, actions } = useStudioState();
  const {
    selectedHistoryIds,
    newProjectName,
    assignProjectId,
    assignTagsText
  } = state;
  const {
    setTopbarMenuOpen,
    setSelectedHistoryIds,
    setFavoriteRecordIds,
    setDeletingHistoryIds,
    setSourceImageIds,
    setSelectedRecordId,
    setCopiedId,
    setCopiedPromptId,
    setError,
    setNewProjectName,
    setAssignProjectId
  } = actions;

  function toggleFavoriteRecord(id: string) {
    setFavoriteRecordIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [id, ...current];
    });
  }

  function toggleHistorySelection(id: string) {
    setSelectedHistoryIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function selectAllVisibleHistory() {
    setSelectedHistoryIds(filteredRecords.map((record) => record.id));
  }

  async function copySelectedImageLinks() {
    const links = selectedHistoryRecords.map((record) => new URL(record.imageUrl, window.location.origin).toString());
    await navigator.clipboard.writeText(links.join("\n"));
  }

  function downloadSelectedImages() {
    selectedHistoryRecords.forEach((record, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = record.imageUrl;
        link.download = `image-2-${record.id}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 120);
    });
  }

  async function deleteHistoryImages(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const confirmed = window.confirm(uniqueIds.length === 1
      ? (locale === "zh" ? "删除这张图片？此操作不可撤销。" : "Delete this image? This cannot be undone.")
      : (locale === "zh" ? `删除选中的 ${uniqueIds.length} 张图片？此操作不可撤销。` : `Delete ${uniqueIds.length} selected images? This cannot be undone.`));
    if (!confirmed) return;

    setError("");
    setDeletingHistoryIds((current) => Array.from(new Set([...current, ...uniqueIds])));

    try {
      const response = await fetch("/api/images/history", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds })
      });
      const body = (await response.json().catch(() => ({}))) as { deletedIds?: unknown; error?: string };

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        throw new Error(body.error || (locale === "zh" ? "图片删除失败。" : "Images could not be deleted."));
      }

      const deletedIds = Array.isArray(body.deletedIds)
        ? body.deletedIds.filter((id): id is string => typeof id === "string")
        : uniqueIds;
      const deletedSet = new Set(deletedIds);

      setRecords((current) => current.filter((record) => !deletedSet.has(record.id)));
      setSelectedHistoryIds((current) => current.filter((id) => !deletedSet.has(id)));
      setFavoriteRecordIds((current) => current.filter((id) => !deletedSet.has(id)));
      setSourceImageIds((current) => current.filter((id) => !deletedSet.has(id)));
      setSelectedRecordId((current) => deletedSet.has(current) ? "" : current);
      if (lightboxRecordId && deletedSet.has(lightboxRecordId)) {
        closeLightbox();
      }
      setCopiedId((current) => deletedSet.has(current) ? "" : current);
      setCopiedPromptId((current) => deletedSet.has(current) ? "" : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "zh" ? "图片删除失败。" : "Images could not be deleted."));
    } finally {
      setDeletingHistoryIds((current) => current.filter((id) => !uniqueIds.includes(id)));
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;

    const response = await fetch("/api/images/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ImageProjectResponse> & { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok || !body.id) {
      setError(body.error || (locale === "zh" ? "项目创建失败。" : "Project could not be created."));
      return;
    }

    setNewProjectName("");
    setAssignProjectId(body.id);
    await loadProjects();
  }

  function parseAssignTags() {
    return assignTagsText
      .split(/[,\n，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function assignSelectedImages() {
    if (selectedHistoryIds.length === 0) return;

    const response = await fetch("/api/images/projects/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recordIds: selectedHistoryIds,
        projectId: assignProjectId || null,
        tags: parseAssignTags()
      })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      setError(body.error || (locale === "zh" ? "图片整理失败。" : "Images could not be organized."));
      return;
    }

    await Promise.all([loadHistory(), loadProjects()]);
    setSelectedHistoryIds([]);
  }

  async function exportSelectedImagesZip() {
    if (selectedHistoryIds.length === 0) return;

    const response = await fetch("/api/images/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selectedHistoryIds, naming: "prompt" })
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error || (locale === "zh" ? "导出失败。" : "Export failed."));
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `image-2-export-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function clearHistory() {
    setTopbarMenuOpen(false);
    if (!window.confirm(t("clearHistoryConfirm"))) return;

    setError("");

    try {
      const response = await fetch("/api/images/history/clear", { method: "POST" });

      if (handleUnauthorized(response)) return;

      if (!response.ok) {
        setError(t("clearHistoryFailed"));
        return;
      }

      setRecords([]);
      setHistoryNextCursor(undefined);
      setSourceImageIds([]);
      setSelectedRecordId("");
      closeLightbox();
      setSelectedHistoryIds([]);
      setFavoriteRecordIds([]);
      setDeletingHistoryIds([]);
      setCopiedId("");
      setCopiedPromptId("");
    } catch {
      setError(t("clearHistoryFailed"));
    }
  }

  return {
    toggleFavoriteRecord,
    toggleHistorySelection,
    selectAllVisibleHistory,
    copySelectedImageLinks,
    downloadSelectedImages,
    deleteHistoryImages,
    createProject,
    assignSelectedImages,
    exportSelectedImagesZip,
    clearHistory
  };
}
