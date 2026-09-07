import type { DocumentMeta } from '../types'
import { formatBytes } from '../useDocumentSource'

const MESSAGES: Record<string, string> = {
  'legacy-office':
    'Legacy Office files (.doc, .xls, .ppt) cannot be displayed in the browser. Re-save the file in the modern format (.docx, .xlsx, .pptx) to preview it here.',
  'unknown-format': 'This file type is not supported for preview.',
  encrypted: 'This document is password protected, so it cannot be previewed.',
}

export function UnsupportedState({ meta }: { meta: DocumentMeta }) {
  const message = MESSAGES[meta.unsupportedReason ?? 'unknown-format'] ?? MESSAGES['unknown-format']
  return (
    <div className="dp-centred">
      <svg className="dp-centred__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3v5h5" />
        <path d="M14 3H6v18h12V8z" />
      </svg>
      <p className="dp-centred__label">{meta.fileName}</p>
      <p className="dp-centred__detail">{message}</p>
      <a className="dp-button" href={meta.url} download={meta.fileName}>
        Download ({formatBytes(meta.byteLength)})
      </a>
    </div>
  )
}
