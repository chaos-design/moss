import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const venvDir = join(scriptDir, ".venv")

function run(command, args) {
  const result = spawnSync(command, args, { cwd: scriptDir, stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`命令执行失败: ${command} ${args.join(" ")}`)
  }
}

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0
}

function getVenvPython() {
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python")
}

function findCompatiblePython() {
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["python", "python3"]
      : ["python3.12", "python3.11", "python3.10", "python3", "python3.14"]
  for (const command of candidates) {
    const result = spawnSync(
      command,
      ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"],
      { stdio: "ignore" },
    )
    if (result.status === 0) {
      return command
    }
  }
  return null
}

function createEnvironment() {
  if (commandExists("uv")) {
    run("uv", ["venv", "--python", "3.12", venvDir])
    return
  }
  const python = findCompatiblePython()
  if (!python) {
    throw new Error("Fish Audio 适配服务需要 Python 3.10+。请安装兼容版本或 uv 后重试。")
  }
  run(python, ["-m", "venv", venvDir])
}

function installDependencies() {
  const python = getVenvPython()
  if (commandExists("uv")) {
    run("uv", ["pip", "install", "--python", python, "-r", join(scriptDir, "requirements.txt")])
    return
  }
  if (spawnSync(python, ["-m", "pip", "--version"], { stdio: "ignore" }).status === 0) {
    run(python, [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      join(scriptDir, "requirements.txt"),
    ])
    return
  }
  run(python, ["-m", "ensurepip", "--upgrade"])
  run(python, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "-r",
    join(scriptDir, "requirements.txt"),
  ])
}

if (!existsSync(getVenvPython())) {
  console.log("[fishaudio] 创建 Python 独立环境...")
  createEnvironment()
}

console.log("[fishaudio] 安装适配服务依赖...")
installDependencies()
console.log("[fishaudio] 安装完成。运行 `pnpm fishaudio:start` 启动服务。")
