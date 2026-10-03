# Moss Backend Guide

## Scope

This directory owns Python speech services, Supabase SQL, backend tests, and local process
orchestration. Next.js business Route Handlers remain under `frontend/src/app/api`; do not create a
second HTTP business layer in `backend`.

## Service Boundaries

- `services/asr` accepts browser PCM over WebSocket, performs VAD and transcription, and returns
  protocol events. It never stores raw audio or transcripts.
- `services/tts` is the only browser-facing synthesis endpoint. Kokoro runs in the gateway;
  Audio8 and CosyVoice are private optional sidecars.
- `supabase/platform.sql` is the complete new-instance schema. `supabase/update.sql` is the current
  existing-instance migration path.
- `dev.mjs` starts Web, ASR, and TTS as one local process group and must terminate siblings when a
  required child exits.

## Python And Runtime Rules

- Keep ASR, TTS gateway, Audio8, and CosyVoice virtual environments independent.
- Model directories, generated audio, virtual environments, and credentials are not committed.
- Services bind to loopback by default. Public ASR requires TLS/WSS termination, an exact Origin
  allowlist, and `MOSS_ASR_API_KEY`.
- Preserve explicit limits for connections, chunks, audio duration, generated tokens, text length,
  cache size, and concurrency.
- Health endpoints report process and model readiness only. Real speech quality requires a target
  hardware smoke test.
- Tests must not download or load full speech models.

## Database Rules

- Every user-owned table has RLS and owner-scoped policies. Child records must verify parent
  ownership.
- Shared rate limiting uses the atomic PostgreSQL `check_rate_limit` RPC; do not replace it with
  per-process counters for ordinary authenticated requests.
- Schema changes update both SQL entry points and `tests/supabase` in the same change.
- Never replay `platform.sql` over an existing project. Validate upgrades in an isolated project.
- Service role keys are restricted to server-side account deletion and controlled administration
  scripts.

## Verification

Use the narrow command while iterating, then the root quality gate:

```bash
pnpm asr:test
pnpm tts:test
pnpm db:test
pnpm check
```

Remote database checks require dedicated test credentials and an isolated or explicitly approved
project. See `../docs/development.md`, `../docs/deployment.md`, and each service README for exact
commands and production checks.
