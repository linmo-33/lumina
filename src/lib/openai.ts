import {
  createOpenAiCompatibleClient,
  getModelProviderCredentials,
} from "@/lib/model-provider";

export async function createImageApiClient() {
  const provider = await getModelProviderCredentials();
  return createOpenAiCompatibleClient(provider);
}
