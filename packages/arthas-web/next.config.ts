import type { NextConfig } from "next"

const config: NextConfig = {
  // Standalone output enables `node .next/standalone/server.js` style
  // self-hosting on Fly / Render / a Hetzner box.
  output: "standalone",
  reactStrictMode: true,
  // Theme palette + strings come from a sibling workspace package that
  // ships TS source, not a built dist; Next must transpile it.
  transpilePackages: ["arthas-theme"],
  experimental: {
    // App Router server actions default; nothing exotic here yet.
  },
}

export default config
