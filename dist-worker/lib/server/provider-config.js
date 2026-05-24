"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SITE_TITLE = void 0;
exports.sanitizeSiteTitle = sanitizeSiteTitle;
exports.sanitizeFaviconUrl = sanitizeFaviconUrl;
exports.sanitizeLogoUrl = sanitizeLogoUrl;
exports.getPublicBranding = getPublicBranding;
exports.readAppSettings = readAppSettings;
exports.getAppSettings = getAppSettings;
exports.getResolvedProviderConfig = getResolvedProviderConfig;
exports.getProviderApiKey = getProviderApiKey;
exports.getProviderBaseUrl = getProviderBaseUrl;
exports.getProviderModel = getProviderModel;
exports.isProviderConfigured = isProviderConfigured;
exports.getPublicProviderConfig = getPublicProviderConfig;
exports.getPublicPlatformProviderConfig = getPublicPlatformProviderConfig;
exports.getUserProviderSettings = getUserProviderSettings;
exports.saveProviderConfig = saveProviderConfig;
exports.savePlatformProviderConfig = savePlatformProviderConfig;
const crypto_1 = require("./crypto");
const db_1 = require("./db");
exports.DEFAULT_SITE_TITLE = "Image-2 Studio";
function sanitizeSiteTitle(value) {
    if (typeof value !== "string")
        return undefined;
    const title = value.trim();
    if (!title)
        return null;
    return title.slice(0, 80);
}
function sanitizeFaviconUrl(value) {
    if (typeof value !== "string")
        return undefined;
    const url = value.trim();
    if (!url)
        return null;
    const limited = url.slice(0, 500);
    if ((limited.startsWith("/") && !limited.startsWith("//")) || /^https?:\/\//i.test(limited)) {
        return limited;
    }
    return undefined;
}
function sanitizeLogoUrl(value) {
    return sanitizeFaviconUrl(value);
}
function getPublicBranding(settings) {
    return {
        siteTitle: settings.siteTitle?.trim() || exports.DEFAULT_SITE_TITLE,
        faviconUrl: settings.faviconUrl?.trim() || "",
        logoUrl: settings.logoUrl?.trim() || ""
    };
}
function getEnvKey(_provider) {
    return process.env.OPENAI_API_KEY ?? "";
}
function getEnvBaseUrl(_provider) {
    return process.env.OPENAI_BASE_URL ?? "";
}
function getEnvModel(_provider) {
    return process.env.OPENAI_IMAGE_MODEL ?? "";
}
function providerFields(_provider) {
    return {
        key: "openaiKeyEncrypted",
        baseUrl: "openaiBaseUrl",
        model: "openaiModel"
    };
}
function toProviderId(value) {
    return value === "openai" ? value : undefined;
}
const DEFAULT_APP_SETTINGS = {
    id: "settings",
    registrationOpen: false,
    dailyPlatformQuota: 20,
    siteTitle: null,
    faviconUrl: null,
    logoUrl: null
};
async function readAppSettings() {
    return await db_1.prisma.appSetting.findUnique({ where: { id: "settings" } }) ?? DEFAULT_APP_SETTINGS;
}
async function getAppSettings() {
    return db_1.prisma.appSetting.upsert({
        where: { id: "settings" },
        update: {},
        create: { id: "settings" }
    });
}
async function getProviderConfigSnapshot(userId) {
    const [userConfig, platformConfig] = await Promise.all([
        db_1.prisma.providerConfig.findUnique({ where: { userId } }),
        db_1.prisma.platformProviderConfig.findUnique({ where: { id: "platform" } })
    ]);
    return { userConfig, platformConfig };
}
function resolveProviderConfig(provider, snapshot) {
    const fields = providerFields(provider);
    const { userConfig, platformConfig } = snapshot;
    const userEncrypted = userConfig?.[fields.key];
    if (userEncrypted) {
        return {
            apiKey: (0, crypto_1.decryptSecret)(userEncrypted),
            baseUrl: fields.baseUrl ? userConfig?.[fields.baseUrl] ?? "" : "",
            model: userConfig?.[fields.model] ?? "",
            source: "user"
        };
    }
    const platformEncrypted = platformConfig?.[fields.key];
    if (platformEncrypted) {
        return {
            apiKey: (0, crypto_1.decryptSecret)(platformEncrypted),
            baseUrl: fields.baseUrl ? platformConfig[fields.baseUrl] ?? "" : "",
            model: platformConfig[fields.model] ?? "",
            source: "platform"
        };
    }
    const envKey = getEnvKey(provider);
    if (envKey) {
        return {
            apiKey: envKey,
            baseUrl: getEnvBaseUrl(provider),
            model: getEnvModel(provider),
            source: "env"
        };
    }
    return { apiKey: "", baseUrl: "", model: "", source: "none" };
}
async function getResolvedProviderConfig(userId, provider) {
    return resolveProviderConfig(provider, await getProviderConfigSnapshot(userId));
}
async function getProviderApiKey(userId, provider) {
    return (await getResolvedProviderConfig(userId, provider)).apiKey;
}
async function getProviderBaseUrl(userId, provider) {
    return (await getResolvedProviderConfig(userId, provider)).baseUrl;
}
async function getProviderModel(userId, provider) {
    return (await getResolvedProviderConfig(userId, provider)).model;
}
async function isProviderConfigured(userId, provider) {
    return Boolean((await getResolvedProviderConfig(userId, provider)).apiKey);
}
async function getPublicProviderConfig(userId) {
    const snapshot = await getProviderConfigSnapshot(userId);
    const { userConfig } = snapshot;
    const providers = ["openai"];
    const resolvedPairs = providers.map((provider) => [provider, resolveProviderConfig(provider, snapshot)]);
    const resolvedOpenAI = resolvedPairs.find(([provider]) => provider === "openai")?.[1];
    return {
        activeProvider: toProviderId(userConfig?.activeProvider),
        baseUrls: {
            openai: userConfig?.openaiBaseUrl ?? resolvedOpenAI?.baseUrl ?? ""
        },
        models: {
            openai: userConfig?.openaiModel ?? resolvedOpenAI?.model ?? ""
        },
        supportsCustomSize: {
            openai: Boolean(resolvedOpenAI?.baseUrl)
        },
        keys: resolvedPairs.reduce((acc, [provider, resolved]) => {
            acc[provider] = {
                configured: Boolean(resolved.apiKey),
                source: resolved.source
            };
            return acc;
        }, {
            openai: { configured: false, source: "none" }
        })
    };
}
async function getPublicPlatformProviderConfig() {
    const platformConfig = await db_1.prisma.platformProviderConfig.findUnique({ where: { id: "platform" } });
    return {
        baseUrls: {
            openai: platformConfig?.openaiBaseUrl ?? ""
        },
        models: {
            openai: platformConfig?.openaiModel ?? ""
        },
        keys: {
            openai: {
                configured: Boolean(platformConfig?.openaiKeyEncrypted)
            }
        }
    };
}
async function getUserProviderSettings(userId) {
    const userConfig = await db_1.prisma.providerConfig.findUnique({ where: { userId } });
    const hasOpenAIKey = Boolean(userConfig?.openaiKeyEncrypted);
    return {
        activeProvider: toProviderId(userConfig?.activeProvider),
        baseUrls: {
            openai: userConfig?.openaiBaseUrl ?? ""
        },
        models: {
            openai: userConfig?.openaiModel ?? ""
        },
        keys: {
            openai: {
                configured: hasOpenAIKey,
                source: hasOpenAIKey ? "user" : "none"
            }
        }
    };
}
async function saveProviderConfig(userId, input) {
    const current = await db_1.prisma.providerConfig.findUnique({ where: { userId } });
    const data = {
        activeProvider: input.activeProvider ?? current?.activeProvider ?? undefined,
        openaiKeyEncrypted: current?.openaiKeyEncrypted ?? undefined,
        openaiBaseUrl: current?.openaiBaseUrl ?? undefined,
        openaiModel: current?.openaiModel ?? undefined
    };
    if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
        data.openaiKeyEncrypted = (0, crypto_1.encryptSecret)(input.keys.openai.trim());
    }
    if (typeof input.baseUrls?.openai === "string") {
        data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || null;
    }
    if (typeof input.models?.openai === "string") {
        data.openaiModel = input.models.openai.trim() || null;
    }
    await db_1.prisma.providerConfig.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data
    });
    return getUserProviderSettings(userId);
}
async function savePlatformProviderConfig(input) {
    const current = await db_1.prisma.platformProviderConfig.findUnique({ where: { id: "platform" } });
    const data = {
        openaiKeyEncrypted: current?.openaiKeyEncrypted ?? undefined,
        openaiBaseUrl: current?.openaiBaseUrl ?? undefined,
        openaiModel: current?.openaiModel ?? undefined
    };
    if (typeof input.keys?.openai === "string" && input.keys.openai.trim()) {
        data.openaiKeyEncrypted = (0, crypto_1.encryptSecret)(input.keys.openai.trim());
    }
    if (typeof input.baseUrls?.openai === "string") {
        data.openaiBaseUrl = input.baseUrls.openai.trim().replace(/\/+$/, "") || null;
    }
    if (typeof input.models?.openai === "string") {
        data.openaiModel = input.models.openai.trim() || null;
    }
    return db_1.prisma.platformProviderConfig.upsert({
        where: { id: "platform" },
        create: { id: "platform", ...data },
        update: data
    });
}
