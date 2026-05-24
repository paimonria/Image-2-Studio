"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeHistoryRecords = mergeHistoryRecords;
function mergeHistoryRecords(current, incoming) {
    const seen = new Set();
    const merged = [];
    for (const record of [...current, ...incoming]) {
        if (seen.has(record.id))
            continue;
        seen.add(record.id);
        merged.push(record);
    }
    return merged;
}
