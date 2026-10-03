// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
