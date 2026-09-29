import type { ReactNode } from 'react'
import { pairKey } from '@core/rules'
import type { MatchResult } from '@core/standings'
import type { Player } from '@core/types'
import { useStore } from '../store'
import { Empty, PageHead } from '../components/ui'
import type { Navigate } from '../App'

/** Vittorie di ciascun giocatore contro ciascun altro, chiave "vincitore>perdente". */
function winsOf(results: MatchResult[]): Map<string, number> {
  const wins = new Map<string, number>()
  for (const r of results) {
    const w = r.match.setsA > r.match.setsB ? r.match.playerA : r.match.playerB
    const l = w === r.match.playerA ? r.match.playerB : r.match.playerA
    wins.set(`${w}>${l}`, (wins.get(`${w}>${l}`) ?? 0) + 1)
  }
  return wins
}

function Grid({
  players,
  navigate,
  cell
}: {
  players: Player[]
  navigate: Navigate
  cell: (row: Player, col: Player) => ReactNode
}) {
  return (
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
              {players.map((col) => (row.id === col.id ? <td key={col.id} className="self" /> : cell(row, col)))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MatricePage({ navigate }: { navigate: Navigate }) {
  const { data, computed } = useStore()
  const { minMatchesPerPair: min, maxMatchesPerPair: max } = data.settings
  const players = computed.standings.filter((s) => s.player.status === 'active').map((s) => s.player)

  // Tabella normale: solo le partite valide fuori dai tornei (quelle che contano per limite e minimo).
  const wins = winsOf(computed.results.filter((r) => r.eval.counted && !r.match.tournamentId))
  // Tabella esubero: le partite oltre il limite per coppia, registrate ma non conteggiate.
  const excessWins = winsOf(computed.results.filter((r) => r.eval.kind === 'cap'))

  const totalPairs = (players.length * (players.length - 1)) / 2
  let pairsOk = 0
  let pairsFull = 0
  let excessTotal = 0
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) {
      const key = pairKey(players[i].id, players[j].id)
      const c = computed.pairCounted.get(key) ?? 0
      if (c >= min) pairsOk++
      if (c >= max) pairsFull++
      excessTotal += computed.pairExcess.get(key) ?? 0
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

      <section className="matrix-section">
        <div className="section-head">
          <h2>Partite valide</h2>
          <span className="mono dim small">fino a {max} per coppia · tornei esclusi</span>
        </div>
        <div className="toolbar">
          <span className="legend">
            <span className="legend-swatch m-low" /> meno di {min} (serve per la qualificazione)
          </span>
          <span className="legend">
            <span className="legend-swatch m-ok" /> in regola
          </span>
          <span className="legend">
            <span className="legend-swatch m-full" /> completa ({max}: le successive vanno in esubero)
          </span>
          <span className="legend muted">Nelle celle: vittorie riga – vittorie colonna</span>
        </div>
        <Grid
          players={players}
          navigate={navigate}
          cell={(row, col) => {
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
          }}
        />
      </section>

      <section className="matrix-section">
        <div className="section-head">
          <h2>Partite in esubero</h2>
          <span className="mono dim small">
            oltre la {max}ª con lo stesso avversario · {excessTotal} {excessTotal === 1 ? 'partita' : 'partite'}
          </span>
        </div>
        {excessTotal === 0 ? (
          <p className="dim">Nessuna partita in esubero: nessuna coppia ha superato le {max} partite.</p>
        ) : (
          <>
            <div className="toolbar">
              <span className="legend">
                <span className="legend-swatch m-excess" /> partite registrate ma non conteggiate
              </span>
              <span className="legend muted">Si possono far contare a mano da Partite → “Includi”</span>
            </div>
            <Grid
              players={players}
              navigate={navigate}
              cell={(row, col) => {
                const c = computed.pairExcess.get(pairKey(row.id, col.id)) ?? 0
                const w = excessWins.get(`${row.id}>${col.id}`) ?? 0
                const l = excessWins.get(`${col.id}>${row.id}`) ?? 0
                return (
                  <td
                    key={col.id}
                    className={`cell ${c > 0 ? 'm-excess' : 'm-none'}`}
                    title={`${row.name} vs ${col.name}: ${c} partite in esubero${c ? ` (${w}-${l})` : ''}`}
                  >
                    <div className="cell-count">{c || '·'}</div>
                    {c > 0 && (
                      <div className="cell-wl">
                        {w}–{l}
                      </div>
                    )}
                  </td>
                )
              }}
            />
          </>
        )}
      </section>
    </>
  )
}
