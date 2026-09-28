import { useEffect, type ReactNode } from 'react'
import type { Standing } from '@core/standings'
import { signed } from '@core/format'

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({
  title,
  message,
  confirmLabel = 'Conferma',
  danger,
  onConfirm,
  onClose
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            autoFocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  )
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Delta({ value, digits = 0 }: { value: number | null; digits?: number }) {
  if (value == null) return <span className="muted">—</span>
  const r = Number(value.toFixed(digits))
  if (r === 0) return <span className="muted">0</span>
  return <span className={r > 0 ? 'pos' : 'neg'}>{signed(r, digits)}</span>
}

export function PositionChange({ s }: { s: Standing }) {
  if (s.player.status !== 'active') return null
  if (s.positionChange == null) return <span className="chip chip-new">nuovo</span>
  if (s.positionChange > 0) return <span className="pos">▲{s.positionChange}</span>
  if (s.positionChange < 0) return <span className="neg">▼{-s.positionChange}</span>
  return <span className="muted">=</span>
}

export function Form({ results }: { results: ('V' | 'P')[] }) {
  return (
    <span className="form">
      {results.map((r, i) => (
        <span key={i} className={`form-dot ${r === 'V' ? 'win' : 'loss'}`} title={r === 'V' ? 'Vinta' : 'Persa'}>
          {r}
        </span>
      ))}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
