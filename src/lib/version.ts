export const APP_PACKAGE_VERSION = "1.2.18";

export function getAppVersion(env: NodeJS.ProcessEnv = process.env) {
  return env.APP_VERSION
    || env.IMAGE_TAG
    || env.npm_package_version
    || APP_PACKAGE_VERSION;
}
