import type { RefObject } from "react";
import type { PromptTemplateResponse } from "@/lib/types";
import { appendBatchPromptBlock } from "@/components/studio/utils/batch-prompts";
import { useStudioState } from "@/components/studio/state/studio-context";
import type { Locale } from "@/components/studio/utils/copy";
import { fetchJson } from "@/components/studio/utils/api-client";
import {
  appendPromptTemplate,
  getPromptTemplateSaveContent,
  getPromptTemplateTitle,
  getTemplateDeleteConfirmMessage,
  getTemplateDeleteFailedMessage,
  getTemplateSaveFailedMessage
} from "@/components/studio/utils/template-action-helpers";

type UseTemplateActionsOptions = {
  locale: Locale;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  t: (key: string) => string;
  handleUnauthorized: (errorOrResponse: unknown) => boolean;
  loadTemplates: () => Promise<void>;
};

export function useTemplateActions({
  locale,
  promptRef,
  t,
  handleUnauthorized,
  loadTemplates
}: UseTemplateActionsOptions) {
  const { state, actions } = useStudioState();
  const {
    prompt,
    generationInputMode,
    batchPromptText,
    templateTitle,
    templateCategory,
    templateMode,
    deletingTemplateId
  } = state;
  const {
    setPrompt,
    setBatchPromptText,
    setError,
    setTemplateTitle,
    setTemplateCategory,
    setTemplateOpen,
    setDeletingTemplateId
  } = actions;

  function applyPromptTemplate(template: PromptTemplateResponse) {
    if (generationInputMode === "batch") {
      setBatchPromptText((current) => appendBatchPromptBlock(current, template.content));
    } else {
      setPrompt((current) => appendPromptTemplate(current, template.content));
    }
    setTemplateOpen(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function saveCurrentPromptAsTemplate() {
    const content = getPromptTemplateSaveContent({ generationInputMode, prompt, batchPromptText });
    if (!content) {
      setError(t("enterPrompt"));
      return;
    }

    const title = getPromptTemplateTitle({ templateTitle, content });
    const fallbackMessage = getTemplateSaveFailedMessage(locale);
    let body: Partial<PromptTemplateResponse>;

    try {
      body = await fetchJson<Partial<PromptTemplateResponse>>("/api/images/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category: templateCategory.trim() || "Default",
          mode: templateMode,
          content
        }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    if (!body.id) {
      setError(fallbackMessage);
      return;
    }

    setTemplateTitle("");
    setTemplateCategory("");
    setTemplateOpen(true);
    await loadTemplates();
  }

  async function deletePromptTemplate(template: PromptTemplateResponse) {
    if (deletingTemplateId) return;

    const fallbackMessage = getTemplateDeleteFailedMessage(locale);
    const confirmed = window.confirm(getTemplateDeleteConfirmMessage(template.title, locale));
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    setError("");

    try {
      await fetchJson(`/api/images/templates/${template.id}`, {
        method: "DELETE",
        fallbackMessage
      });

      await loadTemplates();
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setDeletingTemplateId("");
    }
  }

  return {
    applyPromptTemplate,
    saveCurrentPromptAsTemplate,
    deletePromptTemplate
  };
}
