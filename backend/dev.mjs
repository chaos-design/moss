import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const backendDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(backendDir)
// Warm up Qwen3-ASR at startup so the first voice turn that selects it does not
// wait for a cold CPU load. Respect an explicit override so operators can opt
// out or preload a different set.
const asrEnv = {
  ...process.env,
  MOSS_ASR_PRELOAD_ENGINES: process.env.MOSS_ASR_PRELOAD_ENGINES ?? "qwen3-asr",
}
const children = [
  spawn(process.execPath, [join(backendDir, "services", "tts", "start.mjs")], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }),
  spawn(process.execPath, [join(backendDir, "services", "asr", "start.mjs")], {
    cwd: projectRoot,
    env: asrEnv,
    stdio: "inherit",
  }),
  spawn("pnpm", ["dev"], {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  }),
]

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

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) {
      stop()
      process.exitCode = code ?? 1
    }
  })
}
