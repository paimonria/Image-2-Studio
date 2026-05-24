import type { PromptTemplateResponse } from "../types";
import { AppError } from "./errors";
import { prisma } from "./db";

const MAX_TEMPLATE_TITLE = 80;
const MAX_TEMPLATE_CATEGORY = 40;
const MAX_TEMPLATE_CONTENT = 4000;

function normalizeMode(value: unknown) {
  if (value === "text-to-image" || value === "image-to-image" || value === "universal") return value;
  return "universal";
}

function toTemplateResponse(template: {
  id: string;
  title: string;
  category: string;
  mode: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): PromptTemplateResponse {
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    mode: template.mode as PromptTemplateResponse["mode"],
    content: template.content,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

function normalizeTemplateInput(input: {
  title?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
}) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TEMPLATE_TITLE) : "";
  const category = typeof input.category === "string" && input.category.trim()
    ? input.category.trim().slice(0, MAX_TEMPLATE_CATEGORY)
    : "Default";
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!title) {
    throw new AppError("Enter a template title.");
  }

  if (!content) {
    throw new AppError("Enter template content.");
  }

  if (content.length > MAX_TEMPLATE_CONTENT) {
    throw new AppError(`Template content must be ${MAX_TEMPLATE_CONTENT} characters or fewer.`);
  }

  return {
    title,
    category,
    mode: normalizeMode(input.mode),
    content
  };
}

export async function readPromptTemplatesForUser(userId: string) {
  const templates = await prisma.promptTemplate.findMany({
    where: { userId },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" }
    ]
  });

  return {
    templates: templates.map(toTemplateResponse)
  };
}

export async function createPromptTemplateForUser(userId: string, input: {
  title?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
}) {
  const data = normalizeTemplateInput(input);
  const template = await prisma.promptTemplate.create({
    data: {
      userId,
      ...data
    }
  });

  return toTemplateResponse(template);
}

export async function updatePromptTemplateForUser(userId: string, templateId: string, input: {
  title?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
}) {
  const existing = await prisma.promptTemplate.findFirst({
    where: {
      id: templateId,
      userId
    }
  });

  if (!existing) {
    throw new AppError("Template not found.", 404);
  }

  const data = normalizeTemplateInput({
    title: input.title ?? existing.title,
    category: input.category ?? existing.category,
    mode: input.mode ?? existing.mode,
    content: input.content ?? existing.content
  });

  const template = await prisma.promptTemplate.update({
    where: { id: templateId },
    data
  });

  return toTemplateResponse(template);
}

export async function deletePromptTemplateForUser(userId: string, templateId: string) {
  const deleted = await prisma.promptTemplate.deleteMany({
    where: {
      id: templateId,
      userId
    }
  });

  if (deleted.count === 0) {
    throw new AppError("Template not found.", 404);
  }

  return {
    ok: true
  };
}
