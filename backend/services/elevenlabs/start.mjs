import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
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

if (!process.env.ELEVENLABS_API_KEY) {
  console.warn(
    "[elevenlabs] ELEVENLABS_API_KEY 未设置；服务会启动，但语音请求将返回 not_configured。",
  )
}

const child = spawn(python, ["-u", "-m", "backend.services.elevenlabs.main"], {
  cwd: projectRoot,
  env: process.env,
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
