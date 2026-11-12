import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(scriptDir)))
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

const env = { ...loadLocalEnv(), ...process.env }

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
