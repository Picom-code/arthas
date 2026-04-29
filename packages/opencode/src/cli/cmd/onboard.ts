import { cmd } from "./cmd"
import { runOnboarding } from "arthas-onboarding/wizard"

/**
 * `arthas onboard` — first-run wizard. Walks the operator through provider
 * selection and credential capture, then writes to opencode's auth.json so the
 * rest of the harness picks it up unchanged. The flag `--if-needed` lets the
 * launcher invoke this command unconditionally; it returns immediately when a
 * provider is already configured.
 */
export const OnboardCommand = cmd({
  command: "onboard",
  describe: "first-run wizard: pick a provider and capture credentials",
  builder: (yargs) =>
    yargs.option("if-needed", {
      describe: "skip silently when at least one provider is already configured",
      type: "boolean",
      default: false,
    }),
  async handler(args) {
    const result = await runOnboarding({ skipIfConfigured: args["if-needed"] === true })
    if (!result.configured) process.exitCode = 1
  },
})
