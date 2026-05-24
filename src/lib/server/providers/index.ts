import type { ProviderId } from "../../models";
import type { ImageProvider } from "../provider-types";
import { isProviderConfigured as isProviderConfiguredFromConfig } from "../provider-config";
import { openaiProvider } from "./openai";

export function getProvider(_provider: ProviderId): ImageProvider {
  return openaiProvider;
}

export async function isProviderConfigured(userId: string, provider: ProviderId) {
  return isProviderConfiguredFromConfig(userId, provider);
}
