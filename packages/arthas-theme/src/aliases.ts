/**
 * Knight-themed command aliases.
 *
 * Both the alias and the vanilla name must always work in the CLI.
 * Tool-facing names (Read, Write, Bash) are intentionally NOT aliased —
 * theming MCP-facing tool names breaks model calling.
 */
export const COMMAND_ALIASES = {
  summon: "chat",
  crusade: "run",
  kneel: "login",
  vault: "keys",
  scroll: "history",
  tome: "tools",
} as const

export type CommandAlias = keyof typeof COMMAND_ALIASES
export type VanillaCommand = (typeof COMMAND_ALIASES)[CommandAlias]

/**
 * Reverse lookup: vanilla command name → knight alias.
 * Returns `undefined` for vanilla names that have no themed equivalent.
 */
export const aliasFor = (vanilla: string): CommandAlias | undefined => {
  const entry = Object.entries(COMMAND_ALIASES).find(([, v]) => v === vanilla)
  return entry?.[0] as CommandAlias | undefined
}

/**
 * Forward lookup: knight alias → vanilla command. Returns `undefined`
 * if the input is not a known alias. Useful for the CLI dispatcher.
 */
export const resolveAlias = (input: string): VanillaCommand | undefined => {
  return COMMAND_ALIASES[input as CommandAlias]
}
