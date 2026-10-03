import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(scriptDir)))
const venvDir = join(scriptDir, ".venv")
const python =
  process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python")

if (!existsSync(python)) {
  console.error("[tts-service] 本地环境未安装，请先运行 `pnpm tts:setup`。")
  process.exit(1)
}

const child = spawn(python, ["-u", "-m", "backend.services.tts.main"], {
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
