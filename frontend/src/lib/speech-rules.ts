import rules from "./speech-rules.json"

/**
 * 语音服务通用规则配置的唯一机器可读来源。
 *
 * 这些值归纳自 `backend/services/{tts,asr,elevenlabs}` 与前端 `/api/speech/*` 代理：
 * 端口与路由、本地/云端模型、音色别名、音频格式、长度与超时限制、回环判定以及
 * 「测试合成接口」的默认参数。`backend/services/elevenlabs/start.mjs` 会读同一份 JSON
 * 为本地服务注入默认值，避免前后端各写一份而漂移。规则说明见 `docs/speech-rules.md`。
 */
export const speechRules = rules

export const testSynthesisDefaults = rules.testSynthesis

const adapterFormats = rules.formats.adapterSupported as Record<
  string,
  { outputFormat: string; contentType: string; sampleRate: number }
>

export function isAdapterSupportedFormat(value: string): boolean {
  return Object.hasOwn(adapterFormats, value)
}

export function isAudioContentType(value: string): boolean {
  return value
    .split(";", 1)[0]
    .trim()
    .toLowerCase()
    .startsWith(rules.testSynthesis.contentTypePrefix)
}

/** 容器魔数；PCM 是裸采样流，没有可校验的文件头。 */
const audioMagicNumbers: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  "audio/mpeg": [
    { offset: 0, bytes: [0x49, 0x44, 0x33] },
    { offset: 0, bytes: [0xff] },
  ],
  "audio/wav": [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }],
  "audio/ogg": [{ offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }],
}

/**
 * 测试合成专用：只判断「看起来是真实音频」，不解码、不落盘。
 * 已知容器校验魔数，裸 PCM 只校验长度；返回 false 时调用方应给出可操作的错误提示。
 */
export function isPlausibleAudioPayload(audio: ArrayBuffer, contentType: string): boolean {
  if (audio.byteLength < rules.testSynthesis.minimumAudioBytes) {
    return false
  }
  const mime = contentType.split(";", 1)[0].trim().toLowerCase()
  const candidates = audioMagicNumbers[mime]
  if (!candidates) {
    return true
  }
  const bytes = new Uint8Array(audio)
  return candidates.some((candidate) =>
    candidate.bytes.every((byte, index) => bytes[candidate.offset + index] === byte),
  )
}

export function getLocalApiRuleDefaults() {
  return {
    ttsModel: rules.models.localApi.tts,
    asrModel: rules.models.localApi.asr,
    defaultVoice: rules.voice.default,
    defaultFormat: rules.formats.default,
    timeoutSeconds: rules.limits.adapterTimeoutSeconds,
    maxAudioBytes: rules.limits.maxAsrAudioBytes,
    maxTextLength: rules.limits.maxTtsTextLength,
    port: rules.services.localApi.port,
  }
}
