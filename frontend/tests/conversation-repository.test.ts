import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import type { ConversationSession } from "@/lib/conversation-history"
import {
  conversationHistoryPageSize,
  listConversationSessions,
  parseCloudConversationRows,
  upsertConversationSession,
} from "@/lib/server/conversation-repository"

const session: ConversationSession = {
  id: "coffee-session-1",
  sceneId: "coffee",
  sceneTitle: "咖啡店点单",
  partnerName: "Mia",
  startedAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:05:00.000Z",
  durationSeconds: 42,
  status: "completed",
  messages: [
    {
      id: "question",
      role: "user",
      content: "Could I get a latte?",
      inputMode: "voice",
      translation: "",
      note: "",
      timestamp: "00:08",
    },
  ],
}

describe("conversation repository", () => {
  it("parses cloud rows into portable conversation sessions", () => {
    expect(
      parseCloudConversationRows([
        {
          client_id: session.id,
          scene_key: session.sceneId,
          title: session.sceneTitle,
          status: session.status,
          context_snapshot: {
            durationSeconds: session.durationSeconds,
            partnerName: session.partnerName,
          },
          started_at: session.startedAt,
          last_message_at: session.updatedAt,
          conversation_messages: [
            {
              client_id: "answer",
              role: "assistant",
              content: "Hot or iced?",
              translation: "热的还是冰的？",
              correction: { note: "", position: 1, timestamp: "00:10" },
            },
            {
              client_id: "question",
              role: "user",
              content: "Could I get a latte?",
              translation: null,
              correction: {
                inputMode: "voice",
                note: "",
                position: 0,
                timestamp: "00:08",
              },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        ...session,
        messages: [
          session.messages[0],
          {
            id: "answer",
            role: "assistant",
            content: "Hot or iced?",
            translation: "热的还是冰的？",
            note: "",
            timestamp: "00:10",
          },
        ],
      },
    ])
  })

  it("reads one bounded page plus a lookahead row", async () => {
    const rows = Array.from({ length: conversationHistoryPageSize + 1 }, (_, index) => ({
      client_id: `session-${index}`,
      scene_key: "coffee",
      title: "咖啡店点单",
      status: "completed",
      context_snapshot: {
        durationSeconds: index,
        partnerName: "Mia",
      },
      started_at: "2026-08-28T08:00:00.000Z",
      last_message_at: new Date(Date.UTC(2026, 7, 28, 8, index)).toISOString(),
      conversation_messages: [],
    }))
    const range = vi.fn().mockResolvedValue({ data: rows, error: null })
    const query = {
      not: vi.fn(),
      order: vi.fn(),
      range,
      select: vi.fn(),
      eq: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.not.mockReturnValue(query)
    query.order.mockReturnValue(query)
    const client = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient

    const result = await listConversationSessions({
      client,
      offset: conversationHistoryPageSize,
      userId: "user-1",
    })

    expect(range).toHaveBeenCalledWith(
      conversationHistoryPageSize,
      conversationHistoryPageSize * 2,
    )
    expect(result.sessions).toHaveLength(conversationHistoryPageSize)
    expect(result.nextOffset).toBe(conversationHistoryPageSize * 2)
  })

  it("upserts a session and its messages with user-scoped stable ids", async () => {
    const conversationSingle = vi.fn().mockResolvedValue({
      data: { id: "database-conversation-id" },
      error: null,
    })
    const conversationSelect = vi.fn(() => ({ single: conversationSingle }))
    const conversationUpsert = vi.fn(() => ({ select: conversationSelect }))
    const messageUpsert = vi.fn().mockResolvedValue({ error: null })
    const client = {
      from: vi.fn((table: string) =>
        table === "conversations" ? { upsert: conversationUpsert } : { upsert: messageUpsert },
      ),
    } as unknown as SupabaseClient

    await upsertConversationSession({ client, session, userId: "user-1" })

    expect(conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: session.id,
        completed_at: session.updatedAt,
        scene_key: "coffee",
        status: "completed",
        user_id: "user-1",
      }),
      { onConflict: "user_id,client_id" },
    )
    expect(messageUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          client_id: "question",
          conversation_id: "database-conversation-id",
          user_id: "user-1",
        }),
      ],
      { onConflict: "conversation_id,client_id" },
    )
  })
})
