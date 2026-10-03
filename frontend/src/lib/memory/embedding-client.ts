import type { AiProviderConfig } from "@/lib/ai-provider"

const embeddingDimensions = 1536
const maximumEmbeddingInputLength = 6_000

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "")
}

export async function createEmbedding(
  value: string,
  provider: AiProviderConfig,
): Promise<number[] | null> {
  if (!provider.embeddingModel) {
    return null
  }

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.embeddingModel,
      input: value.trim().slice(0, maximumEmbeddingInputLength),
      dimensions: embeddingDimensions,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`Embedding provider returned ${response.status}`)
  }

  const body = (await response.json()) as {
    data?: Array<{ embedding?: unknown }>
  }
  const embedding = body.data?.[0]?.embedding
  if (
    !Array.isArray(embedding) ||
    embedding.length !== embeddingDimensions ||
    !embedding.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    throw new Error("Embedding provider returned an invalid vector")
  }

  return embedding
}
