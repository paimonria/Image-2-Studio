"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPromptTemplatesForUser = readPromptTemplatesForUser;
exports.createPromptTemplateForUser = createPromptTemplateForUser;
exports.updatePromptTemplateForUser = updatePromptTemplateForUser;
exports.deletePromptTemplateForUser = deletePromptTemplateForUser;
const errors_1 = require("./errors");
const db_1 = require("./db");
const MAX_TEMPLATE_TITLE = 80;
const MAX_TEMPLATE_CATEGORY = 40;
const MAX_TEMPLATE_CONTENT = 4000;
function normalizeMode(value) {
    if (value === "text-to-image" || value === "image-to-image" || value === "universal")
        return value;
    return "universal";
}
function toTemplateResponse(template) {
    return {
        id: template.id,
        title: template.title,
        category: template.category,
        mode: template.mode,
        content: template.content,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString()
    };
}
function normalizeTemplateInput(input) {
    const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TEMPLATE_TITLE) : "";
    const category = typeof input.category === "string" && input.category.trim()
        ? input.category.trim().slice(0, MAX_TEMPLATE_CATEGORY)
        : "Default";
    const content = typeof input.content === "string" ? input.content.trim() : "";
    if (!title) {
        throw new errors_1.AppError("Enter a template title.");
    }
    if (!content) {
        throw new errors_1.AppError("Enter template content.");
    }
    if (content.length > MAX_TEMPLATE_CONTENT) {
        throw new errors_1.AppError(`Template content must be ${MAX_TEMPLATE_CONTENT} characters or fewer.`);
    }
    return {
        title,
        category,
        mode: normalizeMode(input.mode),
        content
    };
}
async function readPromptTemplatesForUser(userId) {
    const templates = await db_1.prisma.promptTemplate.findMany({
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
async function createPromptTemplateForUser(userId, input) {
    const data = normalizeTemplateInput(input);
    const template = await db_1.prisma.promptTemplate.create({
        data: {
            userId,
            ...data
        }
    });
    return toTemplateResponse(template);
}
async function updatePromptTemplateForUser(userId, templateId, input) {
    const existing = await db_1.prisma.promptTemplate.findFirst({
        where: {
            id: templateId,
            userId
        }
    });
    if (!existing) {
        throw new errors_1.AppError("Template not found.", 404);
    }
    const data = normalizeTemplateInput({
        title: input.title ?? existing.title,
        category: input.category ?? existing.category,
        mode: input.mode ?? existing.mode,
        content: input.content ?? existing.content
    });
    const template = await db_1.prisma.promptTemplate.update({
        where: { id: templateId },
        data
    });
    return toTemplateResponse(template);
}
async function deletePromptTemplateForUser(userId, templateId) {
    const deleted = await db_1.prisma.promptTemplate.deleteMany({
        where: {
            id: templateId,
            userId
        }
    });
    if (deleted.count === 0) {
        throw new errors_1.AppError("Template not found.", 404);
    }
    return {
        ok: true
    };
}
