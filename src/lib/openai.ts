import OpenAI from "openai";

export function createChatgpt2ApiClient() {
  const baseURL = process.env.CHATGPT2API_BASE_URL || "http://localhost:3000/v1";
  const apiKey = process.env.CHATGPT2API_KEY || "chatgpt2api";

  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 300_000, // 生图可能较慢，5 分钟超时
    maxRetries: 1,
  });
}
