import {
  calculateAudioRms,
  calculateSpeechThreshold,
} from "@/features/speech/use-streaming-asr"

/**
 * HTTP API 识别没有服务端 VAD：录音会持续累积，但没有「说完一句话」的信号，
 * 回合永远无法提交（此前 api 接入在语音通话里收不到用户输入的原因）。
 *
 * 这里镜像 `use-streaming-asr` 的客户端能量检测：自适应噪声底 + 说话确认 +
 * 静音断句，纯逻辑、按帧喂数据，便于单元测试。检测结果由 `use-browser-asr`
 * 消费：speech-end 时快照并上传已积累的音频块，录音保持运行以无缝衔接下一轮。
 */

// 与 use-streaming-asr 的 VAD 常量保持同一量级；turn 级参数是 api 断句专用。
const noiseFloorCalibrationMs = 500
const speechStartDurationMs = 320
const initialNoiseFloor = 0.006

/** 静音持续这么久就认为一句话说完，触发整段上传。 */
export const apiTurnEndSilenceMs = 1_200
/** 单段录音上限：超过则强制断句上传，避免无限增长的音频块。 */
export const apiTurnMaxDurationMs = 25_000

export type ApiAsrTurnEvent = "none" | "speech-start" | "speech-end"

export type ApiAsrTurnTracker = {
  /** 每帧喂一次能量 RMS 与帧时长（毫秒），返回本帧产生的事件。 */
  feed: (rms: number, frameDurationMs: number) => ApiAsrTurnEvent
  /** 会话中断（teardown/重开录音）后清空全部累计状态。 */
  reset: () => void
}

export function createApiAsrTurnTracker(
  options: {
    onSpeechStart?: () => void
    onSpeechEnd?: (reason: "silence" | "max-duration") => void
  } = {},
): ApiAsrTurnTracker {
  let noiseFloor = initialNoiseFloor
  let calibrationMs = 0
  let speechMs = 0
  let silenceMs = 0
  let utteranceMs = 0
  let active = false

  const finishTurn = (reason: "silence" | "max-duration") => {
    active = false
    speechMs = 0
    silenceMs = 0
    utteranceMs = 0
    options.onSpeechEnd?.(reason)
  }

  return {
    feed(rms, frameDurationMs) {
      const threshold = calculateSpeechThreshold(noiseFloor)
      const calibrating = calibrationMs < noiseFloorCalibrationMs
      if (calibrating) {
        // 与流式识别相同的校准策略：只吸收噪声，避免开局把环境音当说话。
        noiseFloor = noiseFloor * 0.65 + Math.min(rms, noiseFloor * 1.5) * 0.35
        calibrationMs += frameDurationMs
        return "none"
      }

      if (rms >= threshold) {
        silenceMs = 0
        speechMs += frameDurationMs
        if (!active && speechMs >= speechStartDurationMs) {
          active = true
          utteranceMs = speechMs
          options.onSpeechStart?.()
          return "speech-start"
        }
        if (active) {
          utteranceMs += frameDurationMs
          if (utteranceMs >= apiTurnMaxDurationMs) {
            finishTurn("max-duration")
            return "speech-end"
          }
        }
        return "none"
      }

      // 静音帧继续下沉噪声底（封顶 1.25 倍，防止被偶发响声永久抬高）。
      noiseFloor = noiseFloor * 0.92 + Math.min(rms, noiseFloor * 1.25) * 0.08
      speechMs = 0
      if (!active) {
        return "none"
      }
      silenceMs += frameDurationMs
      if (silenceMs >= apiTurnEndSilenceMs) {
        finishTurn("silence")
        return "speech-end"
      }
      return "none"
    },
    reset() {
      noiseFloor = initialNoiseFloor
      calibrationMs = 0
      speechMs = 0
      silenceMs = 0
      utteranceMs = 0
      active = false
    },
  }
}

/** 从 AnalyserNode 的字节时域数据换算 RMS（-1..1 浮点），交给 tracker.feed。 */
export function calculateByteRms(buffer: Uint8Array) {
  const samples = new Float32Array(buffer.length)
  for (let index = 0; index < buffer.length; index += 1) {
    // 字节域中心是 128（0 电平）；越界兜底到 128 等价于静音帧。
    samples[index] = ((buffer[index] ?? 128) - 128) / 128
  }
  return calculateAudioRms(samples)
}
