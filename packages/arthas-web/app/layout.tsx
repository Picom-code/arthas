import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { PALETTE } from "@/lib/palette"
import "./globals.css"

export const metadata: Metadata = {
  title: "Arthas",
  description: "Knight-themed AI agent harness — continue your quest from any device.",
  applicationName: "Arthas",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arthas",
  },
}

export const viewport: Viewport = {
  themeColor: PALETTE.primary,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-arthas-bg text-arthas-text antialiased">
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
          {children}
        </div>
      </body>
    </html>
  )
}
