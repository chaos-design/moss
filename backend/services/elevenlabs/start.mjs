import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(scriptDir)))
const rulesFile = join(projectRoot, "frontend", "src", "lib", "speech-rules.json")
const python =
  process.platform === "win32"
    ? join(scriptDir, ".venv", "Scripts", "python.exe")
    : join(scriptDir, ".venv", "bin", "python")

if (!existsSync(python)) {
  console.error("[elevenlabs] 本地环境未安装，请先运行 `pnpm elevenlabs:setup`。")
  process.exit(1)
}

// 读取本目录下的 .env.local（已被 gitignore，不会提交），让 `pnpm elevenlabs:start`
// 无需每次内联传密钥。文件中的值不覆盖已有的 shell 环境变量，便于临时覆盖。
function loadLocalEnv() {
  const file = join(scriptDir, ".env.local")
  if (!existsSync(file)) {
    return {}
  }
  const values = {}
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }
    const separator = line.indexOf("=")
    if (separator <= 0) {
      continue
    }
    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "")
    if (key) {
      values[key] = value
    }
  }
  return values
}

// 通用规则配置（frontend/src/lib/speech-rules.json）是本机模型、音色、格式与限制的唯一
// 默认值来源。优先级：规则表 < 本目录 .env.local < shell 环境变量。
// 规则表缺失时静默退回 Python 代码里的兜底默认值，不影响已有部署。
function loadRuleDefaults() {
  if (!existsSync(rulesFile)) {
    return {}
  }
  try {
    const rules = JSON.parse(readFileSync(rulesFile, "utf8"))
    return {
      MOSS_ELEVENLABS_HOST: rules.loopbackHosts[0],
      MOSS_ELEVENLABS_PORT: String(rules.services.localApi.port),
      MOSS_ELEVENLABS_TTS_MODEL: rules.models.localApi.tts,
      MOSS_ELEVENLABS_ASR_MODEL: rules.models.localApi.asr,
      MOSS_ELEVENLABS_DEFAULT_VOICE: rules.voice.default,
      MOSS_ELEVENLABS_DEFAULT_RESPONSE_FORMAT: rules.formats.default,
      MOSS_ELEVENLABS_TIMEOUT_SECONDS: String(rules.limits.adapterTimeoutSeconds),
      MOSS_ELEVENLABS_MAX_AUDIO_BYTES: String(rules.limits.maxAsrAudioBytes),
      MOSS_ELEVENLABS_MAX_TEXT_LENGTH: String(rules.limits.maxTtsTextLength),
    }
  } catch (error) {
    console.warn("[elevenlabs] 通用规则配置读取失败，改用服务内置默认值。", error)
    return {}
  }
}

const env = { ...loadRuleDefaults(), ...loadLocalEnv(), ...process.env }

if (!env.ELEVENLABS_API_KEY) {
  console.warn(
    "[elevenlabs] ELEVENLABS_API_KEY 未设置；服务会启动，但语音请求将返回 not_configured。",
  )
}

const child = spawn(python, ["-u", "-m", "backend.services.elevenlabs.main"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
})

let stopping = false
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true
    child.kill(signal)
  })
}

child.on("exit", (code) => {
  process.exit(code ?? (stopping ? 0 : 1))
})
