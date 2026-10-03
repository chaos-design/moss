import { spawnSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const venvDir = join(scriptDir, ".venv")
const modelDir = join(scriptDir, "models")
const modelBaseUrl =
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
const modelFiles = [
  ["kokoro-v1.0.onnx", 325_505_369, `${modelBaseUrl}/kokoro-v1.0.onnx`],
  ["voices-v1.0.bin", 28_214_398, `${modelBaseUrl}/voices-v1.0.bin`],
  ["kokoro-v1.1-zh.onnx", 325_506_167, `${modelBaseUrl}/kokoro-v1.1-zh.onnx`],
  ["voices-v1.1-zh.bin", 53_815_880, `${modelBaseUrl}/voices-v1.1-zh.bin`],
  [
    "kokoro-v1.1-zh-config.json",
    null,
    "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/resolve/main/config.json",
  ],
]

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
      : ["python3.13", "python3.12", "python3.11", "python3.10", "python3"]

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
  const python = findCompatiblePython()
  if (python) {
    run(python, ["-m", "venv", venvDir])
    return
  }
  if (commandExists("uv")) {
    run("uv", ["venv", "--python", "3.12", venvDir])
    return
  }
  throw new Error("Kokoro 需要 Python 3.10+。请安装兼容版本或 uv 后重试。")
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
  if (commandExists("uv")) {
    run("uv", ["pip", "install", "--python", python, "-r", join(scriptDir, "requirements.txt")])
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

async function downloadFile(name, expectedSize, url) {
  const destination = join(modelDir, name)
  if (
    existsSync(destination) &&
    (expectedSize === null || statSync(destination).size === expectedSize)
  ) {
    console.log(`[kokoro] 已存在 ${name}`)
    return
  }

  const partial = `${destination}.part`
  let downloaded = existsSync(partial) ? statSync(partial).size : 0
  const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {}
  let response = await fetch(url, { headers, redirect: "follow" })
  if (downloaded > 0 && response.status === 200) {
    downloaded = 0
  } else if (downloaded > 0 && response.status !== 206) {
    response = await fetch(url, { redirect: "follow" })
    downloaded = 0
  }
  if (!response.ok || !response.body) {
    throw new Error(`下载 ${name} 失败: HTTP ${response.status}`)
  }

  const total = Number(response.headers.get("content-length") || 0) + downloaded
  const stream = createWriteStream(partial, { flags: downloaded > 0 ? "a" : "w" })
  let received = downloaded
  const progress = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      const percent = total > 0 ? Math.floor((received / total) * 100) : 0
      process.stdout.write(`\r[kokoro] ${name} ${percent}%`)
      controller.enqueue(chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body.pipeThrough(progress)), stream)
  process.stdout.write("\n")

  if (expectedSize !== null && statSync(partial).size !== expectedSize) {
    throw new Error(`${name} 文件大小不正确: ${statSync(partial).size}，预期 ${expectedSize}`)
  }
  renameSync(partial, destination)
}

async function main() {
  if (!existsSync(getVenvPython())) {
    console.log("[kokoro] 创建 Python 3.10+ 独立环境...")
    createEnvironment()
  }

  installDependencies()

  mkdirSync(modelDir, { recursive: true })
  for (const [name, expectedSize, url] of modelFiles) {
    await downloadFile(name, expectedSize, url)
  }
  console.log("[kokoro] Python 服务与本地模型已就绪。")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
