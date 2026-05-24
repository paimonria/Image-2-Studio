"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_CATALOG = exports.COMMON_ASPECT_RATIOS = exports.PROVIDERS = void 0;
exports.getModelsForProvider = getModelsForProvider;
exports.getModel = getModel;
exports.createOpenAICompatibleModel = createOpenAICompatibleModel;
exports.modelSupports = modelSupports;
exports.isProviderId = isProviderId;
exports.isImageMode = isImageMode;
exports.PROVIDERS = [
    { provider: "openai", label: "OpenAI" }
];
exports.COMMON_ASPECT_RATIOS = ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "1:2", "2:1"];
exports.MODEL_CATALOG = [
    {
        provider: "openai",
        modelId: "gpt-image-2",
        label: "GPT Image 2",
        description: "OpenAI image model for generation, reference images, and iterative edits.",
        capabilities: ["text-to-image", "image-to-image", "continue-edit"],
        defaultSize: "1024x1024",
        supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
        defaultAspectRatio: "3:4",
        supportedAspectRatios: exports.COMMON_ASPECT_RATIOS,
        defaultQuality: "medium",
        qualityOptions: ["low", "medium", "high"],
        inputFidelityOptions: ["high", "low"],
        supportsCustomSize: false
    }
];
function getModelsForProvider(provider) {
    return exports.MODEL_CATALOG.filter((model) => model.provider === provider);
}
function getModel(provider, modelId) {
    return exports.MODEL_CATALOG.find((model) => model.provider === provider && model.modelId === modelId);
}
function createOpenAICompatibleModel(modelId) {
    return {
        provider: "openai",
        modelId,
        label: modelId,
        description: "OpenAI-compatible image model from custom provider settings.",
        capabilities: ["text-to-image", "image-to-image", "continue-edit"],
        defaultSize: "1024x1024",
        supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
        defaultAspectRatio: "3:4",
        supportedAspectRatios: exports.COMMON_ASPECT_RATIOS,
        defaultQuality: "medium",
        qualityOptions: ["low", "medium", "high"],
        inputFidelityOptions: ["high", "low"],
        supportsCustomSize: true
    };
}
function modelSupports(model, capability) {
    return Boolean(model?.capabilities.includes(capability));
}
function isProviderId(value) {
    return value === "openai";
}
function isImageMode(value) {
    return value === "text-to-image" || value === "image-to-image";
}
