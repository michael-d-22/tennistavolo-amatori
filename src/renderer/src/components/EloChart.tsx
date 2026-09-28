import type { HistoryPoint } from '@core/standings'
import { formatDate } from '@core/format'

/** Grafico a linea dell'andamento Elo, partita per partita. */
export function EloChart({ points, start }: { points: HistoryPoint[]; start: number }) {
  const W = 720
  const H = 220
  const pad = { l: 44, r: 16, t: 14, b: 26 }
  if (points.length < 2) return <div className="muted small chart-empty">Il grafico apparirà dopo la prima partita valida.</div>

  const values = points.map((p) => p.rating)
  let lo = Math.min(start, ...values)
  let hi = Math.max(start, ...values)
  const span = Math.max(hi - lo, 40)
  lo = Math.floor((lo - span * 0.1) / 10) * 10
  hi = Math.ceil((hi + span * 0.1) / 10) * 10
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)

  const step = Math.max(10, Math.ceil((hi - lo) / 5 / 10) * 10)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${pad.l},${H - pad.b} Z`
  const last = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="elo-chart" role="img" aria-label="Andamento punti">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">
            {t}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(start)} y2={y(start)} className="baseline" />
      <path d={area} className="area" />
      <path d={path} className="line" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.rating)} r={points.length > 40 ? 0 : 3} className="pt">
          <title>
            {formatDate(p.date)}: {Math.round(p.rating)}
          </title>
        </circle>
      ))}
      <circle cx={x(points.length - 1)} cy={y(last.rating)} r={4.5} className="pt-last" />
      <text x={pad.l} y={H - 6} className="tick">
        {formatDate(points[0].date)}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" className="tick">
        {formatDate(last.date)}
      </text>
    </svg>
  )
}
