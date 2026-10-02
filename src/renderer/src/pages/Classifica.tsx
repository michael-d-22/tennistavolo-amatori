import { useState } from 'react'
import { daysBetween, formatLongDate, todayISO } from '@core/format'
import type { Standing } from '@core/standings'
import { useStore } from '../store'
import { Delta, Empty, Figures, Form, PageHead, PositionChange } from '../components/ui'
import type { Navigate } from '../App'

function statusLine(s: Standing): { text: string; bad: boolean } {
  if (s.player.status === 'retired') {
    return { text: s.player.retiredAt ? `Inattivo dal ${formatLongDate(s.player.retiredAt)}` : 'Inattivo', bad: false }
  }
  if (s.qualified) return { text: 'In classifica', bad: false }
  const n = s.missing.reduce((a, m) => a + m.missing, 0)
  return { text: `${n} ${n === 1 ? 'partita' : 'partite'} per entrare in classifica`, bad: true }
}

export function ClassificaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed } = useStore()
  const [onlyQualified, setOnlyQualified] = useState(false)
  // Provvisoria: come sarebbe pubblicando adesso. Quella ufficiale resta l'unica esportata.
  const [provisional, setProvisional] = useState(false)
  const { minMatchesPerPair, publishEveryDays } = data.settings

  const table = provisional ? computed.provisional : computed.standings
  const rows = table.filter((s) => (onlyQualified ? s.qualified : true))
  const counted = computed.results.filter((r) => r.eval.counted && !r.pending).length
  const pending = computed.pendingCount
  const active = table.filter((s) => s.player.status === 'active').length
  const qualifiedCount = table.filter((s) => s.qualified).length

  const last = computed.lastSnapshot
  const subtitle = provisional
    ? `Provvisoria: come sarebbe pubblicando adesso, con ${pending === 1 ? 'la partita' : `le ${pending} partite`} in attesa${last ? ` · variazioni rispetto alla classifica del ${formatLongDate(last.date)}` : ''}. Non è ufficiale.`
    : last
      ? `Classifica pubblicata il ${formatLongDate(last.date)}${computed.previousSnapshot ? ` · variazioni rispetto a quella del ${formatLongDate(computed.previousSnapshot.date)}` : ''}. I punti cambiano alla prossima pubblicazione.`
      : 'Nessuna classifica ancora pubblicata: le partite entrano in classifica dalla prima pubblicazione.'
  const daysLeft = last ? publishEveryDays - daysBetween(last.date, todayISO()) : 0
  const publishFig =
    pending === 0
      ? { value: '—', label: 'Da pubblicare' }
      : daysLeft <= 0
        ? { value: 'Oggi', label: 'Da pubblicare', tone: 'bad' as const }
        : { value: daysLeft === 1 ? 'Domani' : `${daysLeft} gg`, label: 'Prossima pubblicazione' }

  return (
    <>
      <PageHead
        title="Classifica"
        subtitle={subtitle}
        actions={
          <>
            <div className="seg" role="group" aria-label="Classifica mostrata">
              <button className={!provisional ? 'active' : ''} aria-pressed={!provisional} onClick={() => setProvisional(false)}>
                Ufficiale
              </button>
              <button className={provisional ? 'active' : ''} aria-pressed={provisional} onClick={() => setProvisional(true)}>
                Provvisoria
              </button>
            </div>
            <div className="seg" role="group" aria-label="Giocatori mostrati">
              <button className={!onlyQualified ? 'active' : ''} aria-pressed={!onlyQualified} onClick={() => setOnlyQualified(false)}>
                Tutti
              </button>
              <button className={onlyQualified ? 'active' : ''} aria-pressed={onlyQualified} onClick={() => setOnlyQualified(true)}>
                Solo in classifica
              </button>
            </div>
          </>
        }
      />

      <Figures
        items={[
          { value: counted, label: 'Partite in classifica' },
          { value: pending, label: 'In attesa di pubblicazione' },
          { value: `${qualifiedCount} / ${active}`, label: 'In classifica' },
          publishFig
        ]}
      />

      {rows.length === 0 ? (
        <Empty>
          {onlyQualified
            ? `Nessun giocatore ha ancora giocato almeno ${minMatchesPerPair} partite con tutti gli avversari.`
            : 'Aggiungi i giocatori per iniziare.'}
        </Empty>
      ) : (
        <table className={`table standings ${provisional ? 'provisional' : ''}`}>
          <thead>
            <tr>
              <th className="pos-cell">#</th>
              <th className="move-cell" aria-label="Posizioni guadagnate o perse" />
              <th>Giocatore</th>
              <th className="num">Punti</th>
              <th className="num">Var.</th>
              <th className="num">G</th>
              <th className="num">V</th>
              <th className="num">P</th>
              <th className="num">Set</th>
              <th className="num">Ultime 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const pos = onlyQualified ? s.officialPosition : s.position
              const retired = s.player.status === 'retired'
              const st = statusLine(s)
              const open = () => navigate({ page: 'giocatore', id: s.player.id })
              return (
                <tr key={s.player.id} className={`clickable ${retired ? 'retired' : ''}`} onClick={open}>
                  <td className={`pos-cell ${pos === 1 ? 'first' : ''}`}>{pos ?? '–'}</td>
                  <td className="move-cell mono">
                    <PositionChange s={s} />
                  </td>
                  <td>
                    <button
                      className="name-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        open()
                      }}
                    >
                      {s.player.name}
                    </button>
                    <div
                      className={`status-line ${st.bad ? 'bad' : ''}`}
                      title={st.bad ? s.missing.map((m) => `${m.name}: ${m.missing === 1 ? 'manca 1 partita' : `mancano ${m.missing} partite`}`).join('\n') : undefined}
                    >
                      <span className="dot" />
                      {st.text}
                    </div>
                  </td>
                  <td className="num points">{Math.round(s.rating)}</td>
                  <td className="num mono">
                    <Delta value={retired ? null : s.deltaSincePublish} />
                  </td>
                  <td className="num">{s.played}</td>
                  <td className="num">{s.wins}</td>
                  <td className="num">{s.losses}</td>
                  <td className="num mono dim">
                    {s.setsWon}–{s.setsLost}
                  </td>
                  <td className="num">
                    <Form results={s.lastResults} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <footer className="legend-row mono">
        <span>
          <span className="form-w" /> vinta <span className="form-l" /> persa
        </span>
        <span className="neg">
          <span className="dot" /> fuori classifica: servono {minMatchesPerPair} partite con ogni avversario
        </span>
      </footer>
    </>
  )
}
