"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiProvider = void 0;
const openai_1 = __importDefault(require("openai"));
function getClient(request) {
    const apiKey = request.credentials.apiKey;
    if (!apiKey) {
        throw new Error("OpenAI provider is not configured. Set OPENAI_API_KEY.");
    }
    return new openai_1.default({
        apiKey,
        baseURL: request.credentials.baseUrl || undefined,
        maxRetries: 0
    });
}
function inputImageToFile(image) {
    const blob = new Blob([image.buffer], { type: image.mimeType });
    return new File([blob], image.filename, { type: image.mimeType });
}
function compactPayload(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}
function isOpenAICompatibleGateway(request) {
    return Boolean(request.credentials.baseUrl);
}
function getCommonPayload(request) {
    const payload = {
        model: request.model.modelId,
        prompt: request.prompt,
        size: request.size,
        quality: request.quality
    };
    if (!isOpenAICompatibleGateway(request)) {
        payload.output_format = "png";
    }
    return compactPayload(payload);
}
function parseDataUrl(value) {
    const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
    if (!match)
        return null;
    return {
        imageBuffer: Buffer.from(match[2], "base64"),
        mimeType: match[1] || "image/png"
    };
}
async function fetchImageUrl(url) {
    const dataUrl = parseDataUrl(url);
    if (dataUrl)
        return dataUrl;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OpenAI image URL download failed: ${response.status} ${response.statusText}`.trim());
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return { imageBuffer, mimeType };
}
async function getImageResult(response) {
    const firstImage = response.data?.[0];
    const b64 = firstImage?.b64_json;
    if (b64) {
        return {
            imageBuffer: Buffer.from(b64, "base64"),
            mimeType: "image/png"
        };
    }
    if (firstImage?.url) {
        return fetchImageUrl(firstImage.url);
    }
    throw new Error("OpenAI did not return image data.");
}
exports.openaiProvider = {
    async createImage(request) {
        const client = getClient(request);
        const common = getCommonPayload(request);
        if (request.mode === "text-to-image") {
            const response = await client.images.generate(common);
            const result = await getImageResult(response);
            return {
                ...result,
                providerMeta: {
                    revisedPrompt: response.data?.[0]?.revised_prompt ?? null
                }
            };
        }
        if (request.inputImages.length === 0) {
            throw new Error("Image-to-image needs at least one reference image.");
        }
        const files = request.inputImages.map(inputImageToFile);
        const editPayload = compactPayload({
            ...common,
            image: files.length === 1 ? files[0] : files,
            input_fidelity: isOpenAICompatibleGateway(request) ? undefined : request.inputFidelity
        });
        const response = await client.images.edit({
            ...editPayload
        });
        const result = await getImageResult(response);
        return {
            ...result,
            providerMeta: {
                revisedPrompt: response.data?.[0]?.revised_prompt ?? null
            }
        };
    }
};
