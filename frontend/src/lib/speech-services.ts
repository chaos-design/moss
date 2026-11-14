import { speechRules } from "@/lib/speech-rules"

/**
 * 本机语音服务探测。
 *
 * 设置页不再要求学习者记住哪个端口对应哪个适配器：这里从通用规则配置读取固定回环地址
 * 并行探活，页面首屏直接给出「在线 / 未启动」。地址只来自规则表，不接受请求参数，
 * 因此不会变成任意地址探测器。
 */

export type SpeechServiceKind = "asr" | "tts"

/**
 * ready：服务在线且已配置；unconfigured：端口在线但适配器缺上游密钥（/health 返回
 * 503 且 `configured:false`）；down：未启动或探活失败。把「已启动但没配密钥」从
 * 「未启动」里拆出来，避免学习者在密钥没配时反复重启服务。
 */
export type LocalSpeechServiceState = "ready" | "unconfigured" | "down"

export type LocalSpeechServiceProbe = {
  id: string
  label: string
  kinds: SpeechServiceKind[]
  ready: boolean
  state: LocalSpeechServiceState
  latencyMs: number
}

type ProbeTarget = {
  id: string
  label: string
  kinds: SpeechServiceKind[]
  url: string
}

const probeTargets: ProbeTarget[] = [
  {
    id: "moss-tts",
    label: "本机 TTS 网关",
    kinds: ["tts"],
    url: `${speechRules.services.ttsGateway.url}${speechRules.services.ttsGateway.routes.health}`,
  },
  {
    id: "moss-asr",
    label: "本机 ASR 服务",
    kinds: ["asr"],
    url: `http://127.0.0.1:${speechRules.services.asr.port}${
      speechRules.services.asr.routes.health
    }`,
  },
  {
    id: "local-api",
    label: "ElevenLabs 适配器",
    kinds: ["asr", "tts"],
    url: `http://127.0.0.1:${speechRules.services.localApi.port}${
      speechRules.services.localApi.routes.health
    }`,
  },
  {
    id: "fish-audio",
    label: "Fish Audio 适配器",
    kinds: ["asr", "tts"],
    url: `http://127.0.0.1:${speechRules.services.fishAudio.port}${
      speechRules.services.fishAudio.routes.health
    }`,
  },
]

const probeTimeoutMs = 900
const cacheTtlMs = 8_000

let cached: { at: number; services: LocalSpeechServiceProbe[] } | null = null

async function probe(target: ProbeTarget): Promise<LocalSpeechServiceProbe> {
  const startedAt = Date.now()
  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(probeTimeoutMs),
    })
    if (response.ok) {
      return { ...target, ready: true, state: "ready", latencyMs: Date.now() - startedAt }
    }
    // 适配器缺密钥时 /health 仍在线，只是返回 503 且 body 带 configured:false；
    // 只有这种响应才算「已启动但缺密钥」，其余非 2xx 仍按未启动处理。
    const body = (await response.json().catch(() => null)) as { configured?: unknown } | null
    const state: LocalSpeechServiceState = body?.configured === false ? "unconfigured" : "down"
    return { ...target, ready: false, state, latencyMs: Date.now() - startedAt }
  } catch {
    return { ...target, ready: false, state: "down", latencyMs: Date.now() - startedAt }
  }
}

/** 并行探活四个本机服务，8 秒内复用结果；显式刷新时传入 force 跳过缓存。 */
export async function probeLocalSpeechServices(
  options: { now?: number; force?: boolean } = {},
) {
  const now = options.now ?? Date.now()
  if (!options.force && cached && now - cached.at < cacheTtlMs) {
    return cached.services
  }
  const services = await Promise.all(probeTargets.map(probe))
  cached = { at: now, services }
  return services
}
