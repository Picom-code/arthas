import type { ReactNode } from "react"

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
  variant?: "info" | "config"
}

/**
 * Generic empty / placeholder card.
 *
 * Used when:
 *  - Supabase env vars are missing (variant="config")
 *  - The user has no sessions yet (variant="info")
 */
export function EmptyState({ title, description, action, variant = "info" }: EmptyStateProps) {
  const accent = variant === "config" ? "border-arthas-warning/40" : "border-arthas-primary/30"
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border ${accent} bg-arthas-bg/60 p-6 text-center`}
    >
      <h2 className="text-lg font-semibold text-arthas-text">{title}</h2>
      <p className="text-sm leading-relaxed text-arthas-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
