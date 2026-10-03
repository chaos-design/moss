export type AsrEngine = "funasr" | "qwen3-asr" | "sensevoice"

export type AsrEngineOption = {
  value: AsrEngine
  label: string
  description: string
}

export const asrEngineOptions: AsrEngineOption[] = [
  {
    value: "qwen3-asr",
    label: "Qwen3-ASR",
    description: "中英混合与场景词汇",
  },
  {
    value: "sensevoice",
    label: "SenseVoice",
    description: "低延迟多语种识别",
  },
  {
    value: "funasr",
    label: "FunASR（外部）",
    description: "标准 2-pass，需单独启动",
  },
]

export const asrConfigStorageKey = "moss:asr-config:v1"
export const defaultAsrEngine: AsrEngine = "sensevoice"

export function parseAsrEngine(value: string | null): AsrEngine {
  if (!value) {
    return defaultAsrEngine
  }
  try {
    const parsed = JSON.parse(value) as { engine?: unknown }
    return parsed.engine === "funasr" ||
      parsed.engine === "sensevoice" ||
      parsed.engine === "qwen3-asr"
      ? parsed.engine
      : defaultAsrEngine
  } catch {
    return defaultAsrEngine
  }
}
