import { spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(scriptDir)))
const venvDir = join(scriptDir, ".venv")
const requestedEngine = process.argv[2] ?? "sensevoice"
const supportedEngines = new Set(["all", "qwen3-asr", "sensevoice"])

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0
}

function getVenvPython() {
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python")
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`命令执行失败: ${command} ${args.join(" ")}`)
  }
}

function environmentIsCompatible() {
  if (!existsSync(getVenvPython())) {
    return false
  }
  return (
    spawnSync(
      getVenvPython(),
      [
        "-c",
        "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 13) else 1)",
      ],
      { stdio: "ignore" },
    ).status === 0
  )
}

function createEnvironment() {
  if (commandExists("uv")) {
    run("uv", ["venv", "--python", "3.12", venvDir])
    return
  }
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["py", "python"]
      : ["python3.12", "python3.11", "python3.10", "python3"]
  for (const command of candidates) {
    const compatible = spawnSync(
      command,
      [
        "-c",
        "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 13) else 1)",
      ],
      { stdio: "ignore" },
    )
    if (compatible.status === 0) {
      run(command, ["-m", "venv", venvDir])
      return
    }
  }
  throw new Error("Qwen3-ASR 需要 Python 3.10-3.12。请安装兼容版本或 uv 后重试。")
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
  if (!supportedEngines.has(requestedEngine)) {
    throw new Error("ASR 引擎必须是 all、qwen3-asr 或 sensevoice。")
  }
  if (!environmentIsCompatible()) {
    rmSync(venvDir, { force: true, recursive: true })
    console.log("[asr] 创建 Python 3.12 独立环境...")
    createEnvironment()
  }

  console.log("[asr] 安装 ASR 依赖...")
  installDependencies()
  run(
    getVenvPython(),
    ["-m", "backend.services.asr.download_model", "--engine", requestedEngine],
    {
      ...process.env,
      HOME: scriptDir,
      MODELSCOPE_CACHE: join(scriptDir, ".modelscope-cache"),
    },
  )
  console.log(`[asr] ${requestedEngine} 已就绪，运行 \`pnpm asr:start\` 启动。`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
