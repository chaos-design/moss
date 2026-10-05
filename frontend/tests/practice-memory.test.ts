import { afterEach, describe, expect, it, vi } from "vitest"
import { persistPracticeMemory } from "@/lib/memory/server"

const provider = {
  apiKey: "secret",
  apiType: "chat-completions" as const,
  baseUrl: "https://api.example.com/v1",
  model: "chat-model",
  embeddingModel: "embedding-model",
}

function createClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  return {
    client: {
      from: vi.fn(() => ({ upsert })),
    },
    upsert,
  }
}

function stubEmbedding() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }],
        }),
        { status: 200 },
      ),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("practice memory persistence", () => {
  it("upserts the latest review result with a stable source identity", async () => {
    stubEmbedding()
    const { client, upsert } = createClient()

    await expect(
      persistPracticeMemory({
        client: client as never,
        provider,
        userId: "user-1",
        memory: {
          sourceType: "review",
          sourceId: "clarify-trade-off",
          sceneId: "meeting",
          sceneTitle: "项目会议",
          label: "澄清取舍",
          expression: "Could you clarify the trade-off?",
          explanation: "Ask for the exact point that needs explanation.",
          strength: 68,
          rating: "good",
          successful: true,
        },
      }),
    ).resolves.toBe(true)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        source_type: "review",
        source_id: "clarify-trade-off",
        memory_kind: "review",
        strength: 68,
        metadata: expect.objectContaining({
          rating: "good",
          successful: true,
        }),
      }),
      { onConflict: "user_id,source_type,source_id" },
    )
  })

  it("stores shadowing scores as pronunciation memory metadata", async () => {
    stubEmbedding()
    const { client, upsert } = createClient()

    await persistPracticeMemory({
      client: client as never,
      provider,
      userId: "user-1",
      memory: {
        sourceType: "shadowing",
        sourceId: "shadowing-polite-request",
        sceneId: "coffee",
        sceneTitle: "咖啡店点单",
        label: "please 发音与节奏",
        expression: "Could I get a latte, please?",
        explanation: "Keep the final request light and connected.",
        strength: 59,
        focusWord: "please",
        overallScore: 81,
        clarityScore: 84,
        fluencyScore: 79,
        rhythmScore: 80,
        durationSeconds: 3.2,
      },
    })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "shadowing",
        memory_kind: "pronunciation",
        metadata: expect.objectContaining({
          focusWord: "please",
          overallScore: 81,
          durationSeconds: 3.2,
        }),
      }),
      { onConflict: "user_id,source_type,source_id" },
    )
  })

  it("stores studied library expressions as retrievable expression memory", async () => {
    stubEmbedding()
    const { client, upsert } = createClient()

    await persistPracticeMemory({
      client: client as never,
      provider,
      userId: "user-1",
      memory: {
        sourceType: "expression",
        sourceId: "expression-library-item-1",
        sceneId: "work",
        sceneTitle: "职场协作",
        label: "circle back",
        expression: "circle back",
        explanation: "circle 表示绕回，back 表示稍后再谈。",
        strength: 49,
        libraryKind: "phrasal-verb",
        example: "Let's circle back on this after lunch.",
      },
    })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "expression",
        source_id: "expression-library-item-1",
        memory_kind: "expression_library",
        metadata: expect.objectContaining({
          libraryKind: "phrasal-verb",
          example: "Let's circle back on this after lunch.",
        }),
      }),
      { onConflict: "user_id,source_type,source_id" },
    )
    // 词库内容必须进入 embedding 文本，否则对话 RAG 无法召回。
    const [document] = upsert.mock.calls[0]
    expect(document.content).toContain("circle back")
    expect(document.content).toContain("表达类型：phrasal-verb")
    expect(document.content).toContain("Let's circle back on this after lunch.")
  })
})
