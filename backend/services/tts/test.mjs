import { spawnSync } from "node:child_process"
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
  console.error("[tts] 本地环境未安装，请先运行 `pnpm tts:setup`。")
  process.exit(1)
}

const result = spawnSync(
  python,
  ["-u", "-m", "unittest", "discover", "-s", "backend/tests/tts", "-v"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
)

process.exit(result.status ?? 1)
