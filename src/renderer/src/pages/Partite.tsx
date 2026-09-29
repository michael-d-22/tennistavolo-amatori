import { useMemo, useState } from 'react'
import { fmtDelta, formatDate, formatLongDate, setScoresText, tournamentLabel } from '@core/format'
import { deleteMatch, restoreMatch, setMatchOverride, updateMatch } from '@core/mutations'
import { hasGroups, stageLabel } from '@core/tournament'
import { isValidScore } from '@core/rules'
import type { MatchResult } from '@core/standings'
import type { Match, OverrideMode, Tournament } from '@core/types'
import { useStore } from '../store'
import { Confirm, Empty, Modal, PageHead } from '../components/ui'
import { IconNote } from '../components/icons'
import { TournamentSetup } from '../components/TournamentSetup'
import type { Navigate } from '../App'

export function PartitePage({ initialPlayer }: { navigate: Navigate; initialPlayer?: string }) {
  const { data, computed, update, toast } = useStore()
  const [player, setPlayer] = useState(initialPlayer ?? '')
  const [status, setStatus] = useState<'all' | 'counted' | 'excluded' | 'deleted'>('all')
  const [editing, setEditing] = useState<Match | null>(null)
  const [overriding, setOverriding] = useState<MatchResult | null>(null)
  const [deleting, setDeleting] = useState<Match | null>(null)
  const [editingTour, setEditingTour] = useState<Tournament | null>(null)

  const tournaments = new Map(data.tournaments.map((t) => [t.id, t]))
  // Eliminando l'ultima partita di un torneo si elimina anche il torneo: lo si dice prima.
  const lastOfTournament = (m: Match) =>
    !!m.tournamentId && !data.matches.some((x) => !x.deleted && x.id !== m.id && x.tournamentId === m.tournamentId)
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const players = data.players.filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, 'it'))

  const rows = useMemo(() => {
    if (status === 'deleted') {
      return data.matches
        .filter((m) => m.deleted && (!player || m.playerA === player || m.playerB === player))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((m) => ({ match: m, eval: { counted: false }, deltaA: 0, ratingA: 0, ratingB: 0, k: 0 }) as MatchResult)
    }
    return [...computed.results]
      .reverse()
      .filter((r) => !player || r.match.playerA === player || r.match.playerB === player)
      .filter((r) => status === 'all' || (status === 'counted' ? r.eval.counted : !r.eval.counted))
  }, [computed, data.matches, player, status])

  // Raggruppa per data (le serate di allenamento); ogni torneo ha il suo gruppo.
  const groups = useMemo(() => {
    const g = new Map<string, { date: string; tournamentId?: string; list: MatchResult[] }>()
    for (const r of rows) {
      const key = `${r.match.date}|${r.match.tournamentId ?? ''}`
      const group = g.get(key) ?? { date: r.match.date, tournamentId: r.match.tournamentId, list: [] }
      group.list.push(r)
      g.set(key, group)
    }
    return [...g.values()]
  }, [rows])

  return (
    <>
      <PageHead
        title="Partite"
        subtitle={`${computed.results.length} partite registrate, raggruppate per serata`}
      />
      <div className="toolbar">
        <select value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Filtra per giocatore">
          <option value="">Tutti i giocatori</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="seg">
          {(
            [
              ['all', 'Tutte'],
              ['counted', 'Valide'],
              ['excluded', 'Escluse'],
              ['deleted', 'Cestino']
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <Empty>Nessuna partita.</Empty>
      ) : (
        groups.map(({ date, tournamentId, list }) => {
          const tour = tournamentId ? tournaments.get(tournamentId) : undefined
          return (
          <section className="day-group" key={`${date}|${tournamentId ?? ''}`}>
            {tournamentId ? (
              <div className="section-head tour-head">
                <h2>{tour ? tournamentLabel(tour) : 'Torneo'}</h2>
                <span className="mono small">
                  {tour?.name ? `${formatLongDate(date)} · ` : ''}K {tour?.k ?? list[0].k} · {list.length} {list.length === 1 ? 'partita' : 'partite'}
                </span>
                {tour && (
                  <span className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingTour(tour)}>
                      Imposta torneo
                    </button>
                  </span>
                )}
              </div>
            ) : (
              <div className="section-head">
                <h2>{formatLongDate(date)}</h2>
                <span className="mono dim small">
                  {list.length} {list.length === 1 ? 'partita' : 'partite'}
                </span>
              </div>
            )}
            <table className="table matches">
              <tbody>
                {list.map((r) => {
                  const m = r.match
                  const aWon = m.setsA > m.setsB
                  return (
                    <tr key={m.id} className={`${r.eval.counted ? '' : 'excluded'} ${m.tournamentId ? 'tour' : ''}`}>
                      <td className={`right ${aWon ? 'winner' : ''}`}>{nameOf(m.playerA)}</td>
                      <td className="score">
                        {m.setsA}–{m.setsB}
                      </td>
                      <td className={!aWon ? 'winner' : ''}>
                        {nameOf(m.playerB)}
                        {(m.stage || m.setScores) && (
                          <span className="match-detail">
                            {[stageLabel(tour, m.stage), m.setScores && setScoresText(m)].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="num mono small dim">
                        {r.eval.counted ? (
                          <span title={`${nameOf(m.playerA)} ${fmtDelta(r.deltaA, 1)} · ${nameOf(m.playerB)} ${fmtDelta(-r.deltaA, 1)}`}>
                            ±{Math.abs(r.deltaA).toFixed(1).replace('.', ',')} pt
                          </span>
                        ) : null}
                      </td>
                      <td className="small">
                        {m.deleted ? (
                          <span className="chip chip-grey">eliminata</span>
                        ) : r.eval.counted ? (
                          r.eval.forced ? (
                            <span className="chip chip-warn" title={m.override?.reason}>
                              inclusa a mano
                            </span>
                          ) : null
                        ) : (
                          <span className={`chip ${r.eval.kind === 'inactive' ? 'chip-grey' : 'chip-bad'}`} title={r.eval.reason}>
                            {r.eval.kind === 'cap' ? 'esubero' : r.eval.kind === 'inactive' ? 'in pausa' : 'esclusa a mano'}
                          </span>
                        )}
                        {m.note && (
                          <span className="note" title={m.note} aria-label={`Nota: ${m.note}`}>
                            <IconNote />
                          </span>
                        )}
                      </td>
                      <td className="actions">
                        {m.deleted ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => update((d) => restoreMatch(d, m.id), 'ripristino partita') && toast('Partita ripristinata')}
                          >
                            Ripristina
                          </button>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>
                              Modifica
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setOverriding(r)}>
                              {r.eval.counted ? 'Escludi' : 'Includi'}
                            </button>
                            <button className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(m)}>
                              Elimina
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          )
        })
      )}

      {editing && <MatchEditor match={editing} onClose={() => setEditing(null)} />}
      {editingTour && <TournamentSetup tournament={editingTour} onClose={() => setEditingTour(null)} />}
      {overriding && <OverrideEditor result={overriding} onClose={() => setOverriding(null)} />}
      {deleting && (
        <Confirm
          title="Eliminare la partita?"
          message={
            <p>
              {nameOf(deleting.playerA)} {deleting.setsA}-{deleting.setsB} {nameOf(deleting.playerB)} del {formatDate(deleting.date)}.
              <br />
              La partita finisce nel cestino e può essere ripristinata. Se vuoi solo che non conti per la classifica, usa
              “Escludi”.
              {lastOfTournament(deleting) && (
                <>
                  <br />
                  <strong>È l'ultima partita del torneo: verrà eliminato anche il torneo.</strong>
                </>
              )}
            </p>
          }
          confirmLabel="Elimina"
          danger
          onConfirm={() =>
            update((d) => deleteMatch(d, deleting.id), 'eliminazione partita') &&
            toast(lastOfTournament(deleting) ? 'Partita eliminata, e con lei il torneo (Ctrl+Z per annullare)' : 'Partita eliminata')
          }
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

function MatchEditor({ match, onClose }: { match: Match; onClose: () => void }) {
  const { data, update, toast } = useStore()
  const [date, setDate] = useState(match.date)
  const [a, setA] = useState(match.playerA)
  const [b, setB] = useState(match.playerB)
  const [sa, setSa] = useState(match.setsA)
  const [sb, setSb] = useState(match.setsB)
  const [note, setNote] = useState(match.note ?? '')
  const [setsText, setSetsText] = useState(match.setScores ? setScoresText(match) : '')
  const players = data.players.filter((p) => !p.deleted).sort((x, y) => x.name.localeCompare(y.name, 'it'))
  const tour = match.tournamentId ? data.tournaments.find((t) => t.id === match.tournamentId) : undefined
  // Nei tornei con gironi o tabellone giocatori e fase sono fissi: per cambiarli si elimina e si reinserisce.
  const locked = !!tour && hasGroups(tour)
  const valid = a && b && a !== b && isValidScore(sa, sb, !!tour)

  function save() {
    // "11-7 9-11 11-5": coppie di punti separate da spazi o virgole.
    const parts = setsText.split(/[\s,;]+/).filter(Boolean)
    const setScores = parts.map((p) => p.split('-').map(Number) as [number, number])
    if (setScores.some((s) => s.length !== 2 || s.some((n) => Number.isNaN(n)))) {
      toast('Punteggi dei set: scrivili come 11-7 9-11 11-5', 'error')
      return
    }
    const draft = {
      date,
      playerA: a,
      playerB: b,
      setsA: sa,
      setsB: sb,
      note,
      setScores
    }
    if (update((d) => updateMatch(d, match.id, draft), 'modifica partita')) {
      toast('Partita aggiornata, classifica ricalcolata')
      onClose()
    }
  }

  return (
    <Modal
      title="Modifica partita"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            Salva
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label>
          Data
          <input type="date" value={date} disabled={!!tour} onChange={(e) => setDate(e.target.value)} />
          {tour && <small className="muted">La data si cambia da “Imposta torneo”</small>}
        </label>
        {tour ? (
          <label>
            Torneo
            <input value={`${tournamentLabel(tour)} · K ${tour.k}`} disabled />
          </label>
        ) : (
          <span />
        )}
        {locked && (
          <label className="span2">
            Fase
            <input value={stageLabel(tour, match.stage) || '—'} disabled />
            <small className="muted">Giocatori e fase non si cambiano: per correggerli elimina la partita e reinseriscila</small>
          </label>
        )}
        <label>
          Giocatore 1
          <select value={a} disabled={locked} onChange={(e) => setA(e.target.value)}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Giocatore 2
          <select value={b} disabled={locked} onChange={(e) => setB(e.target.value)}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Set giocatore 1
          <input type="number" min={0} max={3} value={sa} onChange={(e) => setSa(Number(e.target.value))} />
        </label>
        <label>
          Set giocatore 2
          <input type="number" min={0} max={3} value={sb} onChange={(e) => setSb(Number(e.target.value))} />
        </label>
        {tour && (
          <label className="span2">
            Punteggi dei set (facoltativi)
            <input value={setsText} placeholder="es. 11-7 9-11 11-5" onChange={(e) => setSetsText(e.target.value)} />
            <small className="muted">Dal punto di vista del giocatore 1</small>
          </label>
        )}
        <label className="span2">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {!valid && (
        <p className="neg small">Controlla giocatori e risultato ({tour ? '3-0, 3-1, 3-2 oppure 2-0, 2-1' : '3-0, 3-1 o 3-2'}).</p>
      )}
    </Modal>
  )
}

function OverrideEditor({ result, onClose }: { result: MatchResult; onClose: () => void }) {
  const { update, toast } = useStore()
  const m = result.match
  const [reason, setReason] = useState(m.override?.reason ?? '')
  const target: OverrideMode = result.eval.counted ? 'exclude' : 'include'

  function apply(mode: OverrideMode | undefined) {
    const ok = update(
      (d) => setMatchOverride(d, m.id, mode ? { mode, reason: reason.trim() || undefined } : undefined),
      mode ? (mode === 'include' ? 'inclusione manuale' : 'esclusione manuale') : 'ripristino regola automatica'
    )
    if (ok) {
      toast('Classifica ricalcolata')
      onClose()
    }
  }

  return (
    <Modal
      title={target === 'exclude' ? 'Escludi dalla classifica' : 'Includi nella classifica'}
      onClose={onClose}
      footer={
        <>
          {m.override && (
            <button className="btn btn-ghost" onClick={() => apply(undefined)}>
              Torna alla regola automatica
            </button>
          )}
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={() => apply(target)}>
            {target === 'exclude' ? 'Escludi' : 'Includi'}
          </button>
        </>
      }
    >
      {!result.eval.counted && result.eval.reason && (
        <p>
          Esclusa ora perché: <em>{result.eval.reason}</em>.
        </p>
      )}
      <p className="muted">
        {target === 'exclude'
          ? 'La partita resta registrata ma non darà né toglierà punti.'
          : 'La partita conterà per la classifica anche se le regole automatiche la escluderebbero.'}
      </p>
      <label className="block">
        Motivo (facoltativo)
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. decisione del responsabile" autoFocus />
      </label>
    </Modal>
  )
}
