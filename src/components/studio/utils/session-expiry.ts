import type { Locale } from "./copy";

export function isSessionExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("session expired") || message.includes("登录已过期");
}

export function getSessionExpiredMessage(locale: Locale) {
  return locale === "zh" ? "登录已过期，请重新登录。" : "Your session expired. Please sign in again.";
}
