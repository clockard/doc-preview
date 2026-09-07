import type { ReactNode } from 'react'
import type { DocKind } from '../types'

/**
 * A distinct pictograph per format.
 *
 * Colour alone would not carry it — these appear at tile size, often several at
 * once in a grid, and they have to be told apart at a glance and by anyone who
 * cannot distinguish the accents. So each kind gets its own shape as well as its
 * own accent, and the extension is spelled out beneath.
 *
 * Everything strokes `currentColor`; the accent is set per kind in CSS, which
 * keeps both themes in one place.
 */

/** The classic page-with-a-folded-corner, shared by the document formats. */
const PAGE = (
  <>
    <path d="M13.5 2.75H7A2.25 2.25 0 0 0 4.75 5v14A2.25 2.25 0 0 0 7 21.25h10A2.25 2.25 0 0 0 19.25 19V8.5z" />
    <path d="M13.5 2.75V8.5h5.75" />
  </>
)

const ICONS: Record<string, ReactNode> = {
  // A page with a bookmark ribbon — the shape print formats have carried for years.
  pdf: (
    <>
      {PAGE}
      <path d="M9 12.5h6v6l-3-2.25L9 18.5z" fill="currentColor" fillOpacity="0.18" />
    </>
  ),

  // Prose: a heading rule over body lines.
  docx: (
    <>
      {PAGE}
      <path d="M8 12h8" strokeWidth="2.2" />
      <path d="M8 15.5h8M8 18.5h5" />
    </>
  ),

  // A grid with a filled header row.
  xlsx: (
    <>
      <rect x="3.25" y="4.25" width="17.5" height="15.5" rx="1.75" />
      <path d="M3.25 9h17.5v-2.75A2 2 0 0 0 18.75 4.25H5.25A2 2 0 0 0 3.25 6.25z" fill="currentColor" fillOpacity="0.18" stroke="none" />
      <path d="M3.25 9h17.5M3.25 14.5h17.5M9.5 9v10.75M15 9v10.75" />
    </>
  ),

  // A projected slide on a stand, with bars on it.
  pptx: (
    <>
      <rect x="3.25" y="3.75" width="17.5" height="12.5" rx="1.75" />
      <path d="M12 16.25v3.5M9 19.75h6" />
      <path d="M8 13.25v-2.5M12 13.25v-5M16 13.25v-3.75" />
    </>
  ),

  // A framed picture: horizon, sun, hills.
  image: (
    <>
      <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="2" />
      <circle cx="8.75" cy="10" r="1.6" />
      <path d="M3.25 16.5l4.5-4.25 3.25 3 3.5-3.5 6.25 6" />
    </>
  ),

  // The Markdown mark: an M beside a down arrow.
  markdown: (
    <>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="2" />
      <path d="M5.75 15.25V8.75l3 3.5 3-3.5v6.5" />
      <path d="M16.75 8.75v5.5M14.5 12l2.25 2.25L19 12" />
    </>
  ),

  // A page of tabular text: rows crossed by column dividers — distinct from
  // both plain text (no dividers) and xlsx (a full-bleed grid with a header).
  csv: (
    <>
      {PAGE}
      <path d="M8 11.5h8M8 14.5h8M8 17.5h8" />
      <path d="M11 10v9M15 10v9" />
    </>
  ),

  // Braces around a value.
  json: (
    <>
      <path d="M10 3.75c-1.8 0-2.5.9-2.5 2.5v2.25c0 1.4-.85 2.25-2.25 2.25v2c1.4 0 2.25.85 2.25 2.25v2.25c0 1.6.7 2.5 2.5 2.5" />
      <path d="M14 3.75c1.8 0 2.5.9 2.5 2.5v2.25c0 1.4.85 2.25 2.25 2.25v2c-1.4 0-2.25.85-2.25 2.25v2.25c0 1.6-.7 2.5-2.5 2.5" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),

  // A tag: angle brackets around a slash.
  xml: (
    <>
      <path d="M9.25 7.75L4.5 12l4.75 4.25" />
      <path d="M14.75 7.75L19.5 12l-4.75 4.25" />
      <path d="M13.25 5.75l-2.5 12.5" />
    </>
  ),

  // Plain lines, evenly set — no heading, which is what separates it from Word.
  text: (
    <>
      {PAGE}
      <path d="M8 12h8M8 15h8M8 18h5" />
    </>
  ),

  // A page of markup: angle brackets, the same mark as xml but wrapped in a
  // page — read as "a document that is markup", not "raw markup".
  html: (
    <>
      {PAGE}
      <path d="M9.25 12.75L7 15l2.25 2.25" />
      <path d="M14.75 12.75L17 15l-2.25 2.25" />
      <path d="M13 11.75l-2 6.5" />
    </>
  ),

  // A frame with a play mark — not a page, since video is not paginated.
  video: (
    <>
      <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="2" />
      <path d="M10.25 9.25v5.5l4.75-2.75z" fill="currentColor" fillOpacity="0.9" stroke="none" />
    </>
  ),

  // A frame with a waveform.
  audio: (
    <>
      <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="2" />
      <path d="M7.5 14.5v-3M10.5 15.5v-5M13.5 12.5v1M16.5 15.5v-5M19 14.5v-3" />
    </>
  ),

  // Nothing to show: a page with a question mark.
  unsupported: (
    <>
      {PAGE}
      <path d="M10.25 13.1a1.85 1.85 0 1 1 2.6 1.7c-.55.25-.85.7-.85 1.3v.35" />
      <circle cx="12" cy="18.6" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),

  // Still identifying it: a bare page, with nothing asserted about the contents.
  generic: PAGE,
}

interface Props {
  /** Omitted while the type is still unknown. */
  kind?: DocKind
}

export function FileIcon({ kind }: Props) {
  const key = kind && ICONS[kind] ? kind : 'generic'
  return (
    <svg
      className={`dp-thumb__icon dp-thumb__icon--${key}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[key]}
    </svg>
  )
}
