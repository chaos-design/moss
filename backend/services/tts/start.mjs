import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ttsDir = dirname(fileURLToPath(import.meta.url))
const runtimesDir = join(ttsDir, "runtimes")
const projectRoot = dirname(dirname(dirname(ttsDir)))
const children = []

function start(script, env = process.env) {
  const child = spawn(process.execPath, [script], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  })
  children.push(child)
  return child
}

const gateway = start(join(ttsDir, "start-gateway.mjs"))
const audio8Python =
  process.platform === "win32"
    ? join(runtimesDir, "audio8", ".venv", "Scripts", "python.exe")
    : join(runtimesDir, "audio8", ".venv", "bin", "python")
const audio8ModelDir = join(runtimesDir, "audio8", "models", "Audio8-TTS-Preview-0.6b")
const audio8 =
  existsSync(audio8Python) &&
  existsSync(join(audio8ModelDir, "config.json")) &&
  existsSync(join(audio8ModelDir, "model.safetensors"))
    ? start(join(runtimesDir, "audio8", "start.mjs"), {
        ...process.env,
        MOSS_AUDIO8_PORT: process.env.MOSS_AUDIO8_PORT ?? "5582",
      })
    : null
const cosyVoicePython =
  process.platform === "win32"
    ? join(runtimesDir, "cosyvoice", ".venv", "Scripts", "python.exe")
    : join(runtimesDir, "cosyvoice", ".venv", "bin", "python")
const cosyVoiceModelDir = join(runtimesDir, "cosyvoice", "models", "CosyVoice-300M-SFT")
const cosyVoiceFiles = [
  cosyVoicePython,
  join(runtimesDir, "cosyvoice", "runtime", "cosyvoice", "cli", "cosyvoice.py"),
  ...[
    "cosyvoice.yaml",
    "llm.pt",
    "flow.pt",
    "hift.pt",
    "spk2info.pt",
    "speech_tokenizer_v1.onnx",
  ].map((name) => join(cosyVoiceModelDir, name)),
]
const cosyVoice = cosyVoiceFiles.every((path) => existsSync(path))
  ? start(join(runtimesDir, "cosyvoice", "start.mjs"), {
      ...process.env,
      MOSS_COSYVOICE_PORT: process.env.MOSS_COSYVOICE_PORT ?? "5581",
    })
  : null

if (!cosyVoice) {
  console.warn("[tts-service] CosyVoice is optional; run `pnpm cosyvoice:setup` to enable it.")
}
if (!audio8) {
  console.warn("[tts-service] Audio8 is optional; run `pnpm audio8:setup` to enable it.")
}

let stopping = false

function stop(signal = "SIGTERM") {
  if (stopping) {
    return
  }
  stopping = true
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal))
}

audio8?.on("exit", (code) => {
  if (!stopping && code !== 0) {
    console.warn("[tts-service] Audio8 stopped; Kokoro and CosyVoice remain available.")
  }
})

cosyVoice?.on("exit", (code) => {
  if (!stopping && code !== 0) {
    console.warn("[tts-service] CosyVoice stopped; Audio8 and Kokoro remain available.")
  }
})

gateway.on("exit", (code) => {
  if (!stopping) {
    stop()
    process.exitCode = code ?? 1
  }
})
