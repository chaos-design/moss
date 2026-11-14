import { describe, expect, it } from "vitest"
import { isRetryableRecognitionFailure, SpeechApiClientError } from "@/lib/speech-client"

describe("isRetryableRecognitionFailure", () => {
  it.each([500, 502, 503, 504])("retries upstream %i failures", (status) => {
    expect(
      isRetryableRecognitionFailure(new SpeechApiClientError("上游异常", true, status)),
    ).toBe(true)
  })

  it("retries network-level failures without a status", () => {
    expect(
      isRetryableRecognitionFailure(new SpeechApiClientError("无法连接语音识别服务", true)),
    ).toBe(true)
  })

  it.each([400, 401, 402, 413, 429])("does not retry client errors %i", (status) => {
    expect(
      isRetryableRecognitionFailure(new SpeechApiClientError("参数或凭据问题", false, status)),
    ).toBe(false)
  })

  it("does not retry unknown error shapes", () => {
    expect(isRetryableRecognitionFailure(new Error("boom"))).toBe(false)
  })
})
