import { Suspense, useEffect, useMemo } from 'react'
import type { DocumentPreviewProps } from './types'
import { useDocumentSource } from './useDocumentSource'
import { RENDERERS } from './registry'
import { Spinner } from './chrome/Spinner'
import { ErrorState } from './chrome/ErrorState'
import { UnsupportedState } from './chrome/UnsupportedState'
import { RendererBoundary } from './chrome/RendererBoundary'
import './styles.css'

export function DocumentPreview({
  url,
  mimeType,
  fileName,
  fetchOptions,
  maxBytes,
  className,
  onLoad,
  onError,
  renderers,
  pdf,
}: DocumentPreviewProps) {
  const source = useDocumentSource({ url, mimeType, fileName, fetchOptions, maxBytes })
  const { status, data, meta, error, progress } = source

  useEffect(() => {
    if (status === 'ready' && meta) onLoad?.(meta)
  }, [status, meta, onLoad])

  useEffect(() => {
    if (status === 'error' && error) onError?.(error)
  }, [status, error, onError])

  const Renderer = useMemo(() => {
    if (!meta) return undefined
    return renderers?.[meta.kind] ?? RENDERERS[meta.kind]
  }, [meta, renderers])

  const rootClass = className ? `dp-root ${className}` : 'dp-root'

  let body: React.ReactNode
  if (status === 'loading') {
    body = <Spinner progress={progress} />
  } else if (status === 'error' || !data || !meta) {
    body = <ErrorState error={error ?? new Error('The document could not be loaded.')} url={url} fileName={fileName} />
  } else if (!Renderer) {
    body = <UnsupportedState meta={meta} />
  } else {
    body = (
      <RendererBoundary resetKey={url} url={url} fileName={meta.fileName} onError={onError}>
        <Suspense fallback={<Spinner label="Preparing viewer…" />}>
          <Renderer data={data} meta={meta} pdf={pdf} onError={onError} />
        </Suspense>
      </RendererBoundary>
    )
  }

  return (
    <div className={rootClass} data-kind={meta?.kind ?? 'loading'}>
      {body}
    </div>
  )
}
