import { speechRules } from "@/lib/speech-rules"

/**
 * 本机语音服务探测。
 *
 * 设置页不再要求学习者记住哪个端口对应哪个适配器：这里从通用规则配置读取固定回环地址
 * 并行探活，页面首屏直接给出「在线 / 未启动」。地址只来自规则表，不接受请求参数，
 * 因此不会变成任意地址探测器。
 */

export type SpeechServiceKind = "asr" | "tts"

export type LocalSpeechServiceProbe = {
  id: string
  label: string
  kinds: SpeechServiceKind[]
  ready: boolean
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
    return { ...target, ready: response.ok, latencyMs: Date.now() - startedAt }
  } catch {
    return { ...target, ready: false, latencyMs: Date.now() - startedAt }
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
