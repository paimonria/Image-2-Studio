"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getString = getString;
exports.getOptionalString = getOptionalString;
exports.isOpenAiCompatibleGateway = isOpenAiCompatibleGateway;
exports.assertOfficialOpenAiSize = assertOfficialOpenAiSize;
exports.assertModelOptions = assertModelOptions;
exports.validateModelRequest = validateModelRequest;
exports.parseJobRequest = parseJobRequest;
exports.resolveModelForJob = resolveModelForJob;
exports.loadInputImages = loadInputImages;
exports.getBatchStartPromptErrorMessage = getBatchStartPromptErrorMessage;
exports.resolveImageJobFormInput = resolveImageJobFormInput;
exports.buildImageJobRequest = buildImageJobRequest;
const models_1 = require("../models");
const batch_start_1 = require("../batch-start");
const errors_1 = require("./errors");
const files_1 = require("./files");
const history_1 = require("./history");
const provider_config_1 = require("./provider-config");
const MAX_PROMPT_LENGTH = 2000;
const MAX_REFERENCE_IMAGES = 4;
const OPENAI_OFFICIAL_IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);
function getString(formData, key) {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
}
function getOptionalString(formData, key) {
    const value = getString(formData, key);
    return value || undefined;
}
function getStringList(formData, key) {
    return formData
        .getAll(key)
        .flatMap((value) => {
        if (typeof value !== "string")
            return [];
        const trimmed = value.trim();
        if (!trimmed)
            return [];
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
            }
            catch {
                return [];
            }
        }
        return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    });
}
function getFiles(formData) {
    return formData
        .getAll("files")
        .filter((value) => value instanceof File && value.size > 0);
}
function isAllowedOption(value, allowed) {
    return !value || !allowed || allowed.includes(value);
}
function mapAspectRatioToOfficialOpenAiSize(aspectRatio) {
    if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1")
        return "1024x1024";
    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    if (!rawWidth || !rawHeight)
        return "1024x1024";
    if (rawWidth > rawHeight)
        return "1536x1024";
    if (rawHeight > rawWidth)
        return "1024x1536";
    return "1024x1024";
}
function mapAspectRatioToResolutionSize(aspectRatio, resolution) {
    const longEdge = Number.parseInt(resolution ?? "", 10);
    const safeLongEdge = Number.isFinite(longEdge) && longEdge > 0 ? longEdge : 1024;
    if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1")
        return `${safeLongEdge}x${safeLongEdge}`;
    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    if (!rawWidth || !rawHeight)
        return `${safeLongEdge}x${safeLongEdge}`;
    if (rawWidth >= rawHeight) {
        return `${safeLongEdge}x${Math.round((safeLongEdge * rawHeight) / rawWidth)}`;
    }
    return `${Math.round((safeLongEdge * rawWidth) / rawHeight)}x${safeLongEdge}`;
}
function resolveImageRequestSize(provider, resolvedProvider, aspectRatio, resolution, requestedSize) {
    if (provider !== "openai")
        return requestedSize;
    if (isOpenAiCompatibleGateway(resolvedProvider)) {
        return resolution ? mapAspectRatioToResolutionSize(aspectRatio, resolution) : requestedSize;
    }
    if (!resolution || resolution === "1024")
        return mapAspectRatioToOfficialOpenAiSize(aspectRatio);
    return mapAspectRatioToResolutionSize(aspectRatio, resolution);
}
function isOpenAiCompatibleGateway(resolvedProvider) {
    return Boolean(resolvedProvider.baseUrl);
}
function assertOfficialOpenAiSize(size) {
    if (!size || OPENAI_OFFICIAL_IMAGE_SIZES.has(size))
        return;
    throw new errors_1.AppError("Official OpenAI image generation does not support this resolution. Configure an OpenAI-compatible Base URL for 2K/4K output, or choose 1K.", 400);
}
function assertModelOptions(model, input) {
    if (!input.allowCustomSize && !isAllowedOption(input.size, model.supportedSizes)) {
        throw new errors_1.AppError("This model does not support that size.");
    }
    if (!isAllowedOption(input.aspectRatio, model.supportedAspectRatios)) {
        throw new errors_1.AppError("This model does not support that aspect ratio.");
    }
    if (!isAllowedOption(input.quality, model.qualityOptions)) {
        throw new errors_1.AppError("This model does not support that quality setting.");
    }
    if (!isAllowedOption(input.inputFidelity, model.inputFidelityOptions)) {
        throw new errors_1.AppError("This model does not support that input fidelity.");
    }
}
function validateModelRequest(provider, modelId, mode, resolvedProvider) {
    const model = (0, models_1.getModel)(provider, modelId)
        ?? (provider === "openai" && resolvedProvider.model && resolvedProvider.model === modelId
            ? (0, models_1.createOpenAICompatibleModel)(resolvedProvider.model)
            : undefined);
    if (!model) {
        throw new errors_1.AppError("Unknown provider or model.");
    }
    if (!(0, models_1.modelSupports)(model, mode)) {
        throw new errors_1.AppError("This model does not support that mode.");
    }
    return model;
}
function parseJobRequest(requestJson) {
    let parsed;
    try {
        parsed = JSON.parse(requestJson);
    }
    catch {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    if (!parsed || typeof parsed !== "object") {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    const input = parsed;
    const provider = typeof input.provider === "string" ? input.provider : null;
    const mode = typeof input.mode === "string" ? input.mode : null;
    if (!(0, models_1.isProviderId)(provider) || !(0, models_1.isImageMode)(mode) || typeof input.modelId !== "string") {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    return {
        provider,
        modelId: input.modelId,
        mode,
        prompt: typeof input.prompt === "string" ? input.prompt : "",
        size: typeof input.size === "string" ? input.size : undefined,
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
        resolution: typeof input.resolution === "string" ? input.resolution : undefined,
        quality: typeof input.quality === "string" ? input.quality : undefined,
        inputFidelity: typeof input.inputFidelity === "string" ? input.inputFidelity : undefined,
        sourceImageIds: Array.isArray(input.sourceImageIds) ? input.sourceImageIds.filter((item) => typeof item === "string") : [],
        uploadImageIds: Array.isArray(input.uploadImageIds) ? input.uploadImageIds.filter((item) => typeof item === "string") : [],
        customModel: Boolean(input.customModel),
        platformQuotaDate: typeof input.platformQuotaDate === "string" ? input.platformQuotaDate : undefined
    };
}
function resolveModelForJob(input) {
    const catalogModel = (0, models_1.getModel)(input.provider, input.modelId);
    if (catalogModel)
        return catalogModel;
    if (input.customModel && input.provider === "openai") {
        return (0, models_1.createOpenAICompatibleModel)(input.modelId);
    }
    return undefined;
}
async function loadInputImages(userId, sourceImageIds, uploadImageIds) {
    const sourceInputs = await Promise.all(sourceImageIds.map((id) => (0, files_1.readStoredImageForUser)(userId, id)));
    const uploadedInputs = await Promise.all(uploadImageIds.map((id) => (0, files_1.readStoredImageForUser)(userId, id)));
    return [...sourceInputs, ...uploadedInputs].map((file) => ({
        filename: file.filename,
        mimeType: file.mimeType,
        buffer: file.buffer,
        publicUrl: file.imageUrl
    }));
}
async function assertSourceImagesExist(userId, sourceImageIds) {
    if (sourceImageIds.length === 0)
        return;
    const records = await (0, history_1.findRecordsByIds)(userId, sourceImageIds);
    const foundIds = new Set(records.map((record) => record.id));
    const missing = sourceImageIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new errors_1.AppError("Could not find the selected source image.");
    }
}
function getBatchStartPromptErrorMessage(error) {
    if (error === "too-many")
        return `Use ${batch_start_1.BATCH_START_MAX_PROMPTS} prompts or fewer.`;
    if (error === "too-long")
        return `Each prompt must be ${batch_start_1.BATCH_START_MAX_PROMPT_LENGTH} characters or fewer.`;
    return "Enter at least one prompt.";
}
async function resolveImageJobFormInput(userId, formData, prompt) {
    const providerValue = getString(formData, "provider");
    const modelId = getString(formData, "model");
    const modeValue = getString(formData, "mode");
    if (!(0, models_1.isProviderId)(providerValue)) {
        throw new errors_1.AppError("Choose a valid provider.");
    }
    if (!(0, models_1.isImageMode)(modeValue)) {
        throw new errors_1.AppError("Choose a valid generation mode.");
    }
    if (!prompt) {
        throw new errors_1.AppError("Enter a prompt.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new errors_1.AppError(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    }
    const resolvedProvider = await (0, provider_config_1.getResolvedProviderConfig)(userId, providerValue);
    if (!resolvedProvider.apiKey) {
        throw new errors_1.AppError("This provider has no API key configured.", 503);
    }
    const model = validateModelRequest(providerValue, modelId, modeValue, resolvedProvider);
    const aspectRatio = getOptionalString(formData, "aspectRatio") ?? model.defaultAspectRatio;
    const resolution = getOptionalString(formData, "resolution");
    const requestedSize = getOptionalString(formData, "size")
        ?? mapAspectRatioToResolutionSize(aspectRatio, resolution)
        ?? model.defaultSize;
    const size = resolveImageRequestSize(providerValue, resolvedProvider, aspectRatio, resolution, requestedSize);
    const quality = getOptionalString(formData, "quality") ?? model.defaultQuality;
    const inputFidelity = getOptionalString(formData, "inputFidelity") ?? model.inputFidelityOptions?.[0];
    const allowCustomSize = providerValue === "openai" && isOpenAiCompatibleGateway(resolvedProvider);
    if (providerValue === "openai" && !allowCustomSize) {
        assertOfficialOpenAiSize(size);
    }
    assertModelOptions(model, { size, aspectRatio, quality, inputFidelity, allowCustomSize });
    const files = getFiles(formData);
    const sourceImageIds = getStringList(formData, "sourceImageIds");
    for (const file of files) {
        (0, files_1.assertAllowedImageFile)(file);
    }
    if (files.length + sourceImageIds.length > MAX_REFERENCE_IMAGES) {
        throw new errors_1.AppError(`Use at most ${MAX_REFERENCE_IMAGES} reference images.`);
    }
    if (modeValue === "image-to-image" && files.length + sourceImageIds.length === 0) {
        throw new errors_1.AppError("Image-to-image needs an upload or a history image.");
    }
    await assertSourceImagesExist(userId, sourceImageIds);
    return {
        provider: providerValue,
        model,
        mode: modeValue,
        prompt,
        size,
        aspectRatio,
        resolution,
        quality,
        inputFidelity,
        sourceImageIds,
        files,
        resolvedProvider
    };
}
function buildImageJobRequest(input, prompt, uploadImageIds, platformQuotaDate) {
    return {
        provider: input.provider,
        modelId: input.model.modelId,
        mode: input.mode,
        prompt,
        size: input.size,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        quality: input.quality,
        inputFidelity: input.inputFidelity,
        sourceImageIds: input.sourceImageIds,
        uploadImageIds,
        customModel: !(0, models_1.getModel)(input.provider, input.model.modelId),
        platformQuotaDate
    };
}
