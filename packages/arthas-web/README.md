# arthas-web

The Arthas PWA — "continue your quest from your phone on the train."

A Next.js 15 (App Router) app that reads sessions and their event logs from
Supabase and live-streams new events via Supabase Realtime.

## Setup

```bash
cd packages/arthas-web
bun install     # from repo root works too — workspaces pick this up
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
bun dev
```

The app gracefully renders an explanatory placeholder when env vars are
missing, so `bun dev` works for layout / styling work even before
Supabase is wired up.

## Required env vars

| Var | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |

## Routes

- `/` — landing + sign-in CTA
- `/login` — magic-link sign-in
- `/sessions` — server-rendered list of the user's sessions
- `/sessions/[id]` — live transcript with Realtime updates

## Build

```bash
bun run build   # next build, output: standalone
bun run start   # serve the standalone build
```

## Constraints

- Server Components by default; `"use client"` only where needed
  (`/login`, `Transcript`).
- Reads from `sessions` and `session_events` tables owned by the
  sync stream. The schema may evolve — components are tolerant of
  missing optional columns.
