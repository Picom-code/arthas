/**
 * ASCII banners for the Arthas CLI.
 *
 * Constraints:
 *  - Default `helpBanner` is the lean wordmark printed by `--help`.
 *  - `welcomeBanner` is shown once at REPL boot; max 8 lines, 70 cols.
 *  - The crossed-swords glyph appears at most once across the whole banner.
 */

// 6 lines, ~52 cols. No emoji — terminals without color/UTF8 still read clean.
export const helpBanner = [
  "    _         _   _               ",
  "   / \\   _ __| |_| |__   __ _ ___ ",
  "  / _ \\ | '__| __| '_ \\ / _` / __|",
  " / ___ \\| |  | |_| | | | (_| \\__ \\",
  "/_/   \\_\\_|   \\__|_| |_|\\__,_|___/",
  "",
].join("\n")

// 8 lines, ~66 cols. One ⚔️ in the tagline line.
export const welcomeBanner = [
  "    _         _   _                ",
  "   / \\   _ __| |_| |__   __ _ ___  ",
  "  / _ \\ | '__| __| '_ \\ / _` / __| ",
  " / ___ \\| |  | |_| | | | (_| \\__ \\ ",
  "/_/   \\_\\_|   \\__|_| |_|\\__,_|___/ ",
  "",
  "  ⚔  the knight-themed agent harness",
  "",
].join("\n")
