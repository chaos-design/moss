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
        // 5584 模拟未启动：裸 503（无任何探测字段）→ down；其余适配器在线。
        url.includes(":5584")
          ? new Response(JSON.stringify({}), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          : jsonResponse(200),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET()
    const body = (await response.json()) as {
      data: {
        services: Array<{ id: string; ready: boolean; state: string; label: string }>
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
    expect(body.data.services.find((service) => service.id === "fish-audio")?.state).toBe(
      "down",
    )
    expect(body.data.services.find((service) => service.id === "local-api")?.ready).toBe(true)
    expect(body.data.services.find((service) => service.id === "local-api")?.state).toBe(
      "ready",
    )
    // 只探测规则表里的固定回环地址，不接受外部输入。
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("127.0.0.1"))).toBe(true)
  })

  it("marks a running adapter without credentials as unconfigured", async () => {
    // 5583 模拟「已启动但缺密钥」：/health 返回 503 且 body 带 configured:false。
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes(":5583")
          ? new Response(JSON.stringify({ ready: false, configured: false }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          : jsonResponse(200),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET()
    const body = (await response.json()) as {
      data: { services: Array<{ id: string; ready: boolean; state: string }> }
    }

    const localApi = body.data.services.find((service) => service.id === "local-api")
    expect(localApi?.ready).toBe(false)
    expect(localApi?.state).toBe("unconfigured")
    expect(body.data.services.find((service) => service.id === "moss-tts")?.state).toBe("ready")
  })

  it("marks a running ASR service whose engine is still loading as starting", async () => {
    // ASR 引擎加载中的 503 带 ready:false 但不带 configured:false：是「启动中」而非缺密钥。
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes(":5580")
          ? new Response(JSON.stringify({ ready: false }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          : jsonResponse(200),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET()
    const body = (await response.json()) as {
      data: { services: Array<{ id: string; state: string }> }
    }

    expect(body.data.services.find((service) => service.id === "moss-asr")?.state).toBe(
      "starting",
    )
    expect(body.data.services.find((service) => service.id === "local-api")?.state).toBe(
      "ready",
    )
  })

  it("keeps a 503 with no ready/configured flags as down", async () => {
    // 裸 503（无任何探测字段）仍按未启动处理，避免把真正的 down 误报成启动中。
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes(":5580")
          ? new Response(JSON.stringify({}), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          : jsonResponse(200),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET()
    const body = (await response.json()) as {
      data: { services: Array<{ id: string; state: string }> }
    }

    expect(body.data.services.find((service) => service.id === "moss-asr")?.state).toBe("down")
  })

  it("marks a service as not ready when the probe throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const response = await GET()
    const body = (await response.json()) as {
      data: { services: Array<{ ready: boolean; state: string }> }
    }

    expect(body.data.services.every((service) => service.ready === false)).toBe(true)
    expect(body.data.services.every((service) => service.state === "down")).toBe(true)
  })
})
