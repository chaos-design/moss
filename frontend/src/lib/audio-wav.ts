/**
 * 把单声道 PCM 浮点样本（-1..1）编码成 16-bit WAV Blob。
 *
 * api 识别的语音通话用 Web Audio 直接采集 PCM 并在断句时编码上传：每一轮都是
 * 带完整文件头的独立 WAV（MediaRecorder 的跨回合分片没有文件头，上游会以
 * invalid_audio 拒绝），格式由这里统一保证。头部结构见 RFC 2362 / WAVE 规范。
 */
export function encodeWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true) // PCM 块长度
  view.setUint16(20, 1, true) // 线性 PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // 字节率
  view.setUint16(32, bytesPerSample, true) // 块对齐
  view.setUint16(34, 16, true) // 位深
  writeAscii(36, "data")
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += bytesPerSample
  }
  return new Blob([buffer], { type: "audio/wav" })
}
