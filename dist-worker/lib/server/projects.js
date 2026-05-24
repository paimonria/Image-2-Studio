"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readProjectsForUser = readProjectsForUser;
exports.createProjectForUser = createProjectForUser;
exports.assignImagesToProject = assignImagesToProject;
const errors_1 = require("./errors");
const db_1 = require("./db");
const MAX_PROJECT_NAME_LENGTH = 60;
const MAX_ASSIGN_RECORDS = 100;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;
function toProjectResponse(project) {
    return {
        id: project.id,
        name: project.name,
        color: project.color ?? undefined,
        imageCount: project._count?.images ?? 0,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
    };
}
function normalizeProjectName(value) {
    const name = typeof value === "string" ? value.trim() : "";
    if (!name) {
        throw new errors_1.AppError("Enter a project name.");
    }
    return name.slice(0, MAX_PROJECT_NAME_LENGTH);
}
function normalizeRecordIds(value) {
    if (!Array.isArray(value)) {
        throw new errors_1.AppError("Choose at least one image.");
    }
    const ids = Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
    if (ids.length === 0) {
        throw new errors_1.AppError("Choose at least one image.");
    }
    if (ids.length > MAX_ASSIGN_RECORDS) {
        throw new errors_1.AppError(`Update at most ${MAX_ASSIGN_RECORDS} images at a time.`);
    }
    return ids;
}
function normalizeTags(value) {
    if (!Array.isArray(value))
        return undefined;
    return Array.from(new Set(value
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean)
        .map((item) => item.slice(0, MAX_TAG_LENGTH))))
        .slice(0, MAX_TAGS);
}
async function readProjectsForUser(userId) {
    const projects = await db_1.prisma.imageProject.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
            _count: {
                select: { images: true }
            }
        }
    });
    return {
        projects: projects.map(toProjectResponse)
    };
}
async function createProjectForUser(userId, input) {
    const name = normalizeProjectName(input.name);
    const color = typeof input.color === "string" && input.color.trim() ? input.color.trim().slice(0, 32) : undefined;
    const existing = await db_1.prisma.imageProject.findUnique({
        where: {
            userId_name: {
                userId,
                name
            }
        },
        include: {
            _count: {
                select: { images: true }
            }
        }
    });
    if (existing) {
        return toProjectResponse(existing);
    }
    const project = await db_1.prisma.imageProject.create({
        data: {
            userId,
            name,
            color
        },
        include: {
            _count: {
                select: { images: true }
            }
        }
    });
    return toProjectResponse(project);
}
async function assignImagesToProject(userId, input) {
    const recordIds = normalizeRecordIds(input.recordIds);
    const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : null;
    const tags = normalizeTags(input.tags);
    if (projectId) {
        const project = await db_1.prisma.imageProject.findFirst({
            where: {
                id: projectId,
                userId
            }
        });
        if (!project) {
            throw new errors_1.AppError("Project not found.", 404);
        }
    }
    const data = {
        projectId
    };
    if (tags) {
        data.tags = JSON.stringify(tags);
    }
    const updated = await db_1.prisma.imageRecord.updateMany({
        where: {
            userId,
            id: { in: recordIds }
        },
        data
    });
    return {
        ok: true,
        updatedCount: updated.count
    };
}
