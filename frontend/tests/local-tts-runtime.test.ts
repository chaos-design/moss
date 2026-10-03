import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

type PackageManifest = {
  dependencies?: Record<string, string>
  scripts: Record<string, string>
}

describe("local TTS runtime layout", () => {
  it("keeps production commands independent from the disposable isay directory", () => {
    const projectRoot = join(process.cwd(), "..")
    const manifest = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    ) as PackageManifest
    const frontendManifest = JSON.parse(
      readFileSync(join(projectRoot, "frontend/package.json"), "utf8"),
    ) as PackageManifest
    const expectedScripts = {
      "audio8:setup": "node backend/services/tts/runtimes/audio8/setup.mjs",
      "audio8:start": "node backend/services/tts/runtimes/audio8/start.mjs",
      "cosyvoice:setup": "node backend/services/tts/runtimes/cosyvoice/setup.mjs",
      "cosyvoice:start": "node backend/services/tts/runtimes/cosyvoice/start.mjs",
      "dev:offline": "node backend/dev.mjs",
      "tts:setup": "node backend/services/tts/setup.mjs",
      "tts:start": "node backend/services/tts/start.mjs",
      "tts:gateway": "node backend/services/tts/start-gateway.mjs",
    }

    expect(manifest.scripts).toMatchObject(expectedScripts)
    expect(Object.values(expectedScripts).every((command) => !command.includes("isay/"))).toBe(
      true,
    )

    for (const command of Object.values(expectedScripts)) {
      expect(existsSync(join(projectRoot, command.replace("node ", "")))).toBe(true)
    }
    expect(existsSync(join(projectRoot, "backend/services/tts/main.py"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/app.py"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/engines/kokoro.py"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/engines/audio8.py"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/engines/cosyvoice.py"))).toBe(
      true,
    )
    expect(existsSync(join(projectRoot, "backend/services/tts/requirements.txt"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/setup.mjs"))).toBe(true)
    expect(existsSync(join(projectRoot, "backend/services/tts/runtimes/audio8/app.py"))).toBe(
      true,
    )
    expect(
      existsSync(join(projectRoot, "backend/services/tts/runtimes/audio8/engine.py")),
    ).toBe(true)
    expect(
      existsSync(join(projectRoot, "backend/services/tts/runtimes/cosyvoice/app.py")),
    ).toBe(true)
    expect(
      existsSync(join(projectRoot, "backend/services/tts/runtimes/cosyvoice/engine.py")),
    ).toBe(true)
    expect(existsSync(join(projectRoot, "local-tts/chattts_server.py"))).toBe(false)
    expect(JSON.stringify(manifest.scripts)).not.toContain("chattts")
    expect(frontendManifest.dependencies).not.toHaveProperty("kokoro-js")
  })
})
