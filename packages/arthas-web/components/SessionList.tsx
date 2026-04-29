import Link from "next/link"

export interface SessionRow {
  id: string
  title: string | null
  updated_at: string
  // Optional fields populated by sync stream's schema work.
  device?: string | null
  status?: string | null
}

interface SessionListProps {
  sessions: SessionRow[]
}

/**
 * Mobile-first card list. Each row links to /sessions/[id] for the
 * live transcript view.
 */
export function SessionList({ sessions }: SessionListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            href={`/sessions/${s.id}`}
            className="flex flex-col gap-1 rounded-lg border border-arthas-primary/20 bg-arthas-bg/40 p-4 transition hover:border-arthas-primary/60 hover:bg-arthas-bg/70"
          >
            <span className="font-medium text-arthas-text">{s.title ?? "Untitled quest"}</span>
            <span className="flex gap-2 text-xs text-arthas-muted">
              <time dateTime={s.updated_at}>{formatRelative(s.updated_at)}</time>
              {s.device ? <span>· {s.device}</span> : null}
              {s.status ? <span>· {s.status}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
