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

// 识别引擎会把非语音事件以方括号标注混进转写：whisper 类模型输出 [background noise]/
// [pause]，中文 ASR 输出 [噪音] 等。这些标注不该作为学习者消息发出，在语音转写入口
// 统一剥离；整段只剩标注时剥成空串，由运行时的空值守卫丢弃。
// 只命中已知产物关键词才剥离——用户手打的 [注意] 这类括号内容保留原样。
const speechAnnotationPattern = /[[［（(【]([^\]］）)】]{0,32})[\]］）)】]/gu

// 拉丁标注整段由字母/空格构成且包含产物词；中文标注按关键词子串命中。
const latinSpeechAnnotationKeywords =
  /noise|pause|silence|inaudible|unintelligible|laugh|music|applause|cough|sigh|breath|blip/i
const chineseSpeechAnnotationKeywords =
  /噪音|噪声|杂音|停顿|静音|笑声|音乐|掌声|咳嗽|叹气|呼吸|沉默/

function isSpeechAnnotationText(inner: string) {
  if (/[\u4e00-\u9fff]/.test(inner)) {
    return chineseSpeechAnnotationKeywords.test(inner)
  }
  return /^[a-z\s'-]+$/i.test(inner) && latinSpeechAnnotationKeywords.test(inner)
}

export function stripSpeechAnnotations(value: string) {
  const stripped = value.replace(speechAnnotationPattern, (match, inner: string) =>
    isSpeechAnnotationText(inner) ? " " : match,
  )
  return normalizeSpeechTranscript(stripped)
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
