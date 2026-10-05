import { resolveSpeechEndpoint, type SpeechEndpoint } from "@/lib/speech-config"
import type { TtsEngine } from "@/lib/tts-config"
import { describeHttpStatus, describeUserError, isUserFacingCopy } from "@/lib/user-error"

export type TtsSpeakOptions = {
  speed?: number
  seed?: number
  voice?: string
  onStart?: () => void
}

export class TtsClientError extends Error {
  readonly serviceUnavailable: boolean

  constructor(message: string, serviceUnavailable = false) {
    super(message)
    this.name = "TtsClientError"
    this.serviceUnavailable = serviceUnavailable
  }
}

const audioCache = new Map<string, Blob>()
const audioRequestCache = new Map<string, Promise<Blob>>()
const maxCachedAudioEntries = 24

export function getTtsServiceUrl(configuredUrl = process.env.NEXT_PUBLIC_TTS_SERVICE_URL) {
  const url = new URL(configuredUrl || "http://127.0.0.1:5578")
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"])
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new TtsClientError("TTS 服务地址必须使用 localhost 或回环地址")
  }
  return url.origin
}

async function getErrorDetails(response: Response) {
  const fallback = describeHttpStatus(response.status, "语音合成服务暂时不可用，请稍后重试。")
  try {
    const result = (await response.json()) as { error?: string; message?: string }
    return {
      code: result.error,
      message: isUserFacingCopy(result.message) ? result.message : fallback,
    }
  } catch {
    return { message: fallback }
  }
}

function isUnavailableCode(code?: string) {
  return code === "audio8_unavailable" || code === "cosyvoice_unavailable"
}

export class TtsClientPlayer {
  private readonly engine: TtsEngine
  private readonly defaultVoice?: string
  private readonly endpoint: SpeechEndpoint
  private audio: HTMLAudioElement | null = null
  private browserUtterance: SpeechSynthesisUtterance | null = null
  private objectUrl: string | null = null
  private preparePromise: Promise<void> | null = null
  private resolvePlayback: (() => void) | null = null
  private requestId = 0
  private useBrowserSpeech = false

  constructor(engine: TtsEngine, defaultVoice?: string, endpoint?: SpeechEndpoint) {
    this.engine = engine
    this.defaultVoice = defaultVoice
    this.endpoint = resolveSpeechEndpoint(
      endpoint ?? { transport: "local", endpoint: "", apiKey: "", model: "" },
      "tts",
    )
  }

  prepare() {
    if (this.preparePromise) {
      return this.preparePromise
    }
    if (this.endpoint.transport === "browser") {
      this.enableBrowserSpeech()
      this.preparePromise = Promise.resolve()
      return this.preparePromise
    }
    if (this.endpoint.transport === "api") {
      this.preparePromise = Promise.resolve()
      return this.preparePromise
    }
    this.preparePromise = fetch(
      `${getTtsServiceUrl(this.endpoint.endpoint || undefined)}/v1/tts/prepare`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: this.engine }),
        cache: "no-store",
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          const error = await getErrorDetails(response)
          throw new TtsClientError(error.message, isUnavailableCode(error.code))
        }
      })
      .catch((error) => {
        this.preparePromise = null
        if (error instanceof TtsClientError && error.serviceUnavailable) {
          this.enableBrowserSpeech()
          return
        }
        if (error instanceof TtsClientError) {
          throw error
        }
        this.enableBrowserSpeech()
      })
    return this.preparePromise
  }

  stop() {
    this.requestId += 1
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute("src")
      this.audio.load()
      this.audio = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.browserUtterance && typeof window !== "undefined") {
      window.speechSynthesis?.cancel()
      this.browserUtterance = null
    }
    this.resolvePlayback?.()
    this.resolvePlayback = null
  }

  preload(text: string, options: TtsSpeakOptions = {}) {
    const request = this.createAudioRequest(text, options)
    if (!request || this.useBrowserSpeech || this.endpoint.transport === "browser") {
      return Promise.resolve()
    }
    return getAudio(request.cacheKey, request.payload).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof TtsClientError && error.serviceUnavailable) {
          this.enableBrowserSpeech()
          return
        }
        throw error
      },
    )
  }

  async speak(text: string, options: TtsSpeakOptions = {}) {
    const request = this.createAudioRequest(text, options)
    if (!request) {
      return
    }

    this.stop()
    const requestId = this.requestId
    if (this.endpoint.transport === "browser") {
      this.enableBrowserSpeech()
    }
    if (this.useBrowserSpeech) {
      return this.speakWithBrowser(request.payload.text, request.payload.speed, options)
    }

    let audioBlob: Blob
    try {
      audioBlob = await getAudio(request.cacheKey, request.payload)
    } catch (error) {
      if (error instanceof TtsClientError && error.serviceUnavailable) {
        this.enableBrowserSpeech()
        return this.speakWithBrowser(request.payload.text, request.payload.speed, options)
      }
      throw error
    }
    if (requestId !== this.requestId) {
      return
    }

    const objectUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(objectUrl)
    audio.preload = "auto"
    this.objectUrl = objectUrl
    this.audio = audio
    audio.load()

    await new Promise<void>((resolve, reject) => {
      let started = false
      const cleanup = () => {
        if (this.audio === audio) {
          this.audio = null
        }
        if (this.objectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          this.objectUrl = null
        }
        if (this.resolvePlayback === finish) {
          this.resolvePlayback = null
        }
      }
      const finish = () => {
        cleanup()
        resolve()
      }
      this.resolvePlayback = finish
      audio.onplay = () => {
        if (!started) {
          started = true
          options.onStart?.()
        }
      }
      audio.onended = finish
      audio.onerror = () => {
        cleanup()
        reject(new TtsClientError("浏览器无法播放 TTS 音频"))
      }
      void audio.play().catch((error) => {
        cleanup()
        reject(
          new TtsClientError(
            describeUserError(error, "浏览器阻止了 TTS 音频播放，请先与页面交互后重试。"),
          ),
        )
      })
    })
  }

  private enableBrowserSpeech() {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      throw new TtsClientError("无法连接 TTS 服务，且当前浏览器不支持系统语音")
    }
    this.useBrowserSpeech = true
  }

  private speakWithBrowser(text: string, speed: number, options: TtsSpeakOptions) {
    const synthesis = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    const language = getBrowserSpeechLanguage(text, options.voice ?? this.defaultVoice)
    utterance.lang = language
    utterance.rate = Math.min(1.5, Math.max(0.5, speed))
    utterance.voice = selectBrowserVoice(synthesis.getVoices(), language)
    this.browserUtterance = utterance

    return new Promise<void>((resolve, reject) => {
      let started = false
      const finish = () => {
        if (this.browserUtterance === utterance) {
          this.browserUtterance = null
        }
        if (this.resolvePlayback === finish) {
          this.resolvePlayback = null
        }
        resolve()
      }
      this.resolvePlayback = finish
      utterance.onstart = () => {
        if (!started) {
          started = true
          options.onStart?.()
        }
      }
      utterance.onend = finish
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") {
          finish()
          return
        }
        if (this.resolvePlayback === finish) {
          this.resolvePlayback = null
        }
        if (this.browserUtterance === utterance) {
          this.browserUtterance = null
        }
        reject(new TtsClientError("浏览器系统语音播放失败"))
      }
      synthesis.speak(utterance)
    })
  }

  private createAudioRequest(text: string, options: TtsSpeakOptions) {
    const normalized = text.trim()
    if (!normalized) {
      return null
    }
    const voice = options.voice ?? this.defaultVoice
    const speed = options.speed ?? 1
    const seed = options.seed ?? 2024
    return {
      cacheKey: `${this.endpoint.transport}:${this.endpoint.endpoint}:${this.endpoint.model}:${this.engine}:${voice ?? ""}:${speed}:${seed}:${normalized}`,
      payload: {
        engine: this.engine,
        endpoint: this.endpoint,
        seed,
        speed,
        text: normalized,
        voice,
      },
    }
  }
}

