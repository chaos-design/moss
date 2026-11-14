/**
 * 「测试识别接口」专用的内置短音频：0.2 秒 440Hz 正弦波，16kHz 单声道 16-bit WAV。
 *
 * 只用于验证识别链路连通性（服务可达、返回结构合法），不追求内容正确——
 * 服务返回什么文本都算成功。纯同步计算并缓存，避免在设置页引入音频资源文件。
 */
const sampleRate = 16_000
const durationSeconds = 0.2
const toneHz = 440

let cachedBase64 = ""

export const asrTestAudioMimeType = "audio/wav"

export function createAsrTestAudioBase64(): string {
  if (cachedBase64) {
    return cachedBase64
  }
  const samples = Math.round(sampleRate * durationSeconds)
  const dataSize = samples * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
  view.setUint32(4, 36 + dataSize, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // "WAVE"
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // "fmt "
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // "data"
  view.setUint32(40, dataSize, true)
  for (let index = 0; index < samples; index += 1) {
    const amplitude = Math.round(Math.sin((2 * Math.PI * toneHz * index) / sampleRate) * 8000)
    view.setInt16(44 + index * 2, amplitude, true)
  }

  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  cachedBase64 = btoa(binary)
  return cachedBase64
}
