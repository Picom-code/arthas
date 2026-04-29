/**
 * First-run onboarding wizard for Arthas.
 *
 * The wizard ORCHESTRATES the existing `providers login` flow for first-time
 * users — it does not duplicate auth logic. After greeting the operator with
 * the welcome banner, it walks them through a single provider choice, captures
 * an API key (cloud) or a local probe (Ollama), and persists the credential to
 * the same JSON store opencode reads on startup.
 */
import { intro, outro, select, password, log, isCancel, spinner } from "@clack/prompts"
import { welcomeBanner } from "arthas-theme/logo"
import { STRINGS } from "arthas-theme/strings"
import { hasAnyCredential, listProviders, writeCredential, type ApiCredential } from "./store"
import { probeOllama, validateAnthropic, validateOpenAI, validateOpenRouter, type ValidationResult } from "./validate"

export type OnboardingResult = {
  /** Provider id chosen — empty string when the operator deferred. */
  provider: string
  /** True when a credential is now on disk (or already was). */
  configured: boolean
}

type CloudProviderID = "anthropic" | "openai" | "openrouter"

type CloudConfig = {
  id: CloudProviderID
  label: string
  consoleURL: string
  validate: (key: string) => Promise<ValidationResult>
}

const CLOUD_PROVIDERS: Record<CloudProviderID, CloudConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    consoleURL: "https://console.anthropic.com/settings/keys",
    validate: validateAnthropic,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    consoleURL: "https://platform.openai.com/api-keys",
    validate: validateOpenAI,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    consoleURL: "https://openrouter.ai/keys",
    validate: validateOpenRouter,
  },
}

const handleCloud = async (config: CloudConfig): Promise<OnboardingResult> => {
  log.info(`Visit ${config.consoleURL} to create an API key, then paste it here.`)
  const key = await password({
    message: `${config.label} API key`,
    validate: (v) => (v && v.length > 0 ? undefined : "Required"),
  })
  if (isCancel(key)) {
    outro(STRINGS.exitFarewell)
    return { provider: config.id, configured: false }
  }
  const sp = spinner()
  sp.start("Validating key...")
  const result = await config.validate(key)
  if (!result.ok) {
    sp.stop(result.reason ?? "Validation failed.", 1)
    log.warn("Key was not stored. Re-run `arthas onboard` once you have a working key.")
    outro(STRINGS.exitFarewell)
    return { provider: config.id, configured: false }
  }
  sp.stop("Key accepted.")
  const cred: ApiCredential = { type: "api", key }
  await writeCredential(config.id, cred)
  log.success(STRINGS.authReady)
  outro(`Done. Try: arthas crusade "hello"`)
  return { provider: config.id, configured: true }
}

const handleOllama = async (): Promise<OnboardingResult> => {
  const sp = spinner()
  sp.start("Probing local Ollama (http://localhost:11434)...")
  const probe = await probeOllama()
  if (probe.ok) {
    sp.stop("Ollama is reachable.")
    log.info("For triage routing, pull a small model: ollama pull qwen2.5:4b")
    outro(`Local compute ready. Try: arthas crusade "hello"`)
    return { provider: "ollama", configured: true }
  }
  sp.stop("Ollama not reachable on :11434.", 1)
  log.info("Install hint: brew install ollama && ollama serve")
  log.info("You can re-run `arthas onboard` once it's up.")
  outro(STRINGS.exitFarewell)
  return { provider: "ollama", configured: false }
}

const handleDefer = (): OnboardingResult => {
  log.info("No provider configured. Run `arthas onboard` or `arthas providers login` when you're ready.")
  log.info(STRINGS.authMissing)
  outro(STRINGS.exitFarewell)
  return { provider: "", configured: false }
}

/**
 * Run the onboarding wizard.
 *
 * @param opts.skipIfConfigured  When true, the wizard exits early and reports
 *   the first stored provider if any credentials already exist on disk. This
 *   lets the CLI auto-launch onboarding on first run without nagging existing
 *   users.
 */
export async function runOnboarding(opts?: { skipIfConfigured?: boolean }): Promise<OnboardingResult> {
  if (opts?.skipIfConfigured) {
    const already = await hasAnyCredential()
    if (already) {
      const providers = await listProviders()
      return { provider: providers[0] ?? "", configured: true }
    }
  }

  process.stderr.write(welcomeBanner)
  process.stderr.write("\n")

  intro(STRINGS.welcomeLine)

  const choice = await select<CloudProviderID | "ollama" | "later">({
    message: "Pick a provider.",
    options: [
      { value: "anthropic", label: "Anthropic", hint: "Claude — recommended" },
      { value: "openai", label: "OpenAI", hint: "GPT family" },
      { value: "openrouter", label: "OpenRouter", hint: "many models, one key" },
      { value: "ollama", label: "Ollama (local)", hint: "no key needed" },
      { value: "later", label: "Configure later" },
    ],
  })

  if (isCancel(choice)) {
    outro(STRINGS.exitFarewell)
    return { provider: "", configured: false }
  }

  if (choice === "later") return handleDefer()
  if (choice === "ollama") return handleOllama()
  return handleCloud(CLOUD_PROVIDERS[choice])
}
