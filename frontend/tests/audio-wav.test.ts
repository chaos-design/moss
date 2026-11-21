import { describe, expect, it } from "vitest"
import { encodeWavBlob } from "@/lib/audio-wav"

describe("encodeWavBlob", () => {
  it("writes a complete 16-bit mono PCM header", async () => {
    const blob = encodeWavBlob(new Float32Array(160), 16_000)
    const buffer = new DataView(await blob.arrayBuffer())

    expect(blob.type).toBe("audio/wav")
    expect(buffer.getUint8(0)).toBe(0x52) // R
    expect(buffer.getUint8(1)).toBe(0x49) // I
    expect(buffer.getUint8(2)).toBe(0x46) // F
    expect(buffer.getUint8(3)).toBe(0x46) // F
    expect(buffer.getUint32(4, true)).toBe(36 + 320) // 文件大小 - 8
    expect(buffer.getUint16(20, true)).toBe(1) // 线性 PCM
    expect(buffer.getUint16(22, true)).toBe(1) // 单声道
    expect(buffer.getUint32(24, true)).toBe(16_000) // 采样率
    expect(buffer.getUint32(28, true)).toBe(32_000) // 字节率
    expect(buffer.getUint32(40, true)).toBe(320) // data 块长度
  })

  it("encodes samples as little-endian 16-bit with clamping", async () => {
    const blob = encodeWavBlob(new Float32Array([0, 0.5, -1, 2]), 16_000)
    const view = new DataView(await blob.arrayBuffer())

    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(16_383) // 0.5 * 0x7fff
    expect(view.getInt16(48, true)).toBe(-32_768) // -1 * 0x8000
    expect(view.getInt16(50, true)).toBe(32_767) // 2 收敛到 1
  })

  it("produces an empty-audio file for zero samples", async () => {
    const blob = encodeWavBlob(new Float32Array(0), 16_000)
    expect(blob.size).toBe(44)
  })
})
