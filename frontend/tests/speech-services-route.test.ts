import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/speech/services/route"

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number) {
  return new Response(JSON.stringify({ ready: status === 200 }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("GET /api/speech/services", () => {
  it("reports every loopback service and marks a stopped one as not ready", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        // 5584 模拟未启动：探活返回 503，其余适配器在线。
        jsonResponse(url.includes(":5584") ? 503 : 200),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET()
    const body = (await response.json()) as {
      data: {
        services: Array<{ id: string; ready: boolean; label: string }>
      }
    }

    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body.data.services.map((service) => service.id)).toEqual([
      "moss-tts",
      "moss-asr",
      "local-api",
      "fish-audio",
    ])
    expect(body.data.services.find((service) => service.id === "fish-audio")?.ready).toBe(false)
    expect(body.data.services.find((service) => service.id === "local-api")?.ready).toBe(true)
    // 只探测规则表里的固定回环地址，不接受外部输入。
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("127.0.0.1"))).toBe(true)
  })

  it("marks a service as not ready when the probe throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const response = await GET()
    const body = (await response.json()) as {
      data: { services: Array<{ ready: boolean }> }
    }

    expect(body.data.services.every((service) => service.ready === false)).toBe(true)
  })
})
