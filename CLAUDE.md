# Arthas — Claude Code Project Memory

This file is loaded into Claude Code's context for any session inside `~/arthas/`. Read it like a working agreement.

## What this repo is

Arthas is a knight-themed AI agent harness — a hard-fork of [sst/opencode](https://github.com/sst/opencode) with three differentiators bolted on top: cross-device sync (optional), heavy observability, and local-compute acceleration via Ollama.

Plan of record: `/Users/patrickmoorhead/.claude/plans/i-would-like-to-frolicking-cherny.md`.

## Branches

- **`main`** — Arthas's primary branch. Push here.
- **`dev`** — kept locally to track upstream (`upstream/dev` → `sst/opencode`). Pull from upstream onto `dev`, merge into `main` selectively.
- **`feat/core`, `feat/observability`, `feat/triage`, `feat/sync`, `feat/cloud`** — long-lived feature branches checked out as worktrees for parallel build streams.

## Subagents (in `.claude/agents/`)

When a task fits one of these scopes, use the subagent rather than working in the main thread. Each has a tight system prompt — see the file for scope.

| Subagent | Use for |
| --- | --- |
| `cli-builder` | CLI surface, command parsing, OpenTUI shell, plugin loader, knight aliases |
| `observability-engineer` | JSONL event log, sidebar widgets, OTLP, `tome cost`/`tome replay` |
| `triage-engineer` | Ollama, RouteLLM-style routing, embeddings, summarization |
| `sync-engineer` | Supabase migrations + RLS, sync engine, executor lease, `kneel`/`resume`/`handoff` |
| `mcp-author` | Scaffolding new MCP servers in `packages/mcp-bundle/` |
| `theme-stylist` | Palette, ASCII art, branded copy (visual/text only, no logic) |

## Style guide (inherited from opencode)

- **No `try`/`catch`** unless absolutely needed. Use Effect.ts patterns already in opencode.
- **No `any`.** Prefer type inference; explicit types only at exported boundaries.
- **Use Bun APIs** (`Bun.file`, `Bun.spawn`) instead of Node `fs`/`child_process`.
- **Inline single-use variables.** Prefer dot notation over destructuring.
- **`const` only.** No `let`. Use ternaries / early returns.
- **Early returns over `else`.**
- **Prefer functional array methods** (flatMap, filter, map) over for loops; type-guard filters to keep inference downstream.

## Type contracts

Existing types live in opencode's modules — **do not duplicate them**:
- Session events: `packages/opencode/src/v2/session-event.ts` — Effect.ts Schema, namespace `SessionEvent`. Includes `Prompt`, `FileAttachment`, `AgentAttachment`, `RetryError`. Add new event variants here as new `Schema.Class` exports.
- Bus: `packages/opencode/src/bus/bus-event.ts` — event registry via `define()`. Hook into the bus to subscribe.
- Session schema: `packages/opencode/src/session/schema.ts`.

Arthas-specific types (observability records, sync state, knight settings) live in `packages/arthas-core/` (created on demand by the relevant engineer).

## Knight branding rules

- Commands ship with knight aliases: `summon` (chat), `crusade` (run), `kneel` (login), `vault` (keys/settings), `scroll` (history/search), `tome` (tools/diagnostics). Vanilla aliases must always work.
- **Tool names stay vanilla** (`Read`, `Write`, `Bash`). Theming MCP-facing tool names breaks model calling.
- Palette: teal `#0D7A7A` primary, slate `#0F1419` bg, bone-white `#F0F9F9` text. Errors red, warnings amber, success sage.
- Subtle voice. "Frostmourne hungers" once on the welcome screen, not in every error.

## Parallel work model

Work decomposes into 3-5 streams (core, observability, triage, sync, cloud). Each stream lives in its own worktree under `~/arthas-<stream>/` with a long-lived `claude` session. Run streams concurrently. Merge into `main` via PR.

Inside a single session, fan out via the Agent tool (`isolation: "worktree"`) for one-shot bursts (e.g., scaffolding multiple MCP servers).

Lock shared types **before** fan-out so streams develop against stable contracts.

## Commits

- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `chore: ...`.
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Don't amend; create new commits. After hook failure, fix and re-commit.

## Risky changes

Anything touching `auth/`, `supabase/migrations/`, RLS policies, key storage, executor lease, or sync conflict logic must run through `/ultrareview` before merging into `main`.

## Test entry points

- `bun typecheck` (root) — runs turborepo typecheck across packages
- `bun lint` (root) — oxlint
- `bun test` — DO NOT run from root; cd into the package and run there (per `bunfig.toml`)
- `bun run dev` (root) — runs opencode locally from `packages/opencode/`

## When in doubt

Check the plan file at `/Users/patrickmoorhead/.claude/plans/i-would-like-to-frolicking-cherny.md`. If the answer isn't there, ask Patrick.
