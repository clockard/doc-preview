import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../examples/demo/public/fixtures')

/**
 * Read a fixture as an ArrayBuffer belonging to the *test* realm.
 *
 * A Node Buffer's backing `.buffer` is created in the Node realm, so inside
 * jsdom it fails `instanceof ArrayBuffer` and libraries like JSZip reject it
 * outright. Copying through a locally constructed Uint8Array fixes the realm.
 */
export async function fixture(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(resolve(FIXTURES, name))
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

export function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

/** Minimal Response stand-in; jsdom has no fetch of its own. */
export function jsonlessResponse(
  body: ArrayBuffer,
  init: { status?: number; statusText?: string; contentType?: string } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: {
      'content-type': init.contentType ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    },
  })
}

/**
 * A drivable IntersectionObserver.
 *
 * The global stub in setup.ts is a no-op, so a lazy thumbnail would never see an
 * intersection and never fetch — tests need to say when a tile comes into view.
 * Returns a `trigger` that fires every live observer.
 */
export function stubIntersectionObserver() {
  const callbacks = new Set<IntersectionObserverCallback>()

  class Controllable {
    constructor(private callback: IntersectionObserverCallback) {
      callbacks.add(callback)
    }
    observe() {}
    unobserve() {}
    disconnect() {
      callbacks.delete(this.callback)
    }
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  const previous = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = Controllable as unknown as typeof IntersectionObserver

  return {
    trigger(isIntersecting = true) {
      for (const callback of [...callbacks]) {
        callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      }
    },
    restore() {
      globalThis.IntersectionObserver = previous
      callbacks.clear()
    },
  }
}
