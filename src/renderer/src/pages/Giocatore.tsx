import { useState } from 'react'
import { fmtDelta, formatDate, formatLongDate, todayISO } from '@core/format'
import { deletePlayer, updatePlayer } from '@core/mutations'
import { pairKey, previewInactive } from '@core/rules'
import { useStore } from '../store'
import { Confirm, Delta, Empty, Figures, Meter, Modal, PageHead } from '../components/ui'
import { EloChart } from '../components/EloChart'
import type { Navigate } from '../App'

export function GiocatorePage({ id, navigate }: { id: string; navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [renaming, setRenaming] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const s = computed.standings.find((x) => x.player.id === id)
  if (!s) {
    return (
      <>
        <PageHead title="Giocatore" />
        <Empty>Giocatore non trovato.</Empty>
      </>
    )
  }
  const p = s.player
  const retired = p.status === 'retired'
  const { minMatchesPerPair: min, maxMatchesPerPair: max } = data.settings
  const nameOf = (pid: string) => data.players.find((x) => x.id === pid)?.name ?? '?'

  const mine = computed.results.filter((r) => r.match.playerA === id || r.match.playerB === id)
  const opponents = computed.standings.filter((o) => o.player.id !== id)
  const h2h = opponents.map((o) => {
    let w = 0
    let l = 0
    let excluded = 0
    let pts = 0
    for (const r of mine) {
      const m = r.match
      if (m.playerA !== o.player.id && m.playerB !== o.player.id) continue
      if (!r.eval.counted) {
        excluded++
        continue
      }
      const iAmA = m.playerA === id
      const won = iAmA ? m.setsA > m.setsB : m.setsB > m.setsA
      if (won) w++
      else l++
      pts += iAmA ? r.deltaA : -r.deltaA
    }
    return { o, w, l, excluded, pts, count: computed.pairCounted.get(pairKey(id, o.player.id)) ?? 0 }
  })

  const history = computed.history.get(id) ?? []
  const best = s.played ? Math.max(...history.map((h) => h.rating)) : null
  const standingText = retired
    ? `inattivo${p.retiredAt ? ` dal ${formatLongDate(p.retiredAt)}` : ''}, partite in pausa`
    : s.qualified
      ? 'in classifica ufficiale'
      : 'fuori classifica'

  return (
    <>
      <header className="player-head">
        <div className="player-id">
          <span className={`player-rank ${s.position === 1 ? 'first' : ''}`}>{s.position ?? '–'}</span>
          <div>
            <button className="back-link" onClick={() => navigate({ page: 'classifica' })}>
              ← Classifica
            </button>
            <h1>{p.name}</h1>
            <p className="page-sub">
              In gruppo dal {formatLongDate(p.joinedAt)} · {standingText}
            </p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setRenaming(true)}>
            Rinomina
          </button>
          {!retired ? (
            <button className="btn" onClick={() => setRetiring(true)}>
              Segna come inattivo
            </button>
          ) : (
            <button
              className="btn"
              onClick={() =>
                update((d) => updatePlayer(d, id, { status: 'active', retiredAt: undefined }), 'riattivazione giocatore') &&
                toast(`${p.name} di nuovo attivo: le sue partite tornano a contare`)
              }
            >
              Riattiva
            </button>
          )}
          {mine.length === 0 && (
            <button className="btn btn-ghost danger" onClick={() => setDeleting(true)}>
              Elimina
            </button>
          )}
        </div>
      </header>

      <Figures
        items={[
          { value: Math.round(s.rating), label: 'Punti' },
          {
            value: s.deltaSincePublish == null ? '—' : fmtDelta(s.deltaSincePublish),
            label: 'Da ultima pubbl.',
            tone: s.deltaSincePublish != null && Math.round(s.deltaSincePublish) < 0 ? 'bad' : undefined
          },
          { value: `${s.wins}–${s.losses}`, label: 'Vinte–perse' },
          { value: `${s.setsWon}–${s.setsLost}`, label: 'Set' },
          { value: best != null ? Math.round(best) : '—', label: 'Massimo' }
        ]}
      />

      <div className="player-grid">
        <section>
          <div className="section-head">
            <h2>Andamento</h2>
            <span className="mono dim small">
              {s.played} {s.played === 1 ? 'partita valida' : 'partite valide'}
            </span>
          </div>
          <EloChart points={history} start={data.settings.startRating} />
        </section>

        <section>
          <div className="section-head">
            <h2>Contro ciascuno</h2>
            <span className="mono dim small">
              minimo {min} · massimo {max}
            </span>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Avversario</th>
                <th>Partite</th>
                <th className="num">V–P</th>
                <th className="num">Punti</th>
              </tr>
            </thead>
            <tbody>
              {h2h.map(({ o, w, l, excluded, pts, count }) => {
                const oRetired = o.player.status === 'retired'
                const required = !oRetired && !retired
                const missing = required ? Math.max(0, min - count) : 0
                return (
                  <tr key={o.player.id} className={oRetired ? 'retired' : ''}>
                    <td>
                      <button className="name-link" onClick={() => navigate({ page: 'giocatore', id: o.player.id })}>
                        {o.player.name}
                      </button>
                    </td>
                    <td>
                      {oRetired ? (
                        <span className="mono small faint">inattivo</span>
                      ) : (
                        <span className="meter-line" title={excluded > 0 ? `${excluded} partite escluse con questo avversario` : undefined}>
                          <Meter value={count} max={max} min={required ? min : undefined} label={`${count} partite valide su ${max}`} />
                          <span className={`mono small ${missing ? 'neg' : 'dim'}`}>
                            {missing ? (missing === 1 ? 'manca 1' : `mancano ${missing}`) : count >= max ? 'completo' : count}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="num">{w + l ? `${w}–${l}` : '—'}</td>
                    <td className="num mono">{w + l ? <Delta value={pts} digits={1} /> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-lg">
        <div className="section-head">
          <h2>Ultime partite</h2>
          <button className="link small" onClick={() => navigate({ page: 'partite', playerId: id })}>
            Vedi tutte
          </button>
        </div>
        {mine.length === 0 ? (
          <p className="dim">Nessuna partita.</p>
        ) : (
          <table className="table compact">
            <tbody>
              {[...mine]
                .reverse()
                .slice(0, 10)
                .map((r) => {
                  const m = r.match
                  const iAmA = m.playerA === id
                  const won = iAmA ? m.setsA > m.setsB : m.setsB > m.setsA
                  const d = iAmA ? r.deltaA : -r.deltaA
                  return (
                    <tr key={m.id} className={`${r.eval.counted ? '' : 'excluded'} ${m.tournamentId ? 'tour' : ''}`}>
                      <td className="mono small dim">
                        {formatDate(m.date)}
                        {m.tournamentId && <span className="tour-tag">torneo</span>}
                      </td>
                      <td>
                        <span className={won ? 'form-w' : 'form-l'} /> <span className="mono small">{won ? 'vinta' : 'persa'}</span>
                      </td>
                      <td>contro {nameOf(iAmA ? m.playerB : m.playerA)}</td>
                      <td className="num score-text">{iAmA ? `${m.setsA}–${m.setsB}` : `${m.setsB}–${m.setsA}`}</td>
                      <td className="num mono">
                        {r.eval.counted ? (
                          <Delta value={d} digits={1} />
                        ) : (
                          <span className={`small ${r.eval.kind === 'inactive' ? 'dim' : 'neg'}`} title={r.eval.reason}>
                            {r.eval.kind === 'inactive' ? 'in pausa' : 'esclusa'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </section>

      {renaming && <RenameModal id={id} current={p.name} onClose={() => setRenaming(false)} />}
      {retiring && <RetireModal id={id} onClose={() => setRetiring(false)} navigate={navigate} />}
      {deleting && (
        <Confirm
          title="Eliminare il giocatore?"
          message={<p>{p.name} non ha partite registrate e verrà rimosso.</p>}
          confirmLabel="Elimina"
          danger
          onConfirm={() => {
            if (update((d) => deletePlayer(d, id), 'eliminazione giocatore')) navigate({ page: 'giocatori' })
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}

function RenameModal({ id, current, onClose }: { id: string; current: string; onClose: () => void }) {
  const { update } = useStore()
  const [name, setName] = useState(current)
  const save = () => update((d) => updatePlayer(d, id, { name }), 'rinomina giocatore') && onClose()
  return (
    <Modal
      title="Rinomina giocatore"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            Salva
          </button>
        </>
      }
    >
      <label className="field-stack">
        <span className="label">Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
      </label>
    </Modal>
  )
}

function RetireModal({ id, onClose, navigate }: { id: string; onClose: () => void; navigate: Navigate }) {
  const { data, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const p = data.players.find((x) => x.id === id)!
  const nameOf = (pid: string) => data.players.find((x) => x.id === pid)?.name ?? '?'
  const paused = previewInactive(data, id)

  function confirm() {
    if (update((d) => updatePlayer(d, id, { status: 'retired', retiredAt: date }), 'giocatore inattivo')) {
      toast(`${p.name} segnato come inattivo: partite in pausa`)
      onClose()
    }
  }

  return (
    <Modal
      title={`${p.name} diventa inattivo`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            Segna inattivo
          </button>
        </>
      }
    >
      <p>
        Tutte le partite di {p.name} vengono <strong>messe in pausa</strong>: restano salvate ma non contano più per nessuno dei due
        giocatori, e i punti di tutti vengono ricalcolati come se non fossero state giocate. Se torna attivo, tornano a contare.
      </p>
      {paused.length === 0 ? (
        <p>Nessuna partita da mettere in pausa.</p>
      ) : (
        <>
          <p>Partite che andranno in pausa ({paused.length}):</p>
          <table className="table compact">
            <tbody>
              {paused.map((m) => (
                <tr key={m.id}>
                  <td className="mono small dim">{formatDate(m.date)}</td>
                  <td>{nameOf(m.playerA)}</td>
                  <td className="num score-text">
                    {m.setsA}–{m.setsB}
                  </td>
                  <td>{nameOf(m.playerB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="dim small">
        Puoi comunque decidere a mano: nella pagina{' '}
        <button
          className="link"
          onClick={() => {
            onClose()
            navigate({ page: 'partite', playerId: id })
          }}
        >
          Partite
        </button>{' '}
        “Includi” fa contare una singola partita anche se è in pausa. “Riattiva” rimette in gioco tutto.
      </p>
      <label className="field-stack">
        <span className="label">Inattivo dal</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </label>
    </Modal>
  )
}
