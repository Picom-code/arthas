/**
 * Apple Silicon + RAM detection.
 *
 * REPORTING ONLY. This module never installs Ollama, never pulls models,
 * and never auto-enables local routing. It just answers: "what hardware are
 * we on?" — callers decide what to do with the answer (typically: prompt the
 * user to opt in).
 *
 * Returns a safe default (`{ isAppleSilicon: false, ramGB: 0 }`) on any
 * failure. No try/catch — we use `Bun.spawn` and `.exited` promises with
 * `.catch()` chains.
 */

export interface SystemInfo {
  isAppleSilicon: boolean
  chip?: string
  ramGB: number
}

const SAFE_DEFAULT: SystemInfo = { isAppleSilicon: false, ramGB: 0 }

export function detectAppleSilicon(): Promise<SystemInfo> {
  if (process.platform !== "darwin") return Promise.resolve(SAFE_DEFAULT)
  return Promise.all([readSysctl("machdep.cpu.brand_string"), readSysctl("hw.memsize")])
    .then(([brand, mem]): SystemInfo => {
      if (brand === undefined || mem === undefined) return SAFE_DEFAULT
      const memBytes = Number.parseInt(mem, 10)
      const ramGB = Number.isFinite(memBytes) && memBytes > 0 ? Math.round(memBytes / (1024 * 1024 * 1024)) : 0
      const isAppleSilicon = /apple/i.test(brand)
      return isAppleSilicon ? { isAppleSilicon: true, chip: brand, ramGB } : { isAppleSilicon: false, ramGB }
    })
    .catch(() => SAFE_DEFAULT)
}

function readSysctl(key: string): Promise<string | undefined> {
  const proc = Bun.spawn(["sysctl", "-n", key], {
    stdout: "pipe",
    stderr: "ignore",
  })
  return proc.exited
    .then((code) => (code === 0 ? new Response(proc.stdout).text() : Promise.reject(new Error(`sysctl ${key} exit ${code}`))))
    .then((text) => text.trim())
    .catch(() => undefined)
}
