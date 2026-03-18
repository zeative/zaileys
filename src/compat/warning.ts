const emittedWarnings = new Set<string>()

/**
 * Logs a warning to the console, but only once per unique key.
 */
export function warnOnce(key: string, message: string) {
  if (emittedWarnings.has(key)) return

  console.warn(`[Zaileys V4 Deprecation] ${message}`)
  emittedWarnings.add(key)
}

/**
 * Reset emitted warnings (for testing).
 */
export function resetWarnings() {
  emittedWarnings.clear()
}
