// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getUserLearningMemoryStorageKey,
  LearningMemoryProvider,
  learningMemoryStorageKey,
  useLearningMemory,
} from "@/components/learning-memory-provider"
import { createDefaultLearningMemory } from "@/lib/memory"

const mocks = vi.hoisted(() => ({
  getSupabaseBrowserClient: vi.fn(),
  isDemoMode: vi.fn(() => false),
}))

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: mocks.getSupabaseBrowserClient,
}))

vi.mock("@/lib/runtime-mode", () => ({
  isDemoMode: mocks.isDemoMode,
}))

function MemoryProbe() {
  const { rateReview, state, syncStatus } = useLearningMemory()
  const reviewItem = state.items.find((item) => item.id === "clarify-trade-off")
  return (
    <div>
      <span data-testid="status">{syncStatus}</span>
      <span data-testid="goal">{state.profile.goal}</span>
      <span data-testid="review-strength">{reviewItem?.strength ?? -1}</span>
      <button type="button" onClick={() => rateReview("clarify-trade-off", "good")}>
        Rate review
      </button>
    </div>
  )
}

function StudyProbe() {
  const { state, toggleFavorite, createGroup } = useLearningMemory()
  const favorites = Object.values(state.expressionStudy.favorites).filter(
    (entry) => !entry.deletedAt,
  )
  const groups = Object.values(state.expressionStudy.groups).filter((group) => !group.deletedAt)
  return (
    <div>
      <span data-testid="favorites">{favorites.length}</span>
      <span data-testid="groups">{groups.length}</span>
      <button type="button" onClick={() => toggleFavorite("work:rule of thumb")}>
        Toggle favorite
      </button>
      <button type="button" onClick={() => createGroup("面试表达")}>
        Create group
      </button>
    </div>
  )
}

