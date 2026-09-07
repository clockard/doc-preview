/**
 * Fail the build if the library source can reach the network.
 *
 * The offline guarantee is easy to break silently: a CDN worker URL, a Google
 * Fonts @import, or a forgotten pdf.js asset option still renders something, so
 * nothing looks wrong until the network is actually gone. This is the cheap
 * mechanical half of that check; the manual DevTools-offline pass is the other.
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'packages/doc-preview/src')

/**
 * Hosts that are not remote resources:
 * - localhost / 127.0.0.1 — used only as a base for parsing relative URLs.
 * - XML namespace URIs — identifiers, never fetched.
 */
const ALLOWED_HOSTS = /^(?:localhost|127\.0\.0\.1|schemas\.openxmlformats\.org|www\.w3\.org)/

const PATTERNS = [
  { re: /https?:\/\/[^\s'"`)]+/g, what: 'remote URL', allow: ALLOWED_HOSTS },
  { re: /@import\s+url\(/g, what: 'CSS @import' },
  { re: /fonts\.(googleapis|gstatic)\.com/g, what: 'Google Fonts' },
  { re: /cdn(js)?\.|unpkg\.com|jsdelivr/g, what: 'CDN reference' },
]

/** Comment lines are prose, not behaviour — a URL in a doc comment is fine. */
function isComment(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (['.ts', '.tsx', '.css'].includes(extname(entry.name))) yield full
  }
}

const findings = []
for await (const file of walk(target)) {
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    if (isComment(line)) return
    for (const { re, what, allow } of PATTERNS) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(line)) !== null) {
        const host = match[0].replace(/^https?:\/\//, '')
        if (allow?.test(host)) continue
        findings.push(`${relative(root, file)}:${i + 1}  ${what}: ${match[0].slice(0, 80)}`)
      }
    }
  })
}

if (findings.length > 0) {
  console.error('Offline check failed — the library must not reference remote resources:\n')
  for (const finding of findings) console.error('  ' + finding)
  console.error('\nBundle the asset locally, or expose it as a prop the consumer supplies.')
  process.exit(1)
}

console.log('Offline check passed: no remote references in packages/doc-preview/src')
