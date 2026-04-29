import type { Config } from "tailwindcss"

/**
 * Tailwind v4 reads most config from CSS via @theme blocks
 * (see app/globals.css). This file is kept for tooling that still
 * scans a config (IDE plugins) and to declare the content roots.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mirror the canonical Arthas palette so utility classes like
        // `text-arthas-primary` work even before the @theme block resolves.
        "arthas-primary": "#0D7A7A",
        "arthas-bg": "#0F1419",
        "arthas-text": "#F0F9F9",
        "arthas-muted": "#64748B",
        "arthas-error": "#FF6B6B",
        "arthas-warning": "#FFD166",
        "arthas-success": "#52B788",
      },
    },
  },
  plugins: [],
}

export default config
