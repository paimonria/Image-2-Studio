import type { Locale } from "./copy";

type TemplateMode = "single" | "batch";

export function appendPromptTemplate(currentValue: string, content: string) {
  return currentValue.trim() ? `${currentValue.trimEnd()}\n${content}` : content;
}

export function getPromptTemplateSaveContent(input: {
  generationInputMode: TemplateMode;
  prompt: string;
  batchPromptText: string;
}) {
  return input.generationInputMode === "batch"
    ? input.batchPromptText.trim()
    : input.prompt.trim();
}

export function getPromptTemplateTitle(input: {
  templateTitle: string;
  content: string;
}) {
  return input.templateTitle.trim()
    || input.content.split(/\s+/).slice(0, 8).join(" ").slice(0, 60)
    || "Prompt template";
}

export function getTemplateSaveFailedMessage(locale: Locale) {
  return locale === "zh" ? "模板保存失败。" : "Template could not be saved.";
}

export function getTemplateDeleteFailedMessage(locale: Locale) {
  return locale === "zh" ? "模板删除失败。" : "Template could not be deleted.";
}

export function getTemplateDeleteConfirmMessage(templateTitle: string, locale: Locale) {
  return `${locale === "zh" ? "删除模板" : "Delete template"}: ${templateTitle}`;
}
