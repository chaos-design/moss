import { describe, expect, it } from "vitest"
import { asrTestAudioMimeType, createAsrTestAudioBase64 } from "@/lib/asr-test-audio"

describe("ASR test tone", () => {
  it("is a small valid mono 16 kHz WAV container", () => {
    const base64 = createAsrTestAudioBase64()
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

    // RIFF....WAVEfmt 头 + 16-bit PCM 单声道 16kHz
    expect(bytes.slice(0, 4).join(",")).toBe("82,73,70,70")
    expect(bytes.slice(8, 12).join(",")).toBe("87,65,86,69")
    expect(bytes.slice(36, 40).join(",")).toBe("100,97,116,97")
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(bytes.byteLength).toBeLessThan(16_000)
  })

  it("caches the same payload across calls", () => {
    expect(createAsrTestAudioBase64()).toBe(createAsrTestAudioBase64())
    expect(asrTestAudioMimeType).toBe("audio/wav")
  })
})
