import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(dirname(dirname(dirname(dirname(scriptDir)))))
const venvDir = join(scriptDir, ".venv")
const runtimeDir = join(scriptDir, "runtime")
const modelDir = join(scriptDir, "models", "CosyVoice-300M-SFT")
const repository = "https://github.com/FunAudioLLM/CosyVoice.git"
const revision = "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc"
const modelId = "iic/CosyVoice-300M-SFT"
const requiredModelFiles = [
  "campplus.onnx",
  "configuration.json",
  "cosyvoice.yaml",
  "flow.pt",
  "hift.pt",
  "llm.pt",
  "speech_tokenizer_v1.onnx",
  "spk2info.pt",
]

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
    run("uv", ["venv", "--python", "3.10", venvDir], scriptDir)
    return
  }
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["py", "python"]
      : ["python3.10", "python3"]
  for (const command of candidates) {
    const version = spawnSync(
      command,
      ["-c", "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 10) else 1)"],
      { stdio: "ignore" },
    )
    if (version.status === 0) {
      run(command, ["-m", "venv", venvDir], scriptDir)
      return
    }
  }
  throw new Error("CosyVoice 需要 Python 3.10。请安装 Python 3.10 或 uv 后重试。")
}

function installDependencies() {
  const python = getVenvPython()
  const ready = spawnSync(
    python,
    [
      "-c",
      "import hyperpyyaml, librosa, modelscope, onnxruntime, torch, torchaudio, whisper, wetext",
    ],
    { cwd: scriptDir, stdio: "ignore" },
  )
  if (ready.status === 0) {
    console.log("[cosyvoice] Python 依赖已安装")
    return
  }
  if (commandExists("uv")) {
    run(
      "uv",
      [
        "pip",
        "install",
        "--python",
        python,
        "setuptools<81",
        "wheel",
        "cython",
        "numpy>=1.26,<2",
      ],
      scriptDir,
    )
    run(
      "uv",
      [
        "pip",
        "install",
        "--python",
        python,
        "--index-strategy",
        "unsafe-best-match",
        "--no-build-isolation",
        "-r",
        join(runtimeDir, "requirements.txt"),
      ],
      scriptDir,
    )
    return
  }
  run(python, ["-m", "pip", "install", "-r", join(runtimeDir, "requirements.txt")], scriptDir)
}

function installRuntime() {
  if (!existsSync(join(runtimeDir, ".git"))) {
    run("git", ["clone", "--recursive", repository, runtimeDir], scriptDir)
  }
  run("git", ["checkout", revision], runtimeDir)
  run("git", ["submodule", "update", "--init", "--recursive"], runtimeDir)
}

function downloadModel() {
  if (requiredModelFiles.every((name) => existsSync(join(modelDir, name)))) {
    console.log("[cosyvoice] 模型文件已存在")
    return
  }
  const script = [
    "from modelscope import snapshot_download",
    `snapshot_download("${modelId}", local_dir=r"${modelDir}", allow_file_pattern=${JSON.stringify(requiredModelFiles)})`,
  ].join("; ")
  const result = spawnSync(getVenvPython(), ["-c", script], {
    cwd: scriptDir,
    env: {
      ...process.env,
      HOME: scriptDir,
      MODELSCOPE_CACHE: join(scriptDir, ".cache", "modelscope"),
    },
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error("CosyVoice 模型下载失败")
  }
}

function main() {
  console.log("[cosyvoice] 准备独立运行时...")
  installRuntime()
  if (!existsSync(getVenvPython())) {
    createEnvironment()
  }
  installDependencies()
  downloadModel()
  console.log("[cosyvoice] 服务与 CosyVoice-300M-SFT 模型已就绪。")
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
