"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonError = jsonError;
exports.handleRouteError = handleRouteError;
const server_1 = require("next/server");
const errors_1 = require("./errors");
const GENERIC_ROUTE_ERROR_MESSAGE = "Request failed.";
function jsonError(message, status = 400) {
    return server_1.NextResponse.json({ error: message }, { status });
}
function handleRouteError(error, env = process.env) {
    if (error instanceof errors_1.AppError) {
        return jsonError(error.message, error.status);
    }
    console.error("[route] Unexpected error", error);
    const message = env.NODE_ENV === "production"
        ? GENERIC_ROUTE_ERROR_MESSAGE
        : (error instanceof Error && error.message ? error.message : GENERIC_ROUTE_ERROR_MESSAGE);
    return jsonError(message, 500);
}
