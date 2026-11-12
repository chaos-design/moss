import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(scriptDir)))
const rulesFile = join(projectRoot, "frontend", "src", "lib", "speech-rules.json")

if (!existsSync(rulesFile)) {
  console.error("[elevenlabs] 找不到通用规则配置 frontend/src/lib/speech-rules.json。")
  process.exit(1)
}

const rules = JSON.parse(readFileSync(rulesFile, "utf8"))
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

if (args.includes("--help")) {
  console.log(`用法: pnpm elevenlabs:test:synthesis [选项]

探测本机语音适配器的 /v1/audio/speech/test 自检端点，只返回诊断，不回传音频。
先运行 pnpm elevenlabs:start（可用 MOSS_ELEVENLABS_BASE_URL 指向本地 mock 避免消耗额度）。

  --url       完整端点 URL（默认取 speech-rules.json）
  --text      合成文本
  --voice     音色或 ElevenLabs voice ID
  --model     TTS 模型
  --format    mp3 | opus | pcm | wav
  --token     可选本机 Bearer token
  --timeout   请求超时毫秒（默认 30000）
`)
  process.exit(0)
}

const localApi = rules.services.localApi
const defaults = rules.testSynthesis
const url = option("url", `${localApi.baseUrl}${localApi.routes.speechTest}`)
const body = {
  text: option("text", defaults.text),
  voice: option("voice", defaults.voice),
  model: option("model", rules.models.localApi.tts),
  response_format: option("format", defaults.format),
  speed: defaults.speed,
}
const token = option("token", "")
const timeoutMs = Number(option("timeout", String(rules.limits.speechRequestTimeoutMs)))

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 30_000),
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = { error: { code: "invalid_response", message: "端点返回了非 JSON 响应。" } }
  }
  console.log(JSON.stringify({ httpStatus: response.status, ...payload }, null, 2))
  if (!response.ok || payload.ok !== true) {
    process.exit(1)
  }
} catch (error) {
  console.error(
    `[elevenlabs] 无法连接 ${url}：${error instanceof Error ? error.message : String(error)}`,
  )
  console.error("请先运行 `pnpm elevenlabs:start`，或用 --url 指定其他自检端点。")
  process.exit(1)
}
