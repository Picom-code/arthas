/**
 * Arthas wordmark.
 *
 * Compact SVG knight badge plus the wordmark in a serif-flavored monospace
 * stack — readable on a phone, themed on desktop.
 */
export function Banner() {
  return (
    <header className="flex items-center gap-3">
      <KnightBadge />
      <span
        className="font-mono text-2xl font-bold tracking-tight text-arthas-text"
        aria-label="Arthas"
      >
        Arthas
      </span>
    </header>
  )
}

function KnightBadge() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2 L20 6 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V6 Z"
        stroke="#0D7A7A"
        strokeWidth="1.5"
        fill="#0F1419"
      />
      <path d="M9 9 L12 6 L15 9 L12 12 Z" fill="#0D7A7A" />
      <path d="M8 13 H16 V14 H8 Z" fill="#0D7A7A" />
    </svg>
  )
}
