import { describe, expect, it } from "vitest"
import {
  formatCallDuration,
  getVoiceCallStatusDescription,
  getVoiceCallStatusLabel,
  isLikelyPlaybackEcho,
  normalizeSpeechTranscript,
  stripSpeechAnnotations,
} from "@/lib/call-runtime"

describe("voice call runtime", () => {
  it("formats call duration without allowing negative values", () => {
    expect(formatCallDuration(0)).toBe("00:00")
    expect(formatCallDuration(65.9)).toBe("01:05")
    expect(formatCallDuration(-10)).toBe("00:00")
  })

  it("normalizes browser speech transcripts", () => {
    expect(normalizeSpeechTranscript("  Could   I get a latte?  ")).toBe("Could I get a latte?")
  })

  it("strips bracketed ASR annotations from voice transcripts", () => {
    // whisper 类模型的中英文产物标注。
    expect(
      stripSpeechAnnotations(
        "[background noise] What do you mean about [pause] seeing you for ages?",
      ),
    ).toBe("What do you mean about seeing you for ages?")
    expect(stripSpeechAnnotations("[噪音]说说话说话，喂喂喂，喂喂喂。")).toBe(
      "说说话说话，喂喂喂，喂喂喂。",
    )
    // 整段只剩标注：剥成空串，运行时据此丢弃不发消息。
    expect(stripSpeechAnnotations("[pause]")).toBe("")
    expect(stripSpeechAnnotations("[background noise]")).toBe("")
    // 其他括号族同样命中：全角与圆括号。
    expect(stripSpeechAnnotations("（噪声）你好")).toBe("你好")
    // 中文句子中间的标注：两侧都是汉字时替换成空串，不留「今天 很热」的空格。
    expect(stripSpeechAnnotations("今天[噪音]很热")).toBe("今天很热")
    // 拉丁词缝仍保留空格（由 normalize 压缩）。
    expect(stripSpeechAnnotations("hello [noise] world")).toBe("hello world")
    expect(stripSpeechAnnotations("(laughter) nice one")).toBe("nice one")
    // 非产物括号内容保留原样（用户手打的标注不受影响）。
    expect(stripSpeechAnnotations("[注意] 保留这一段")).toBe("[注意] 保留这一段")
    expect(stripSpeechAnnotations("把[温度]调高一点")).toBe("把[温度]调高一点")
  })

  it("strips placeholder annotations the engine emits for untranscribable segments", () => {
    // 无法转写片段以 [xxxx] 这类整段重复占位符出现，按标注剥离。
    expect(stripSpeechAnnotations("今天[xxxx]很热")).toBe("今天很热")
    expect(stripSpeechAnnotations("[xx] what do you say")).toBe("what do you say")
    expect(stripSpeechAnnotations("[？？]")).toBe("")
    expect(stripSpeechAnnotations("[??]")).toBe("")
    // 单个占位字符不构成标注（[x] 可能表示手打的「是」），保持原样。
    expect(stripSpeechAnnotations("标记为 [x] 的行")).toBe("标记为 [x] 的行")
  })

  it("strips case-insensitive placeholders with trailing punctuation and more ASR products", () => {
    // 占位符大小写不敏感、允许尾随句读（引擎常输出 [xxx...] / [Xxx]）。
    expect(stripSpeechAnnotations("[xxx...] what do you say")).toBe("what do you say")
    expect(stripSpeechAnnotations("[xXx] what do you say")).toBe("what do you say")
    expect(stripSpeechAnnotations("稍等[Xxx。]再说")).toBe("稍等再说")
    // 更多中英文产物词：unknow / clears throat / 嗯 / 咳 / 听不清。
    expect(stripSpeechAnnotations("[ unknow ] what")).toBe("what")
    expect(stripSpeechAnnotations("[clears throat] ok")).toBe("ok")
    expect(stripSpeechAnnotations("[嗯]好的")).toBe("好的")
    expect(stripSpeechAnnotations("[咳]不好意思")).toBe("不好意思")
    expect(stripSpeechAnnotations("这句[听不清]重来")).toBe("这句重来")
    // 手打非产物括号仍保留，单字符 [x] 保留。
    expect(stripSpeechAnnotations("[注意] 保留")).toBe("[注意] 保留")
    expect(stripSpeechAnnotations("标记为 [x]")).toBe("标记为 [x]")
  })

  it("detects delayed ASR echoes without blocking unrelated learner speech", () => {
    const spoken =
      "We have fresh blueberry muffins and almond croissants. Which one would you like?"

    expect(
      isLikelyPlaybackEcho("We have fresh blueberry muffins and almond croissants", spoken),
    ).toBe(true)
    expect(isLikelyPlaybackEcho("Could I have the chocolate cake instead?", spoken)).toBe(false)
  })

  it("provides a user-facing label for each active state", () => {
    expect(getVoiceCallStatusLabel("listening")).toBe("可以说话")
    expect(getVoiceCallStatusLabel("transcribing")).toBe("正在离线识别")
    expect(getVoiceCallStatusLabel("speaking")).toBe("正在回应")
    expect(getVoiceCallStatusLabel("ended")).toBe("通话已结束")
    expect(getVoiceCallStatusDescription("listening")).toBe("麦克风已开启，直接开始说话。")
  })
})
