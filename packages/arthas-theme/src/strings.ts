/**
 * Branded copy used at well-defined surfaces in the CLI.
 *
 * Keep voice neutral. The brand lives in the name, the figlet, the knight
 * scene, the teal palette, and the optional command aliases (crusade, kneel,
 * etc.). Words don't need to do double duty — over-the-top fantasy copy gets
 * old fast.
 */
export const STRINGS = {
  welcomeLine: "Welcome to Arthas.",
  helpHeader: "Arthas — AI coding agent.",
  promptHint: "Type a message, or /help for commands.",
  exitFarewell: "Goodbye.",
  authReady: "Credentials stored.",
  authMissing: "No credentials configured. Run `arthas onboard` to set up a provider.",
} as const

export type StringKey = keyof typeof STRINGS
