import { useState } from 'react'
import { formatDate, todayISO } from '@core/format'
import { deletePlayer, updatePlayer } from '@core/mutations'
import { pairKey, previewRetirement } from '@core/rules'
import { useStore } from '../store'
import { Confirm, Delta, Empty, Modal, PageHead } from '../components/ui'
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

  const best = s.played ? Math.max(...computed.history.get(id)!.map((h) => h.rating)) : null

  return (
    <>
      <PageHead
        title={p.name}
        subtitle={
          <>
            <button className="link" onClick={() => navigate({ page: 'giocatori' })}>
              ← Giocatori
            </button>{' '}
            · in gruppo dal {formatDate(p.joinedAt)}
            {p.status === 'retired' && <> · <span className="chip chip-grey">ritirato{p.retiredAt ? ` dal ${formatDate(p.retiredAt)}` : ''}</span></>}
          </>
        }
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setRenaming(true)}>
              Rinomina
            </button>
            {p.status === 'active' ? (
              <button className="btn btn-ghost" onClick={() => setRetiring(true)}>
                Segna come ritirato
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  update((d) => updatePlayer(d, id, { status: 'active', retiredAt: undefined }), 'riattivazione giocatore') &&
                  toast(`${p.name} di nuovo attivo: partite ripristinate`)
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
          </>
        }
      />

      <div className="stats-row">
        <Stat label="Punti" value={Math.round(s.rating)} />
        <Stat label="Posizione" value={s.position ?? '–'} sub={s.qualified ? 'classifica ufficiale' : p.status === 'active' ? 'fuori classifica' : ''} />
        <Stat label="Var. da ultima pubbl." value={<Delta value={s.deltaSincePublish} />} />
        <Stat label="Vinte / Perse" value={`${s.wins} / ${s.losses}`} sub={s.played ? `${Math.round((s.wins / s.played) * 100)}% vittorie` : ''} />
        <Stat label="Set" value={`${s.setsWon} / ${s.setsLost}`} />
        <Stat label="Massimo" value={best != null ? Math.round(best) : '–'} />
      </div>

      <div className="card">
        <h3 className="card-title">Andamento punti</h3>
        <EloChart points={computed.history.get(id) ?? []} start={data.settings.startRating} />
      </div>

      <div className="card mt">
        <h3 className="card-title">Contro ciascun avversario</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Avversario</th>
              <th className="num">Partite valide</th>
              <th className="num">V – P</th>
              <th className="num">Punti guadagnati</th>
              <th className="num">Escluse</th>
              <th>Qualificazione</th>
            </tr>
          </thead>
          <tbody>
            {h2h.map(({ o, w, l, excluded, pts, count }) => (
              <tr key={o.player.id} className={o.player.status === 'retired' ? 'retired' : ''}>
                <td className="clickable name-cell" onClick={() => navigate({ page: 'giocatore', id: o.player.id })}>
                  {o.player.name}
                </td>
                <td className="num">
                  {count} <span className="muted small">/ {max}</span>
                </td>
                <td className="num">{count ? `${w} – ${l}` : '–'}</td>
                <td className="num">{count ? <Delta value={pts} digits={1} /> : '–'}</td>
                <td className="num">{excluded || ''}</td>
                <td>
                  {o.player.status === 'retired' || p.status === 'retired' ? (
                    <span className="muted small">non richiesta</span>
                  ) : count >= min ? (
                    <span className="chip chip-ok">✓</span>
                  ) : (
                    <span className="chip chip-bad">
                      manca{min - count > 1 ? 'no' : ''} {min - count}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt">
        <h3 className="card-title">
          Ultime partite{' '}
          <button className="link small" onClick={() => navigate({ page: 'partite', playerId: id })}>
            vedi tutte →
          </button>
        </h3>
        {mine.length === 0 ? (
          <p className="muted">Nessuna partita.</p>
        ) : (
          <table className="table">
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
                    <tr key={m.id} className={r.eval.counted ? '' : 'excluded'}>
                      <td className="small muted">{formatDate(m.date)}</td>
                      <td>
                        <span className={`form-dot ${won ? 'win' : 'loss'}`}>{won ? 'V' : 'P'}</span>
                      </td>
                      <td>vs {nameOf(iAmA ? m.playerB : m.playerA)}</td>
                      <td className="num">{iAmA ? `${m.setsA}-${m.setsB}` : `${m.setsB}-${m.setsA}`}</td>
                      <td className="num">{r.eval.counted ? <Delta value={d} digits={1} /> : <span className="chip chip-bad" title={r.eval.reason}>esclusa</span>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>

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

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
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
      <input className="block" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
    </Modal>
  )
}

function RetireModal({ id, onClose, navigate }: { id: string; onClose: () => void; navigate: Navigate }) {
  const { data, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const p = data.players.find((x) => x.id === id)!
  const nameOf = (pid: string) => data.players.find((x) => x.id === pid)?.name ?? '?'
  const preview = previewRetirement(data, id)

  function confirm() {
    if (update((d) => updatePlayer(d, id, { status: 'retired', retiredAt: date }), 'ritiro giocatore')) {
      toast(`${p.name} segnato come ritirato`)
      onClose()
    }
  }

  return (
    <Modal
      title={`Ritiro di ${p.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            Conferma ritiro
          </button>
        </>
      }
    >
      <p>
        Regola abbandoni: con ogni avversario affrontato contano solo le prime <strong>{preview.keepPerOpponent}</strong>{' '}
        partite (il minimo comune). Le altre restano registrate ma escono dalla classifica, e i punti di tutti vengono ricalcolati.
      </p>
      {preview.excluded.length === 0 ? (
        <p className="pos">Nessuna partita verrà esclusa.</p>
      ) : (
        <>
          <p>Partite che verranno escluse ({preview.excluded.length}):</p>
          <table className="table">
            <tbody>
              {preview.excluded.map((m) => (
                <tr key={m.id}>
                  <td className="small muted">{formatDate(m.date)}</td>
                  <td>{nameOf(m.playerA)}</td>
                  <td className="num">
                    {m.setsA}-{m.setsB}
                  </td>
                  <td>{nameOf(m.playerB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="muted small">
        Dopo il ritiro puoi comunque decidere a mano: nella pagina{' '}
        <button
          className="link"
          onClick={() => {
            onClose()
            navigate({ page: 'partite', playerId: id })
          }}
        >
          Partite
        </button>{' '}
        usa “Includi” / “Escludi” su singole partite. Se il giocatore torna, “Riattiva” ripristina tutto.
      </p>
      <label className="field-inline">
        Data del ritiro
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </label>
    </Modal>
  )
}
