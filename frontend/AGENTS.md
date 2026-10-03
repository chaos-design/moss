<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Moss Frontend Guide

## Boundaries

- `src/app` composes routes and layouts. Route Handlers validate transport input and call domain
  or server facades.
- `src/features` owns interactive workflows. Shared UI belongs in `src/components`; primitive
  shadcn components stay in `src/components/ui`.
- `src/lib` contains React-free domain logic. Server-only dependencies stay in `src/lib/server`.
- Use Server Components by default and add `"use client"` only for browser APIs, state, effects,
  or event handlers.

## Conventions

- File names use lowercase kebab-case; functions use camelCase; React components and types use
  PascalCase.
- Use Tailwind v4 semantic tokens from `src/app/globals.css`, Lucide icons, existing shadcn
  components, `gap-*`, `size-*`, and `cn()` for conditional classes.
- Product workspaces are compact and task-first. Do not add marketing sections, nested cards, or
  decorative gradients.
- Support 320px minimum width and explicitly verify 390px without horizontal page overflow.
- Lists and transcripts that can grow must own a bounded `overflow-y-auto` region. Use `min-h-0`
  through every flex/grid ancestor so fixed headers and action rows stay visible.

## Product Contracts

- `LearningMemoryProvider` is the shared owner of learning state. Write locally before cloud sync.
- Model configuration stays only in `moss:model-config:v1`; never persist it in learning memory,
  logs, API payloads unrelated to inference, or Supabase.
- Conversation main replies are English. Chinese translation and explanations remain in separate
  assistance regions, and correction highlighting is word-level rather than bold.
- Shadowing scripts contain both roles. Role swaps change the practice side without rewriting the
  script; raw microphone audio is never persisted.
- Scene definitions, detailed conversation content, and shadowing scripts live in their respective
  `src/lib` modules. Do not hardcode them inside feature components.

## Verification

Run `pnpm typecheck` and focused Vitest tests during development. Before completion run the root
`pnpm check`, then `pnpm build` for route, type, or bundling changes. Inspect visual changes at a
desktop viewport and 390px mobile width.

The complete engineering policy is in `../AGENTS.md`; local setup and service workflows are in
`../docs/development.md`.
