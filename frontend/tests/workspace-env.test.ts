import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { getPublicEnvironment } from "../next.config"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("workspace environment loading", () => {
  it("exposes configured public variables to the Next build", () => {
    expect(
      getPublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        NEXT_PUBLIC_DEMO_MODE: "",
        PRIVATE_SECRET: "never-expose",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    })
  })

  it("force-loads the root .env.local after Next processes the frontend directory", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "moss-env-"))
    temporaryDirectories.push(workspaceRoot)
    const frontendRoot = join(workspaceRoot, "frontend")
    mkdirSync(frontendRoot)
    writeFileSync(join(workspaceRoot, ".env.local"), "MOSS_WORKSPACE_ENV_TEST=loaded\n")

    const script = `
      const { loadEnvConfig } = require(process.argv[1])
      const frontendRoot = process.argv[2]
      const workspaceRoot = process.argv[3]
      loadEnvConfig(frontendRoot, false)
      const beforeForceReload = process.env.MOSS_WORKSPACE_ENV_TEST ?? null
      loadEnvConfig(workspaceRoot, false, console, true)
      process.stdout.write(JSON.stringify({
        beforeForceReload,
        afterForceReload: process.env.MOSS_WORKSPACE_ENV_TEST ?? null,
      }))
    `
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
    }
    delete childEnvironment.MOSS_WORKSPACE_ENV_TEST
    const output = execFileSync(
      process.execPath,
      ["-e", script, require.resolve("@next/env"), frontendRoot, workspaceRoot],
      {
        encoding: "utf8",
        env: childEnvironment,
      },
    )

    expect(JSON.parse(output)).toEqual({
      beforeForceReload: null,
      afterForceReload: "loaded",
    })
  })
})
