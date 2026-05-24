"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_PACKAGE_VERSION = void 0;
exports.getAppVersion = getAppVersion;
exports.APP_PACKAGE_VERSION = "1.2.18";
function getAppVersion(env = process.env) {
    return env.APP_VERSION
        || env.IMAGE_TAG
        || env.npm_package_version
        || exports.APP_PACKAGE_VERSION;
}
