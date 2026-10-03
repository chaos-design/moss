import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createConversationPrompt,
  createEmbedding,
  mergeConversationMemories,
  resolveConversationMemory,
  retrieveLongTermMemories,
} from "@/lib/memory/server"

const provider = {
  apiKey: "secret",
  apiType: "chat-completions" as const,
  baseUrl: "https://api.example.com/v1/",
  model: "chat-model",
  embeddingModel: "embedding-model",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("memory RAG", () => {
  it("requests a 1536-dimensional embedding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const embedding = await createEmbedding("coffee request", provider)

    expect(embedding).toHaveLength(1536)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/embeddings",
      expect.objectContaining({
        body: expect.stringContaining('"dimensions":1536'),
      }),
    )
  })

  it("maps vector matches into long-term conversation memory", async () => {
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
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "memory-1",
          content: "Could I get ..., please?",
          scene_id: "coffee",
          memory_kind: "successful_expression",
          strength: 68,
          similarity: 0.87,
          metadata: {
            label: "礼貌请求",
            expression: "Could I get ..., please?",
            explanation: "服务场景中更自然。",
            sceneTitle: "咖啡店点单",
          },
        },
      ],
      error: null,
    })

    const memories = await retrieveLongTermMemories({
      client: { rpc } as never,
      provider,
      query: "order a coffee politely",
      sceneId: "coffee",
    })

    expect(memories[0]).toMatchObject({
      id: "memory-1",
      label: "礼貌请求",
      source: "咖啡店点单",
      strength: 68,
    })
    expect(rpc).toHaveBeenCalledWith(
      "match_long_term_memories",
      expect.objectContaining({
        p_scene_id: "coffee",
        p_match_count: 5,
      }),
    )
  })

  it("deduplicates local and retrieved memories by expression", () => {
    const local = {
      id: "local",
      label: "礼貌请求",
      expression: "Could I get ..., please?",
      source: "餐厅用餐",
      guidance: "本地记忆",
      strength: 42,
    }
    const retrieved = {
      ...local,
      id: "remote",
      source: "咖啡店点单",
      guidance: "向量召回",
      strength: 70,
    }

    expect(mergeConversationMemories([local], [retrieved])).toEqual([local])
  })

  it("keeps the prioritized local memory when vector retrieval fills the limit", () => {
    const local = {
      id: "target",
      label: "目标表达",
      expression: "Could I get something, please?",
      source: "咖啡店点单",
      guidance: "本轮迁移目标",
      strength: 42,
    }
    const retrieved = Array.from({ length: 5 }, (_, index) => ({
      id: `retrieved-${index}`,
      label: `召回 ${index}`,
      expression: `Retrieved expression ${index}`,
      source: "向量记忆",
      guidance: "相似表达",
      strength: 50 + index,
    }))

    const merged = mergeConversationMemories([local], retrieved)

    expect(merged).toHaveLength(5)
    expect(merged[0]?.id).toBe("target")
  })

  it("keeps local memory when vector retrieval fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("embedding unavailable")))
    const local = {
      id: "local",
      label: "礼貌请求",
      expression: "Could I get ..., please?",
      source: "餐厅用餐",
      guidance: "迁移到咖啡店",
      strength: 42,
    }

    await expect(
      resolveConversationMemory({
        client: {} as never,
        provider,
        localMemory: [local],
        query: "order coffee",
        sceneId: "coffee",
      }),
    ).resolves.toEqual([local])
  })

  it("injects conversation context into the Markdown prompt template", () => {
    const prompt = createConversationPrompt(
      {
        sceneId: "coffee",
        language: "bilingual",
        messages: [{ role: "user", content: "A latte, please." }],
      },
      [],
    )

    expect(prompt).toContain("# Moss Conversation Agent")
    expect(prompt).toContain("A latte, please.")
    expect(prompt).toContain("Do not use emoji")
    expect(prompt).toContain("Coach gently after responding to meaning.")
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it("renders tutor behavior in the dynamic prompt context", () => {
    const naturalPrompt = createConversationPrompt(
      {
        sceneId: "coffee",
        language: "auto",
        tutorMode: "natural",
        messages: [{ role: "user", content: "I want latte." }],
      },
      [],
    )
    const englishPrompt = createConversationPrompt(
      {
        sceneId: "coffee",
        language: "auto",
        tutorMode: "english",
        messages: [{ role: "user", content: "我想点一杯咖啡" }],
      },
      [],
    )

    expect(naturalPrompt).toContain("Prioritize uninterrupted role-play.")
    expect(englishPrompt).toContain("Maintain full English immersion.")
    expect(englishPrompt).toContain(
      "Use English in every learner-facing field and leave translation empty",
    )
  })

  it("includes the complete idiomatic expression set in its scene prompt", () => {
    const prompt = createConversationPrompt(
      {
        sceneId: "idiomatic-english",
        language: "bilingual",
        messages: [{ role: "user", content: "Can we talk about the project?" }],
      },
      [],
    )

    expect(prompt).toContain("keep tabs on")
    expect(prompt).toContain("take a rain check")
    expect(prompt).toContain("ballpark figure")
    expect(prompt).toContain("quick win")
  })

  it("keeps the static prompt prefix stable before runtime variables", () => {
    const coffeePrompt = createConversationPrompt(
      {
        sceneId: "coffee",
        language: "bilingual",
        messages: [{ role: "user", content: "A latte, please." }],
      },
      [],
    )
    const meetingPrompt = createConversationPrompt(
      {
        sceneId: "meeting",
        language: "english",
        tutorMode: "english",
        messages: [{ role: "user", content: "I need another week." }],
      },
      [],
    )
    const runtimeMarker = "## Runtime Context"

    expect(coffeePrompt.split(runtimeMarker)[0]).toBe(meetingPrompt.split(runtimeMarker)[0])
    expect(coffeePrompt.indexOf(runtimeMarker)).toBeGreaterThan(
      coffeePrompt.indexOf("## Output Contract"),
    )
  })
})
