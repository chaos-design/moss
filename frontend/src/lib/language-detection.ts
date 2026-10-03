import type { InputLanguage } from "@/lib/conversation-feedback"

const chineseCharacterPattern = /\p{Script=Han}/u
const englishWordPattern = /[A-Za-z]+(?:'[A-Za-z]+)?/
const unsupportedSpeechScriptPattern =
  /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Greek}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

const supportedSpeechLanguages = new Set(["zh", "en", "chinese", "english", "mandarin"])
const speechFillerPattern =
  /^(?:(?:嗯+|呃+|额+|啊+|哦+|唔+|诶+|哎+|这个|那个)|(?:u+h+|u+m+|e+r+|h+m+|m+h+m+|ah+|oh+|like|you know))$/i

export function isMeaningfulSpeechTranscript(value: string) {
  const normalized = value
    .trim()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim()
  if (!normalized || speechFillerPattern.test(normalized)) {
    return false
  }
  return /[\p{L}\p{N}]/u.test(normalized)
}

export function isSupportedSpeechTranscript(value: string, language?: string) {
  const normalizedLanguage = language?.trim().toLowerCase().replace("_", "-")
  if (
    normalizedLanguage &&
    !supportedSpeechLanguages.has(normalizedLanguage) &&
    !supportedSpeechLanguages.has(normalizedLanguage.split("-", 1)[0] ?? "")
  ) {
    return false
  }
  return isMeaningfulSpeechTranscript(value) && !unsupportedSpeechScriptPattern.test(value)
}

export function detectInputLanguageImmediately(value: string): InputLanguage {
  const hasChinese = chineseCharacterPattern.test(value)
  const hasEnglish = englishWordPattern.test(value)
  if (hasChinese && hasEnglish) {
    return "mixed"
  }
  if (hasChinese) {
    return "chinese"
  }
  if (hasEnglish) {
    return "english"
  }
  return "unknown"
}

export function detectInputLanguage(value: string): Promise<InputLanguage> {
  return Promise.resolve(detectInputLanguageImmediately(value))
}
