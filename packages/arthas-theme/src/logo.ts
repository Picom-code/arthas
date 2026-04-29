/**
 * ASCII banners for the Arthas CLI.
 *
 * Layout:
 *  - Top wordmark: figlet "Arthas".
 *  - Knight scene: three foot knights with shields (M/D/C) flanked by a mounted knight.
 *
 * Constraints:
 *  - The crossed-swords glyph appears at most once across the whole banner (welcome tagline).
 *  - Both banners must render legibly on a non-color terminal.
 */

// Figlet wordmark + knight scene. Used by `--help`.
export const helpBanner = [
  "    _         _   _               ",
  "   / \\   _ __| |_| |__   __ _ ___ ",
  "  / _ \\ | '__| __| '_ \\ / _` / __|",
  " / ___ \\| |  | |_| | | | (_| \\__ \\",
  "/_/   \\_\\_|   \\__|_| |_|\\__,_|___/",
  "",
  " _   _   _   _+       |",
  "/_`-'_`-'_`-'_|  \\+/  |",
  "\\_`M'_`D'_`C'_| _<=>_ |",
  "  `-' `-' `-' 0/ \\ / o=o",
  "              \\/\\ ^ /`0",
  "              | /_^_\\",
  "              | || ||",
  "            __|_d|_|b__",
  "",
].join("\n")

// Same scene plus a one-line tagline. Shown once at REPL boot.
export const welcomeBanner = [
  "    _         _   _                ",
  "   / \\   _ __| |_| |__   __ _ ___  ",
  "  / _ \\ | '__| __| '_ \\ / _` / __| ",
  " / ___ \\| |  | |_| | | | (_| \\__ \\ ",
  "/_/   \\_\\_|   \\__|_| |_|\\__,_|___/ ",
  "",
  " _   _   _   _+       |",
  "/_`-'_`-'_`-'_|  \\+/  |",
  "\\_`M'_`D'_`C'_| _<=>_ |",
  "  `-' `-' `-' 0/ \\ / o=o",
  "              \\/\\ ^ /`0",
  "              | /_^_\\",
  "              | || ||",
  "            __|_d|_|b__",
  "",
].join("\n")
