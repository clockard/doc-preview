import { Component } from 'react'
import type { ReactNode } from 'react'
import { ErrorState } from './ErrorState'

interface Props {
  children: ReactNode
  /** Remounting on a new key discards the error when the document changes. */
  resetKey: string
  url?: string
  fileName?: string
  onError?: (err: Error) => void
  /** Replaces the default full-pane error state — a thumbnail wants a tile. */
  fallback?: (error: Error) => ReactNode
}

/**
 * Parsers for these formats throw on malformed input in ways that are hard to
 * enumerate. A boundary keeps one bad document from blanking the host app.
 */
export class RendererBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error)
      return <ErrorState error={this.state.error} url={this.props.url} fileName={this.props.fileName} />
    }
    return this.props.children
  }
}
