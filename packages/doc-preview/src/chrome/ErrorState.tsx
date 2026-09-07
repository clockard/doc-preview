import type { DocumentPreviewError } from '../types'

interface ErrorStateProps {
  error: Error | DocumentPreviewError
  url?: string
  fileName?: string
}

export function ErrorState({ error, url, fileName }: ErrorStateProps) {
  return (
    <div className="dp-centred dp-centred--error" role="alert">
      <svg className="dp-centred__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8v5m0 3.5v.5" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      <p className="dp-centred__label">This document could not be displayed.</p>
      <p className="dp-centred__detail">{error.message}</p>
      {url && (
        <a className="dp-button" href={url} download={fileName}>
          Download the file instead
        </a>
      )}
    </div>
  )
}
