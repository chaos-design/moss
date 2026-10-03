import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(dirname(dirname(scriptDir)))))
const venvDir = join(scriptDir, ".venv")
const modelDir = join(scriptDir, "models", "Audio8-TTS-Preview-0.6b")
const modelId = "Audio8/Audio8-TTS-Preview-0.6b"

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: "inherit" })
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

function createEnvironment() {
  if (commandExists("uv")) {
    run("uv", ["venv", "--python", "3.12", venvDir], scriptDir)
    return
  }
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["py", "python"]
      : ["python3.12", "python3.11", "python3.10", "python3"]
  for (const command of candidates) {
    const result = spawnSync(
      command,
      [
        "-c",
        "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 13) else 1)",
      ],
      { stdio: "ignore" },
    )
    if (result.status === 0) {
      run(command, ["-m", "venv", venvDir], scriptDir)
      return
    }
  }
  throw new Error("Audio8 需要 Python 3.10-3.12。请安装兼容版本或 uv 后重试。")
}

function installDependencies() {
  const python = getVenvPython()
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

function main() {
  if (!existsSync(getVenvPython())) {
    console.log("[audio8] 创建独立 Python 环境...")
    createEnvironment()
  }
  installDependencies()
  const download = [
    "from huggingface_hub import snapshot_download",
    `snapshot_download(repo_id="${modelId}", local_dir=r"${modelDir}")`,
  ].join("; ")
  run(getVenvPython(), ["-c", download])
  console.log("[audio8] Audio8-TTS-Preview-0.6b 已就绪。")
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
