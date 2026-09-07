import { useEffect, useState } from 'react'
import { DocumentPreviewError } from './types'
import type { DocumentMeta } from './types'
import { fileNameOf, resolveKind } from './resolveKind'

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024

export interface SourceState {
  status: 'loading' | 'ready' | 'error'
  data?: ArrayBuffer
  meta?: DocumentMeta
  error?: DocumentPreviewError
  /** 0..1 when the response declares a length, otherwise undefined. */
  progress?: number
}

interface SourceInput {
  url: string
  mimeType?: string
  fileName?: string
  fetchOptions?: RequestInit
  maxBytes?: number
  /**
   * Set false to hold off fetching — the thumbnail grid uses this to defer work
   * until a tile nears the viewport. The state stays `loading` while disabled
   * rather than gaining an `idle` status, which would be a breaking change for
   * anyone switching exhaustively on `SourceState['status']`.
   */
  enabled?: boolean
}

/**
 * Fetch a document into memory and identify it.
 *
 * Aborts in flight when the URL changes or the component unmounts, so a fast
 * click through a file list cannot leave a stale response to win a race.
 */
export function useDocumentSource(input: SourceInput): SourceState {
  const { url, mimeType, fileName, fetchOptions, maxBytes = DEFAULT_MAX_BYTES, enabled = true } = input
  const [state, setState] = useState<SourceState>({ status: 'loading' })

  // fetchOptions is typically an inline object literal, so identity is unstable.
  // Serialising it keeps the effect from refetching on every parent render.
  const fetchOptionsKey = JSON.stringify(fetchOptions ?? null)

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let cancelled = false

    setState({ status: 'loading', progress: undefined })

    void (async () => {
      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal })
        if (!response.ok) {
          throw new DocumentPreviewError(
            'http',
            `Could not load the document (HTTP ${response.status} ${response.statusText}).`,
            { status: response.status },
          )
        }

        const declared = Number(response.headers.get('content-length') ?? '')
        if (Number.isFinite(declared) && declared > maxBytes) {
          throw new DocumentPreviewError(
            'too-large',
            `This document is ${formatBytes(declared)}, larger than the ${formatBytes(maxBytes)} limit.`,
          )
        }

        const data = await readWithProgress(response, declared, maxBytes, (progress) => {
          if (!cancelled) setState((prev) => (prev.status === 'loading' ? { ...prev, progress } : prev))
        })
        if (cancelled) return

        const resolved = await resolveKind({
          // A server-declared type beats the caller's hint: it reflects the bytes on the wire.
          mimeType: response.headers.get('content-type') ?? mimeType,
          fileName,
          url,
          data,
        })
        if (cancelled) return

        setState({
          status: 'ready',
          data,
          meta: {
            ...resolved,
            fileName: fileNameOf(url, fileName),
            byteLength: data.byteLength,
            url,
          },
        })
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setState({ status: 'error', error: asPreviewError(err) })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mimeType, fileName, fetchOptionsKey, maxBytes, enabled])

  return state
}

/**
 * Stream the body so the size guard trips partway through an oversized
 * download rather than after it has all been buffered.
 */
async function readWithProgress(
  response: Response,
  declared: number,
  maxBytes: number,
  onProgress: (progress: number | undefined) => void,
): Promise<ArrayBuffer> {
  if (!response.body) return response.arrayBuffer()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new DocumentPreviewError(
        'too-large',
        `This document exceeds the ${formatBytes(maxBytes)} limit.`,
      )
    }
    onProgress(Number.isFinite(declared) && declared > 0 ? received / declared : undefined)
  }

  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer
}

function asPreviewError(err: unknown): DocumentPreviewError {
  if (err instanceof DocumentPreviewError) return err
  if (err instanceof Error) {
    return new DocumentPreviewError('fetch', err.message, { cause: err })
  }
  return new DocumentPreviewError('fetch', 'The document could not be loaded.')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'an unknown size'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
