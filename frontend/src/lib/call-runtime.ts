export type VoiceCallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "muted"
  | "manual"
  | "ended"

const statusLabels: Record<VoiceCallStatus, string> = {
  idle: "等待接通",
  connecting: "正在接通",
  listening: "可以说话",
  transcribing: "正在离线识别",
  thinking: "正在思考",
  speaking: "正在回应",
  muted: "麦克风已静音",
  manual: "文字通话模式",
  ended: "通话已结束",
}

const statusDescriptions: Record<VoiceCallStatus, string> = {
  idle: "开始语音后，Moss 会持续监听完整表达。",
  connecting: "正在准备本地语音模型和麦克风。",
  listening: "麦克风已开启，直接开始说话。",
  transcribing: "语音仅在本机处理，识别完成后会自动发送。",
  thinking: "正在组织回应，你也可以直接开口继续提问。",
  speaking: "播报结束后会自动恢复语音识别。",
  muted: "取消静音后即可继续说话。",
  manual: "当前环境仅支持文字输入。",
  ended: "可以重新发起语音对话。",
}

export function getVoiceCallStatusLabel(status: VoiceCallStatus) {
  return statusLabels[status]
}

export function getVoiceCallStatusDescription(status: VoiceCallStatus) {
  return statusDescriptions[status]
}

export function formatCallDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function normalizeSpeechTranscript(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeEchoText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function isLikelyPlaybackEcho(transcript: string, spokenText: string) {
  const normalizedTranscript = normalizeEchoText(transcript)
  const normalizedSpeech = normalizeEchoText(spokenText)
  if (normalizedTranscript.length < 8 || normalizedSpeech.length < 8) {
    return false
  }
  if (
    normalizedSpeech.includes(normalizedTranscript) ||
    normalizedTranscript.includes(normalizedSpeech)
  ) {
    return true
  }

  const transcriptTokens = normalizedTranscript.split(" ")
  const speechTokens = new Set(normalizedSpeech.split(" "))
  const matchingTokens = transcriptTokens.filter((token) => speechTokens.has(token)).length
  return transcriptTokens.length >= 3 && matchingTokens / transcriptTokens.length >= 0.75
}
