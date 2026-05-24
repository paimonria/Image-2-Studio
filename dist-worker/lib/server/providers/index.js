"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
exports.isProviderConfigured = isProviderConfigured;
const provider_config_1 = require("../provider-config");
const openai_1 = require("./openai");
function getProvider(_provider) {
    return openai_1.openaiProvider;
}
async function isProviderConfigured(userId, provider) {
    return (0, provider_config_1.isProviderConfigured)(userId, provider);
}
