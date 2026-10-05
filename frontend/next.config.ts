import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.dirname(frontendRoot)
const publicEnvironmentKeys = [
  "NEXT_PUBLIC_ASR_API_MODEL",
  "NEXT_PUBLIC_ASR_API_URL",
  "NEXT_PUBLIC_ASR_SERVICE_URL",
  "NEXT_PUBLIC_FUNASR_SERVICE_URL",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_TTS_API_MODEL",
  "NEXT_PUBLIC_TTS_API_URL",
  "NEXT_PUBLIC_TTS_SERVICE_URL",
] as const

export function getPublicEnvironment(environment: Record<string, string | undefined>) {
  return Object.fromEntries(
    publicEnvironmentKeys.flatMap((key) => {
      const value = environment[key]?.trim()
      return value ? [[key, value]] : []
    }),
  )
}

export default function createNextConfig(phase: string): NextConfig {
  loadEnvConfig(workspaceRoot, phase === PHASE_DEVELOPMENT_SERVER, console, true)

  return {
    distDir: process.env.NEXT_DIST_DIR || ".next",
    reactStrictMode: true,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    outputFileTracingIncludes: {
      "/api/conversation": ["./src/lib/memory/prompts/conversation-system.md"],
    },
    // Next only inlines public variables from its app directory automatically.
    // The workspace keeps one root env file, so expose those values explicitly.
    env: getPublicEnvironment(process.env),
    turbopack: {
      root: workspaceRoot,
    },
  }
}
