import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { CHATGPT2API_MODELS } from "@/lib/image-options";
import { modelProviders } from "@/lib/schema";

const DEFAULT_PROVIDER_ID = "default";
const PROVIDER_TYPE = "openai_compatible" as const;
const ENCRYPTION_VERSION = "v1";

export interface PublicModelProvider {
  name: string;
  providerType: typeof PROVIDER_TYPE;
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  modelIds: string[];
  modelsUpdatedAt: string | null;
  source: "database" | "environment" | "default";
}

interface ModelProviderCredentials {
  id: string | null;
  name: string;
  baseUrl: string;
  apiKey: string;
}

function getEncryptionSecret() {
  const configuredSecret = process.env.LUMINA_CONFIG_ENCRYPTION_KEY?.trim();
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const secret =
    configuredSecret &&
    configuredSecret !== "please-change-me-to-another-long-random-string"
      ? configuredSecret
      : authSecret;
  if (!secret || secret.length < 32) {
    throw new Error(
      "保存供应商密钥前，请配置至少 32 位的 LUMINA_CONFIG_ENCRYPTION_KEY 或 BETTER_AUTH_SECRET",
    );
  }
  return secret;
}

function getEncryptionKey() {
  return createHash("sha256")
    .update("lumina:model-provider-key:v1\0")
    .update(getEncryptionSecret())
    .digest();
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptApiKey(value: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = value.split(":");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !authTagValue ||
    !ciphertextValue
  ) {
    throw new Error("供应商密钥格式无效，请在后台重新保存密钥");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "无法解密供应商密钥，请确认加密密钥未变更后在后台重新保存",
    );
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("供应商地址仅支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("供应商地址不能包含用户名或密码");
  }
  return url.toString().replace(/\/$/, "");
}

function parseModelIds(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  } catch {
    return [];
  }
}

function getEnvironmentApiKey() {
  const value = process.env.CHATGPT2API_KEY?.trim();
  return value && value !== "your-auth-key" ? value : null;
}

function getApiKeyHint(apiKey: string) {
  return `••••${apiKey.slice(-4)}`;
}

async function getDatabaseProvider() {
  const [provider] = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.id, DEFAULT_PROVIDER_ID))
    .limit(1);
  return provider ?? null;
}

export async function getPublicModelProvider(): Promise<PublicModelProvider> {
  const provider = await getDatabaseProvider();
  if (provider) {
    return {
      name: provider.name,
      providerType: PROVIDER_TYPE,
      baseUrl: provider.baseUrl,
      apiKeyConfigured: Boolean(provider.apiKeyEncrypted),
      apiKeyHint: provider.apiKeyHint,
      modelIds: parseModelIds(provider.modelIds),
      modelsUpdatedAt: provider.modelsUpdatedAt?.toISOString() ?? null,
      source: "database",
    };
  }

  const environmentApiKey = getEnvironmentApiKey();
  const environmentBaseUrl = process.env.CHATGPT2API_BASE_URL?.trim();
  return {
    name: "OpenAI 兼容供应商",
    providerType: PROVIDER_TYPE,
    baseUrl: environmentBaseUrl || "http://localhost:3000/v1",
    apiKeyConfigured: Boolean(environmentApiKey),
    apiKeyHint: environmentApiKey ? getApiKeyHint(environmentApiKey) : null,
    modelIds: [...CHATGPT2API_MODELS],
    modelsUpdatedAt: null,
    source:
      environmentBaseUrl || environmentApiKey ? "environment" : "default",
  };
}

export async function getModelProviderCredentials(): Promise<ModelProviderCredentials> {
  const provider = await getDatabaseProvider();
  if (provider) {
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: decryptApiKey(provider.apiKeyEncrypted),
    };
  }

  return {
    id: null,
    name: "OpenAI 兼容供应商",
    baseUrl:
      process.env.CHATGPT2API_BASE_URL?.trim() ||
      "http://localhost:3000/v1",
    apiKey: getEnvironmentApiKey() || "chatgpt2api",
  };
}

export async function saveModelProvider(input: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  updatedBy: string;
}) {
  const current = await getDatabaseProvider();
  const apiKey =
    input.apiKey?.trim() ||
    (current
      ? decryptApiKey(current.apiKeyEncrypted)
      : getEnvironmentApiKey());
  if (!apiKey) {
    throw new Error("首次保存供应商时必须填写 API Key");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKeyChanged = Boolean(input.apiKey?.trim());
  const connectionChanged =
    !current || current.baseUrl !== baseUrl || apiKeyChanged;
  const now = new Date();
  const encryptedApiKey = encryptApiKey(apiKey);
  const values = {
    id: DEFAULT_PROVIDER_ID,
    name: input.name.trim(),
    providerType: PROVIDER_TYPE,
    baseUrl,
    apiKeyEncrypted: encryptedApiKey,
    apiKeyHint: getApiKeyHint(apiKey),
    modelIds: connectionChanged ? "[]" : current?.modelIds || "[]",
    modelsUpdatedAt: connectionChanged ? null : current?.modelsUpdatedAt,
    updatedBy: input.updatedBy,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };

  await db
    .insert(modelProviders)
    .values(values)
    .onConflictDoUpdate({
      target: modelProviders.id,
      set: {
        name: values.name,
        providerType: values.providerType,
        baseUrl: values.baseUrl,
        apiKeyEncrypted: values.apiKeyEncrypted,
        apiKeyHint: values.apiKeyHint,
        modelIds: values.modelIds,
        modelsUpdatedAt: values.modelsUpdatedAt,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });

  return getPublicModelProvider();
}

export function createOpenAiCompatibleClient(input: {
  baseUrl: string;
  apiKey: string;
}) {
  return new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseUrl,
    timeout: 300_000,
    maxRetries: 1,
    defaultHeaders: {
      "User-Agent": "Lumina/0.1.0",
      "X-Stainless-Lang": null,
      "X-Stainless-Package-Version": null,
      "X-Stainless-OS": null,
      "X-Stainless-Arch": null,
      "X-Stainless-Runtime": null,
      "X-Stainless-Runtime-Version": null,
      "X-Stainless-Retry-Count": null,
      "X-Stainless-Timeout": null,
    },
  });
}

export async function refreshUpstreamModels() {
  const credentials = await getModelProviderCredentials();
  if (!credentials.id) {
    throw new Error("请先在后台保存供应商配置，再获取上游模型");
  }

  const client = createOpenAiCompatibleClient(credentials);
  const result = await client.models.list();
  const modelIds = [
    ...new Set(
      (result.data || [])
        .map((model) => model.id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ].sort((left, right) => left.localeCompare(right));

  if (modelIds.length === 0) {
    throw new Error("上游 /models 接口未返回可用模型");
  }

  const now = new Date();
  await db
    .update(modelProviders)
    .set({
      modelIds: JSON.stringify(modelIds),
      modelsUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(modelProviders.id, credentials.id));

  return getPublicModelProvider();
}
