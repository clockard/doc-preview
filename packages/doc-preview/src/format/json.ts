export interface FormatResult {
  text: string
  /** Set when the input could not be parsed; `text` is then the original. */
  error?: string
}

const INDENT = 2

/**
 * Re-serialise JSON with indentation.
 *
 * Invalid input is returned unchanged rather than swallowed: a malformed
 * document is exactly when someone needs to look at the raw bytes, so the
 * renderer shows the original text alongside the parser's complaint.
 */
export function formatJson(text: string): FormatResult {
  const trimmed = text.trim()
  if (trimmed === '') return { text }

  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, INDENT) }
  } catch (err) {
    const single = (err as Error).message
    // Newline-delimited JSON is common enough from log pipelines that failing
    // outright on it would be unhelpful.
    const ndjson = tryNdjson(trimmed)
    if (ndjson) return ndjson
    return { text, error: single }
  }
}

function tryNdjson(text: string): FormatResult | null {
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  if (lines.length < 2) return null

  const parsed: unknown[] = []
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line))
    } catch {
      return null
    }
  }
  return { text: parsed.map((entry) => JSON.stringify(entry, null, INDENT)).join('\n') }
}
