import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  consumeSharedRateLimit,
  isRateLimited,
  resetRateLimitStore,
} from "@/lib/server/rate-limit"

beforeEach(() => {
  resetRateLimitStore()
})

describe("isRateLimited", () => {
  it("blocks requests after the fixed-window allowance and resets after expiry", () => {
    const options = { key: "conversation:user-1", limit: 2, windowMs: 1_000 }

    expect(isRateLimited({ ...options, now: 0 })).toBe(false)
    expect(isRateLimited({ ...options, now: 100 })).toBe(false)
    expect(isRateLimited({ ...options, now: 200 })).toBe(true)
    expect(isRateLimited({ ...options, now: 1_000 })).toBe(false)
  })

  it("evicts old keys when the bounded store reaches capacity", () => {
    expect(
      isRateLimited({
        key: "expired",
        limit: 1,
        windowMs: 100,
        maxEntries: 2,
        now: 0,
      }),
    ).toBe(false)
    expect(
      isRateLimited({
        key: "active",
        limit: 1,
        windowMs: 100,
        maxEntries: 2,
        now: 90,
      }),
    ).toBe(false)
    expect(
      isRateLimited({
        key: "new",
        limit: 1,
        windowMs: 100,
        maxEntries: 2,
        now: 100,
      }),
    ).toBe(false)

    expect(
      isRateLimited({
        key: "expired",
        limit: 1,
        windowMs: 100,
        maxEntries: 2,
        now: 101,
      }),
    ).toBe(false)
  })
})

describe("consumeSharedRateLimit", () => {
  it("uses the authenticated database RPC without client-controlled limits", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          limited: false,
          remaining: 4,
          reset_at: "2026-08-29T08:01:00.000Z",
        },
      ],
      error: null,
    })

    await expect(
      consumeSharedRateLimit({
        client: { rpc } as never,
        bucket: "conversation-generate",
      }),
    ).resolves.toEqual({
      limited: false,
      remaining: 4,
      resetAt: "2026-08-29T08:01:00.000Z",
    })
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_bucket: "conversation-generate",
    })
  })

  it("fails closed when the shared store returns an error or malformed data", async () => {
    await expect(
      consumeSharedRateLimit({
        client: {
          rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("unavailable") }),
        } as never,
        bucket: "translation",
      }),
    ).resolves.toBeNull()

    await expect(
      consumeSharedRateLimit({
        client: {
          rpc: vi.fn().mockResolvedValue({ data: [{ limited: "no" }], error: null }),
        } as never,
        bucket: "translation",
      }),
    ).resolves.toBeNull()

    await expect(
      consumeSharedRateLimit({
        client: {
          rpc: vi.fn().mockRejectedValue(new Error("network unavailable")),
        } as never,
        bucket: "translation",
      }),
    ).resolves.toBeNull()
  })
})
