/**
 * Thin wrapper over the JSON credential file that opencode keeps under
 * `$XDG_DATA_HOME/opencode/auth.json` (typically `~/.local/share/opencode/auth.json`
 * on Linux, `~/Library/Application Support/opencode/auth.json` on macOS via
 * `xdg-basedir`).
 *
 * We deliberately do NOT import opencode's Auth.Service — it lives behind an
 * Effect runtime + AppFileSystem layer that is overkill for a first-run wizard
 * and would force the onboarding package to take a heavy Effect dependency.
 * Reading + merging a small JSON object with `Bun.file` is sufficient and
 * leaves opencode's writer the source of truth for everything else.
 *
 * On read errors (missing file, corrupt JSON) we treat the store as empty so
 * the wizard can still capture a key.
 */
import path from "node:path"
import os from "node:os"

export type ApiCredential = {
  type: "api"
  key: string
  metadata?: Record<string, string>
}

export type OauthCredential = {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  accountId?: string
  enterpriseUrl?: string
}

export type WellKnownCredential = {
  type: "wellknown"
  key: string
  token: string
}

export type Credential = ApiCredential | OauthCredential | WellKnownCredential

const APP = "opencode"

/** Mirrors `xdg-basedir` data path resolution (env var first, then OS default). */
const xdgDataHome = (): string => {
  const env = process.env.XDG_DATA_HOME
  if (env && env.length > 0) return env
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support")
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA
    if (local) return local
    return path.join(os.homedir(), "AppData", "Local")
  }
  return path.join(os.homedir(), ".local", "share")
}

export const authFilePath = (): string => path.join(xdgDataHome(), APP, "auth.json")

/**
 * Read the entire auth.json. Returns `{}` if the file is missing or unparseable —
 * the wizard never wants to crash because of a stale credential file.
 */
export const readAll = async (): Promise<Record<string, Credential>> => {
  const file = Bun.file(authFilePath())
  const exists = await file.exists()
  if (!exists) return {}
  return file
    .json()
    .then((data) => (data && typeof data === "object" ? (data as Record<string, Credential>) : {}))
    .catch(() => ({}))
}

/** True when at least one provider has stored credentials. */
export const hasAnyCredential = async (): Promise<boolean> => {
  const all = await readAll()
  return Object.keys(all).length > 0
}

/** Names of providers with stored credentials, in insertion order. */
export const listProviders = async (): Promise<string[]> => {
  const all = await readAll()
  return Object.keys(all)
}

/**
 * Merge a new credential into auth.json under `providerID`, preserving every
 * other entry exactly. Writes with mode `0o600` to match opencode's writer.
 */
export const writeCredential = async (providerID: string, credential: Credential): Promise<void> => {
  const file = authFilePath()
  await Bun.write(Bun.file(path.dirname(file) + "/.keep"), "", { createPath: true }).catch(() => {})
  const existing = await readAll()
  const next = { ...existing, [providerID]: credential }
  await Bun.write(file, JSON.stringify(next, null, 2), { createPath: true })
  await Bun.$`chmod 600 ${file}`.quiet().nothrow()
}
