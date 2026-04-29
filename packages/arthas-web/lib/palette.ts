/**
 * Re-exports the canonical Arthas palette so Server Components can
 * inline hex values (theme-color meta, inline SVG fills, etc.) without
 * forcing every consumer to import from the workspace package directly.
 */
export { PALETTE } from "arthas-theme/palette"
export type { PaletteKey, PaletteValue } from "arthas-theme/palette"
