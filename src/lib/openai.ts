import OpenAI from "openai";

export function createChatgpt2ApiClient() {
  const baseURL = process.env.CHATGPT2API_BASE_URL || "http://localhost:3000/v1";
  const apiKey = process.env.CHATGPT2API_KEY || "chatgpt2api";

  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 300_000, // 生图可能较慢，5 分钟超时
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
