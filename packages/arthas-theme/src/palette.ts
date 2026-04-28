/**
 * Arthas canonical color palette.
 *
 * Hex strings only; consumers (OpenTUI, ink, web) convert as needed.
 * Keep this list small — every addition is a brand decision.
 */
export const PALETTE = {
  primary: "#0D7A7A",
  background: "#0F1419",
  text: "#F0F9F9",
  muted: "#64748B",
  error: "#FF6B6B",
  warning: "#FFD166",
  success: "#52B788",
} as const

export type PaletteKey = keyof typeof PALETTE
export type PaletteValue = (typeof PALETTE)[PaletteKey]
