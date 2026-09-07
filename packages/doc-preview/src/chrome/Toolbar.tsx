import type { ReactNode } from 'react'

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="dp-toolbar">{children}</div>
}

export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="dp-toolbar__group">{children}</div>
}

interface ToolbarButtonProps {
  onClick: () => void
  disabled?: boolean
  label: string
  children: ReactNode
}

export function ToolbarButton({ onClick, disabled, label, children }: ToolbarButtonProps) {
  return (
    <button type="button" className="dp-toolbar__button" onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      {children}
    </button>
  )
}
