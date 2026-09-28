import { useState } from 'react'
import { formatDate } from '@core/format'
import { useStore } from '../store'
import { Delta, Empty, Form, PageHead, PositionChange } from '../components/ui'
import type { Navigate } from '../App'

export function ClassificaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed } = useStore()
  const [onlyQualified, setOnlyQualified] = useState(false)
  const [showRetired, setShowRetired] = useState(true)
  const { minMatchesPerPair } = data.settings

  const rows = computed.standings.filter((s) => {
    if (s.player.status === 'retired') return showRetired && !onlyQualified
    return !onlyQualified || s.qualified
  })
  const counted = computed.results.filter((r) => r.eval.counted).length
  const excluded = computed.results.length - counted
  const qualifiedCount = computed.standings.filter((s) => s.qualified).length
  const hasRetired = computed.standings.some((s) => s.player.status === 'retired')

  return (
    <>
      <PageHead
        title="Classifica"
        subtitle={
          <>
            {counted} partite valide{excluded > 0 && ` · ${excluded} escluse`} · {qualifiedCount} qualificati
            {computed.lastSnapshot && <> · variazioni rispetto al {formatDate(computed.lastSnapshot.date)}</>}
          </>
        }
        actions={
          <button className="btn btn-primary" onClick={() => navigate({ page: 'nuova' })}>
            ➕ Nuova partita
          </button>
        }
      />

      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={onlyQualified} onChange={(e) => setOnlyQualified(e.target.checked)} />
          Solo classifica ufficiale (qualificati)
        </label>
        {hasRetired && (
          <label className="check">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Mostra ritirati
          </label>
        )}
        <span className="legend">
          <span className="legend-swatch unq" /> fuori classifica: meno di {minMatchesPerPair} partite con qualche avversario
        </span>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {onlyQualified
            ? `Nessun giocatore ha ancora giocato almeno ${minMatchesPerPair} partite con tutti gli avversari.`
            : 'Aggiungi i giocatori per iniziare.'}
        </Empty>
      ) : (
        <div className="card">
          <table className="table standings">
            <thead>
              <tr>
                <th className="num">#</th>
                <th />
                <th>Giocatore</th>
                <th className="num">Punti</th>
                <th className="num">Var.</th>
                <th className="num">G</th>
                <th className="num">V</th>
                <th className="num">P</th>
                <th className="num">% V</th>
                <th className="num">Set</th>
                <th>Forma</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const pos = onlyQualified ? s.officialPosition : s.position
                const retired = s.player.status === 'retired'
                return (
                  <tr
                    key={s.player.id}
                    className={`clickable ${retired ? 'retired' : s.qualified ? '' : 'unqualified'} ${pos != null && pos <= 3 ? `top${pos}` : ''}`}
                    onClick={() => navigate({ page: 'giocatore', id: s.player.id })}
                  >
                    <td className="num pos-cell">{pos ?? '–'}</td>
                    <td className="num small">
                      <PositionChange s={s} />
                    </td>
                    <td className="name-cell">{s.player.name}</td>
                    <td className="num rating">{Math.round(s.rating)}</td>
                    <td className="num">
                      <Delta value={s.deltaSincePublish} />
                    </td>
                    <td className="num">{s.played}</td>
                    <td className="num">{s.wins}</td>
                    <td className="num">{s.losses}</td>
                    <td className="num">{s.played ? Math.round((s.wins / s.played) * 100) + '%' : '–'}</td>
                    <td className="num small">
                      {s.setsWon}-{s.setsLost}
                    </td>
                    <td>
                      <Form results={s.lastResults} />
                    </td>
                    <td>
                      {retired ? (
                        <span className="chip chip-grey">ritirato</span>
                      ) : s.qualified ? (
                        <span className="chip chip-ok">✓ in classifica</span>
                      ) : (
                        <span
                          className="chip chip-bad"
                          title={s.missing.map((m) => `${m.name}: manca${m.missing > 1 ? 'no' : ''} ${m.missing}`).join('\n')}
                        >
                          mancano {s.missing.reduce((a, m) => a + m.missing, 0)} partite
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
