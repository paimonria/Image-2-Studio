"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_CONFIG_FILE = exports.HISTORY_FILE = exports.DATA_DIR = exports.STORAGE_UPLOADS_DIR = exports.STORAGE_GENERATED_DIR = exports.STORAGE_DIR = exports.UPLOADS_DIR = exports.GENERATED_DIR = exports.PUBLIC_DIR = exports.ROOT_DIR = void 0;
exports.publicPathToFilePath = publicPathToFilePath;
const node_path_1 = __importDefault(require("node:path"));
exports.ROOT_DIR = process.cwd();
exports.PUBLIC_DIR = node_path_1.default.join(exports.ROOT_DIR, "public");
exports.GENERATED_DIR = node_path_1.default.join(exports.PUBLIC_DIR, "generated");
exports.UPLOADS_DIR = node_path_1.default.join(exports.PUBLIC_DIR, "uploads");
exports.STORAGE_DIR = node_path_1.default.join(exports.ROOT_DIR, "storage");
exports.STORAGE_GENERATED_DIR = node_path_1.default.join(exports.STORAGE_DIR, "generated");
exports.STORAGE_UPLOADS_DIR = node_path_1.default.join(exports.STORAGE_DIR, "uploads");
exports.DATA_DIR = node_path_1.default.join(exports.ROOT_DIR, "data");
exports.HISTORY_FILE = node_path_1.default.join(exports.DATA_DIR, "images.json");
exports.PROVIDER_CONFIG_FILE = node_path_1.default.join(exports.DATA_DIR, "provider-config.json");
function publicPathToFilePath(publicPath) {
    const normalized = publicPath.replace(/^\//, "").replaceAll("/", node_path_1.default.sep);
    const resolved = node_path_1.default.resolve(exports.PUBLIC_DIR, normalized.replace(/^public[\\/]/, ""));
    if (!resolved.startsWith(exports.PUBLIC_DIR)) {
        throw new Error("Invalid public path.");
    }
    return resolved;
}
