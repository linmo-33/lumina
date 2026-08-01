import { db } from "@/lib/db";
import { systemSettings } from "@/lib/schema";
import {
  CHATGPT2API_MODELS,
  CHATGPT2API_PAGE_MAX_IMAGES,
  CHATGPT2API_QUALITIES,
  CHATGPT2API_SIZE_OPTIONS,
} from "@/lib/image-options";

export const SUPPORTED_MODELS = CHATGPT2API_MODELS;

export const SUPPORTED_SIZES = CHATGPT2API_SIZE_OPTIONS.map(
  (option) => option.value,
);

export const SUPPORTED_QUALITIES = CHATGPT2API_QUALITIES;

export interface ImageSystemSettings {
  defaultModel: string;
  allowedModels: string[];
  defaultSize: string;
  allowedSizes: string[];
  defaultQuality: string;
  allowedQualities: string[];
  maxImagesPerRequest: number;
  promptMaxLength: number;
  defaultUserQuota: number;
}

export const DEFAULT_SYSTEM_SETTINGS: ImageSystemSettings = {
  defaultModel: "gpt-image-2",
  allowedModels: [...SUPPORTED_MODELS],
  defaultSize: "1024x1024",
  allowedSizes: [...SUPPORTED_SIZES],
  defaultQuality: "auto",
  allowedQualities: [...SUPPORTED_QUALITIES],
  maxImagesPerRequest: CHATGPT2API_PAGE_MAX_IMAGES,
  promptMaxLength: 4000,
  defaultUserQuota: 10,
};

function parseSetting<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getSystemSettings(): Promise<ImageSystemSettings> {
  const rows = await db.select().from(systemSettings);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const defaults = DEFAULT_SYSTEM_SETTINGS;

  return {
    defaultModel: parseSetting(
      values.get("defaultModel") ?? "",
      defaults.defaultModel,
    ),
    allowedModels: parseSetting(
      values.get("allowedModels") ?? "",
      defaults.allowedModels,
    ),
    defaultSize: parseSetting(
      values.get("defaultSize") ?? "",
      defaults.defaultSize,
    ),
    allowedSizes: parseSetting(
      values.get("allowedSizes") ?? "",
      defaults.allowedSizes,
    ),
    defaultQuality: parseSetting(
      values.get("defaultQuality") ?? "",
      defaults.defaultQuality,
    ),
    allowedQualities: parseSetting(
      values.get("allowedQualities") ?? "",
      defaults.allowedQualities,
    ),
    maxImagesPerRequest: Math.min(
      CHATGPT2API_PAGE_MAX_IMAGES,
      Math.max(
        1,
        parseSetting(
          values.get("maxImagesPerRequest") ?? "",
          defaults.maxImagesPerRequest,
        ),
      ),
    ),
    promptMaxLength: parseSetting(
      values.get("promptMaxLength") ?? "",
      defaults.promptMaxLength,
    ),
    defaultUserQuota: parseSetting(
      values.get("defaultUserQuota") ?? "",
      defaults.defaultUserQuota,
    ),
  };
}
