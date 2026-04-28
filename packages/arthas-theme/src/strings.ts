/**
 * Branded copy used at well-defined surfaces in the CLI.
 *
 * Keep voice subtle. Frostmourne reference exists in exactly one place
 * (the welcome screen tagline) — do NOT propagate it into errors or
 * everyday status messages.
 */
export const STRINGS = {
  welcomeLine: "Welcome, champion.",
  welcomeTagline: "Frostmourne hungers.",
  helpHeader: "Arthas — knight-themed AI agent harness.",
  promptHint: "Type a quest, or /help for the codex.",
  exitFarewell: "Until next dawn.",
  authReady: "The vault is sealed. Your keys are safe.",
  authMissing: "No vows on file. Run `arthas kneel` to bind a provider.",
} as const

export type StringKey = keyof typeof STRINGS
