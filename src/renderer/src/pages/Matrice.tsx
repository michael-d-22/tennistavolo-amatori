import { pairKey } from '@core/rules'
import { useStore } from '../store'
import { Empty, PageHead } from '../components/ui'
import type { Navigate } from '../App'

export function MatricePage({ navigate }: { navigate: Navigate }) {
  const { data, computed } = useStore()
  const { minMatchesPerPair: min, maxMatchesPerPair: max } = data.settings
  const players = computed.standings.filter((s) => s.player.status === 'active').map((s) => s.player)

  // Vittorie di A contro B tra le partite valide.
  const wins = new Map<string, number>()
  for (const r of computed.results) {
    if (!r.eval.counted) continue
    const w = r.match.setsA > r.match.setsB ? r.match.playerA : r.match.playerB
    const l = w === r.match.playerA ? r.match.playerB : r.match.playerA
    wins.set(`${w}>${l}`, (wins.get(`${w}>${l}`) ?? 0) + 1)
  }

  const totalPairs = (players.length * (players.length - 1)) / 2
  let pairsOk = 0
  let pairsFull = 0
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) {
      const c = computed.pairCounted.get(pairKey(players[i].id, players[j].id)) ?? 0
      if (c >= min) pairsOk++
      if (c >= max) pairsFull++
    }

  if (players.length < 2) {
    return (
      <>
        <PageHead title="Scontri diretti" />
        <Empty>Servono almeno due giocatori attivi.</Empty>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Scontri diretti"
        subtitle={`Coppie con almeno ${min} partite: ${pairsOk}/${totalPairs} · coppie complete (${max}): ${pairsFull}/${totalPairs}`}
      />
      <div className="toolbar">
        <span className="legend">
          <span className="legend-swatch m-low" /> meno di {min} (serve per la qualificazione)
        </span>
        <span className="legend">
          <span className="legend-swatch m-ok" /> in regola
        </span>
        <span className="legend">
          <span className="legend-swatch m-full" /> completa ({max}: le successive non contano)
        </span>
        <span className="legend muted">Nelle celle: vittorie riga – vittorie colonna</span>
      </div>
      <div className="card matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {players.map((p) => (
                <th key={p.id} className="col-head">
                  <span>{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id}>
                <th className="row-head clickable" onClick={() => navigate({ page: 'giocatore', id: row.id })}>
                  {row.name}
                </th>
                {players.map((col) => {
                  if (row.id === col.id) return <td key={col.id} className="self" />
                  const c = computed.pairCounted.get(pairKey(row.id, col.id)) ?? 0
                  const w = wins.get(`${row.id}>${col.id}`) ?? 0
                  const l = wins.get(`${col.id}>${row.id}`) ?? 0
                  const cls = c >= max ? 'm-full' : c >= min ? 'm-ok' : 'm-low'
                  return (
                    <td key={col.id} className={`cell ${cls}`} title={`${row.name} vs ${col.name}: ${c} partite valide (${w}-${l})`}>
                      <div className="cell-count">{c}</div>
                      {c > 0 && (
                        <div className="cell-wl">
                          {w}–{l}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
