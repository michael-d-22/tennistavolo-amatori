import type { HistoryPoint } from '@core/standings'
import { formatLongDate } from '@core/format'

/** Andamento dei punti partita per partita: linea color inchiostro, ultimo punto rosso, massimo evidenziato. */
export function EloChart({ points, start }: { points: HistoryPoint[]; start: number }) {
  const W = 640
  const H = 330
  const pad = { l: 48, r: 12, t: 30, b: 34 }
  if (points.length < 2) return <div className="chart-empty">Il grafico apparirà dopo la prima partita valida.</div>

  const values = points.map((p) => p.rating)
  let lo = Math.min(start, ...values)
  let hi = Math.max(start, ...values)
  const span = Math.max(hi - lo, 40)
  lo = Math.floor((lo - span * 0.08) / 10) * 10
  hi = Math.ceil((hi + span * 0.12) / 10) * 10
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)

  const step = Math.max(10, Math.ceil((hi - lo) / 5 / 10) * 10)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const maxIdx = values.indexOf(Math.max(...values))
  const showMax = maxIdx !== points.length - 1 && values[maxIdx] > start

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="elo-chart"
      role="img"
      aria-label={`Andamento punti: da ${start} a ${Math.round(last.rating)}, massimo ${Math.round(values[maxIdx])}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" className="tick">
            {t}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(start)} y2={y(start)} className="baseline" />
      <polyline points={line} className="line" />
      {points.length <= 40 &&
        points.map((p, i) =>
          i === 0 || i === points.length - 1 ? null : (
            <circle key={i} cx={x(i)} cy={y(p.rating)} r={2.5} className="pt">
              <title>
                {formatLongDate(p.date)}: {Math.round(p.rating)}
              </title>
            </circle>
          )
        )}
      {showMax && (
        <g>
          <circle cx={x(maxIdx)} cy={y(values[maxIdx])} r={4.5} className="pt-max" />
          <text x={x(maxIdx)} y={y(values[maxIdx]) - 12} textAnchor="middle" className="tick strong">
            {Math.round(values[maxIdx])}
          </text>
        </g>
      )}
      <circle cx={x(points.length - 1)} cy={y(last.rating)} r={6} className="pt-last" />
      <text x={pad.l} y={H - 8} className="tick">
        {formatLongDate(points[0].date)}
      </text>
      <text x={W - pad.r} y={H - 8} textAnchor="end" className="tick">
        {formatLongDate(last.date)}
      </text>
    </svg>
  )
}