function getBrowserSpeechLanguage(text: string, voice?: string) {
  if (/[\u3400-\u9fff]/u.test(text)) {
    return "zh-CN"
  }
  return voice?.startsWith("b") ? "en-GB" : "en-US"
}

function selectBrowserVoice(voices: SpeechSynthesisVoice[], language: string) {
  const normalizedLanguage = language.toLowerCase()
  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLanguage) ??
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(normalizedLanguage.slice(0, 2)),
    ) ??
    null
  )
}

type AudioRequest = {
  engine: TtsEngine
  seed: number
  speed: number
  text: string
  voice?: string
  endpoint: SpeechEndpoint
}

async function getAudio(cacheKey: string, request: AudioRequest) {
  const cached = audioCache.get(cacheKey)
  if (cached) {
    audioCache.delete(cacheKey)
    audioCache.set(cacheKey, cached)
    return cached
  }

  const audioBlob = await (audioRequestCache.get(cacheKey) ?? requestAudio(cacheKey, request))
  audioCache.set(cacheKey, audioBlob)
  if (audioCache.size > maxCachedAudioEntries) {
    const oldestKey = audioCache.keys().next().value
    if (oldestKey) {
      audioCache.delete(oldestKey)
    }
  }
  return audioBlob
}

// The API transport never reaches the provider from the browser: `/api/speech/tts` applies the
// endpoint policy, forwards the request, and returns the audio unchanged.
async function requestApiAudio(request: AudioRequest) {
  return fetch("/api/speech/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: {
        apiKey: request.endpoint.apiKey,
        endpoint: request.endpoint.endpoint,
        model: request.endpoint.model,
      },
      format: "mp3",
      speed: request.speed,
      text: request.text,
      voice: request.voice || "alloy",
    }),
  })
    .catch(() => {
      throw new TtsClientError("无法连接语音合成接口", true)
    })
    .then(async (response) => {
      if (!response.ok) {
        const error = await getErrorDetails(response)
        throw new TtsClientError(error.message, isUnavailableStatus(response.status))
      }
      const contentType = response.headers.get("content-type") || ""
      if (!contentType.startsWith("audio/")) {
        throw new TtsClientError("语音合成接口返回了无效音频")
      }
      return response.blob()
    })
}

async function requestAudio(cacheKey: string, request: AudioRequest) {
  const audioPromise = (
    request.endpoint.transport === "api"
      ? requestApiAudio(request)
      : fetch(`${getTtsServiceUrl(request.endpoint.endpoint || undefined)}/v1/tts/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            engine: request.engine,
            text: request.text,
            speed: request.speed,
            seed: request.seed,
            ...(request.voice ? { voice: request.voice } : {}),
          }),
        })
          .catch(() => {
            throw new TtsClientError("无法连接 TTS 服务", true)
          })
          .then(async (response) => {
            if (!response.ok) {
              const error = await getErrorDetails(response)
              throw new TtsClientError(error.message, isUnavailableCode(error.code))
            }
            const contentType = response.headers.get("content-type") || ""
            if (!contentType.startsWith("audio/")) {
              throw new TtsClientError("TTS 服务返回了无效音频")
            }
            return response.blob()
          })
  ).finally(() => {
    audioRequestCache.delete(cacheKey)
  })

  audioRequestCache.set(cacheKey, audioPromise)
  return audioPromise
}

function isUnavailableStatus(status: number) {
  return status === 502 || status === 503 || status === 504
}
