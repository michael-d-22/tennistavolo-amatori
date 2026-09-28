import { useEffect, type ReactNode } from 'react'
import type { Standing } from '@core/standings'
import { fmtDelta } from '@core/format'
import { IconClose } from './icons'

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
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <IconClose />
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

export function PageHead({
  title,
  kicker,
  subtitle,
  actions
}: {
  title: string
  kicker?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/** Riga di numeri grandi separati da filetti. */
export function Figures({ items }: { items: { value: ReactNode; label: string; tone?: 'bad' }[] }) {
  return (
    <section className="figures">
      {items.map((it) => (
        <div key={it.label} className="fig">
          <b className={it.tone === 'bad' ? 'neg' : ''}>{it.value}</b>
          <span>{it.label}</span>
        </div>
      ))}
    </section>
  )
}

export function Delta({ value, digits = 0 }: { value: number | null; digits?: number }) {
  if (value == null) return <span className="faint">—</span>
  const r = Number(value.toFixed(digits))
  return <span className={r < 0 ? 'neg' : r > 0 ? 'pos' : 'faint'}>{fmtDelta(value, digits)}</span>
}

export function PositionChange({ s }: { s: Standing }) {
  if (s.player.status !== 'active') return null
  if (s.positionChange == null) return <span className="faint">nuovo</span>
  if (s.positionChange > 0) return <span className="pos">▲{s.positionChange}</span>
  if (s.positionChange < 0) return <span className="neg">▼{-s.positionChange}</span>
  return <span className="faint">=</span>
}

/** Ultimi risultati: quadratini verdi (vinte) e rossi (perse), uguali in entrambi i temi. */
export function Form({ results }: { results: ('V' | 'P')[] }) {
  const label = results.length ? 'Ultime: ' + results.map((r) => (r === 'V' ? 'vinta' : 'persa')).join(', ') : 'Nessuna partita'
  return (
    <span className="form" role="img" aria-label={label} title={label}>
      {results.map((r, i) => (
        <span key={i} className={r === 'V' ? 'form-w' : 'form-l'} />
      ))}
    </span>
  )
}

/** Barra a segmenti: partite valide giocate su un massimo. */
export function Meter({ value, max, min, label }: { value: number; max: number; min?: number; label?: string }) {
  const short = min != null && value < min
  return (
    <span className="meter" role="img" aria-label={label ?? `${value} su ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? (short ? 'q' : 'f') : ''} />
      ))}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
