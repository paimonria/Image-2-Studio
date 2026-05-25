import type { ImageMode } from "@/lib/models";
import type { Locale } from "./copy";

export const BATCH_PROMPT_START = "---PROMPT---";
export const BATCH_PROMPT_END = "---END---";

export function parseBatchPrompts(value: string): { prompts: string[]; errorKey?: string } {
  const normalized = value.replace(/\r\n/g, "\n");
  const hasStart = normalized.includes(BATCH_PROMPT_START);
  const hasEnd = normalized.includes(BATCH_PROMPT_END);

  if (!hasStart && !hasEnd) {
    return {
      prompts: normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    };
  }

  if (!hasStart || !hasEnd) {
    return { prompts: [], errorKey: "batchFormatIncomplete" };
  }

  const prompts: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const startIndex = normalized.indexOf(BATCH_PROMPT_START, cursor);

    if (startIndex === -1) {
      return normalized.slice(cursor).trim()
        ? { prompts: [], errorKey: "batchFormatOutsideText" }
        : { prompts };
    }

    if (normalized.slice(cursor, startIndex).trim()) {
      return { prompts: [], errorKey: "batchFormatOutsideText" };
    }

    const promptStart = startIndex + BATCH_PROMPT_START.length;
    const endIndex = normalized.indexOf(BATCH_PROMPT_END, promptStart);

    if (endIndex === -1) {
      return { prompts: [], errorKey: "batchFormatIncomplete" };
    }

    const prompt = normalized.slice(promptStart, endIndex).trim();
    if (!prompt) {
      return { prompts: [], errorKey: "batchFormatEmptyBlock" };
    }

    prompts.push(prompt);
    cursor = endIndex + BATCH_PROMPT_END.length;
  }

  return { prompts };
}

export function getBatchPromptTemplate(mode: ImageMode, locale: Locale) {
  if (mode === "image-to-image") {
    return locale === "zh"
      ? `${BATCH_PROMPT_START}\n把背景改成冬日阳光。\n保持主体形状不变。\n添加柔和的棚拍倒影。\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\n让画面更像杂志封面。\n保留原主体和干净边缘。\n${BATCH_PROMPT_END}`
      : `${BATCH_PROMPT_START}\nChange the background to winter sunlight.\nKeep the product shape unchanged.\nAdd a soft studio reflection.\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\nMake the image feel like an editorial magazine cover.\nPreserve the original subject and clean edges.\n${BATCH_PROMPT_END}`;
  }

  return locale === "zh"
    ? `${BATCH_PROMPT_START}\n主体：晨雾中的玻璃温室\n场景：柔和晨光、湿润石板路、空气有薄雾\n风格：电影感产品海报，细节丰富\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\n主体：海边黄昏的银色跑车\n场景：低机位、远处海平线、车身反射夕阳\n风格：高端汽车杂志大片\n${BATCH_PROMPT_END}`
    : `${BATCH_PROMPT_START}\nSubject: glass greenhouse\nScene: morning mist, soft sunlight, wet stone path\nStyle: cinematic product poster, rich detail\n${BATCH_PROMPT_END}\n\n${BATCH_PROMPT_START}\nSubject: silver roadster\nScene: dusk by the sea, low camera angle\nStyle: editorial automotive photo\n${BATCH_PROMPT_END}`;
}

export function getPromptFormat(value: string) {
  return value.includes(BATCH_PROMPT_START) || value.includes(BATCH_PROMPT_END) ? "blocks" : "lines";
}
