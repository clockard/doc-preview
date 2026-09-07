interface SpinnerProps {
  label?: string
  progress?: number
}

export function Spinner({ label = 'Loading document…', progress }: SpinnerProps) {
  const pct = progress === undefined ? undefined : Math.round(progress * 100)
  return (
    <div className="dp-centred" role="status" aria-live="polite">
      <div className="dp-spinner" aria-hidden="true" />
      <p className="dp-centred__label">{label}</p>
      {pct !== undefined && (
        <div className="dp-progress">
          <div className="dp-progress__bar" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