function createSupabaseMock(snapshot: unknown) {
  let realtimeHandler: ((payload: { new: unknown }) => void) | null = null
  const channel = {
    on: vi.fn(
      (_event: string, _filter: unknown, handler: (payload: { new: unknown }) => void) => {
        realtimeHandler = handler
        return channel
      },
    ),
    subscribe: vi.fn(() => channel),
  }
  const maybeSingle = vi.fn().mockResolvedValue({ data: snapshot, error: null })
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    channel: vi.fn(() => channel),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  }

  return {
    client,
    emitRemote(row: unknown) {
      realtimeHandler?.({ new: row })
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.getSupabaseBrowserClient.mockReset()
  mocks.isDemoMode.mockReset().mockReturnValue(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("LearningMemoryProvider cloud sync", () => {
  it("loads a remote snapshot on a new device and applies realtime updates", async () => {
    const remoteState = createDefaultLearningMemory(new Date("2026-08-24T08:00:00.000Z"))
    remoteState.profile.goal = "完成英文工作汇报"
    remoteState.updatedAt = "2026-08-24T09:00:00.000Z"
    const supabase = createSupabaseMock({
      state: remoteState,
      revision: 3,
      updated_at: "2026-08-24T09:00:01.000Z",
      device_id: "other-device",
    })
    mocks.getSupabaseBrowserClient.mockReturnValue(supabase.client)

    render(
      <LearningMemoryProvider>
        <MemoryProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("synced")
      expect(screen.getByTestId("goal").textContent).toBe("完成英文工作汇报")
    })
    expect(
      window.localStorage.getItem(getUserLearningMemoryStorageKey("user-1")),
    ).not.toBeNull()
    expect(window.localStorage.getItem(learningMemoryStorageKey)).toBeNull()

    const nextRemoteState = structuredClone(remoteState)
    nextRemoteState.profile.goal = "在海外独立生活"
    nextRemoteState.updatedAt = "2026-08-24T10:00:00.000Z"
    supabase.emitRemote({
      state: nextRemoteState,
      revision: 4,
      updated_at: "2026-08-24T10:00:01.000Z",
      device_id: "second-device",
    })

    await waitFor(() => {
      expect(screen.getByTestId("goal").textContent).toBe("在海外独立生活")
    })
  })

  it("keeps local mode in explicit demo mode", async () => {
    mocks.isDemoMode.mockReturnValue(true)
    mocks.getSupabaseBrowserClient.mockReturnValue(null)

    render(
      <LearningMemoryProvider>
        <MemoryProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("local")
    })
    expect(mocks.getSupabaseBrowserClient).not.toHaveBeenCalled()
  })

  it("keeps demo seed memory out of the production storage key even after an in-session edit", async () => {
    // 演示模式在会话内改动状态后，仍不得写生产键：否则切回正式模式/登录后，
    // 虚构条目会被当作真实记忆合并进云端。
    mocks.isDemoMode.mockReturnValue(true)
    mocks.getSupabaseBrowserClient.mockReturnValue(null)

    render(
      <LearningMemoryProvider>
        <MemoryProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("local")
    })
    // 会话内触发一次状态变更（评分走内存，不经过持久化）。
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rate review" }))
    })

    // 演示种子仍在工作区可见（有可评条目），但生产键始终为空。
    expect(Number(screen.getByTestId("review-strength").textContent)).toBeGreaterThanOrEqual(0)
    expect(window.localStorage.getItem(learningMemoryStorageKey)).toBeNull()
  })

  it("persists expression study favorites and groups in the local snapshot", async () => {
    mocks.getSupabaseBrowserClient.mockReturnValue(null)
    render(
      <LearningMemoryProvider>
        <StudyProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("favorites").textContent).toBe("0"))
    fireEvent.click(screen.getByRole("button", { name: "Toggle favorite" }))
    fireEvent.click(screen.getByRole("button", { name: "Create group" }))

    await waitFor(() => {
      expect(screen.getByTestId("favorites").textContent).toBe("1")
      expect(screen.getByTestId("groups").textContent).toBe("1")
    })
    const stored = window.localStorage.getItem(learningMemoryStorageKey)
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored ?? "{}")
    expect(parsed.expressionStudy.favorites["work:rule of thumb"]).toBeTruthy()
    expect(Object.values(parsed.expressionStudy.groups)[0]).toMatchObject({ name: "面试表达" })
  })

  it("creates the first cloud snapshot with revision zero as the expectation", async () => {
    const supabase = createSupabaseMock(null)
    supabase.client.rpc.mockImplementation(
      async (
        _name: string,
        args: {
          p_state: unknown
          p_expected_revision: number
          p_device_id: string
        },
      ) => ({
        data: [
          {
            state: args.p_state,
            revision: 1,
            updated_at: "2026-08-24T11:00:00.000Z",
            device_id: args.p_device_id,
          },
        ],
        error: null,
      }),
    )
    mocks.getSupabaseBrowserClient.mockReturnValue(supabase.client)

    render(
      <LearningMemoryProvider>
        <MemoryProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("synced")
    })
    expect(supabase.client.rpc).toHaveBeenCalledWith(
      "sync_learning_memory",
      expect.objectContaining({
        p_expected_revision: 0,
      }),
    )
  })

  it("updates review memory locally before queueing its vector document", async () => {
    const remoteState = createDefaultLearningMemory(new Date("2026-08-24T08:00:00.000Z"))
    const initialStrength = remoteState.items.find(
      (item) => item.id === "clarify-trade-off",
    )?.strength
    const supabase = createSupabaseMock({
      state: remoteState,
      revision: 2,
      updated_at: "2026-08-24T08:01:00.000Z",
      device_id: "other-device",
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    mocks.getSupabaseBrowserClient.mockReturnValue(supabase.client)

    render(
      <LearningMemoryProvider>
        <MemoryProbe />
      </LearningMemoryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("synced")
    })
    fireEvent.click(screen.getByRole("button", { name: "Rate review" }))

    expect(Number(screen.getByTestId("review-strength").textContent)).toBe(
      (initialStrength ?? 0) + 12,
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/memory-documents",
        expect.objectContaining({
          body: expect.stringContaining('"sourceType":"review"'),
          keepalive: true,
        }),
      )
    })
    expect(window.localStorage.getItem(getUserLearningMemoryStorageKey("user-1"))).toContain(
      '"clarify-trade-off"',
    )
  })
})
