import { useMemo, useState } from 'react'
import { tournamentLabel, todayISO } from '@core/format'
import { addTournament, deleteTournament, newId, updateTournament } from '@core/mutations'
import {
  FORMAT_LABELS,
  MAX_BRACKET_ROUNDS,
  drawOf,
  formatOf,
  groupName,
  hasBracket,
  roundLabel,
  autoDraw,
  groupsComplete,
  tournamentMatches,
  tournamentSummary
} from '@core/tournament'
import { BYE, type Tournament, type TournamentFormat } from '@core/types'
import { useStore } from '../store'
import { Confirm, Modal } from './ui'

const FORMATS: TournamentFormat[] = ['group', 'group-bracket', 'groups-bracket', 'free']

/** Crea un torneo o ne modifica dati e struttura (gironi, tabellone e accoppiamenti del primo turno). */
export function TournamentSetup({
  tournament,
  defaultDate,
  onClose,
  onSaved
}: {
  tournament?: Tournament
  defaultDate?: string
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { data, update, toast } = useStore()
  const t = tournament
  const [name, setName] = useState(t?.name ?? '')
  const [date, setDate] = useState(t?.date ?? defaultDate ?? todayISO())
  const [k, setK] = useState(t?.k ?? data.settings.tournamentK)
  const [format, setFormat] = useState<TournamentFormat>(t ? formatOf(t) : 'group-bracket')
  const [groupCount, setGroupCount] = useState(Math.max(2, t?.groups?.length ?? 2))
  const [assign, setAssign] = useState<Record<string, number>>(() => {
    const a: Record<string, number> = {}
    t?.groups?.forEach((g, i) => g.players.forEach((p) => (a[p] = i)))
    return a
  })
  const [rounds, setRounds] = useState(t?.bracketRounds ?? 2)
  const [thirdPlace, setThirdPlace] = useState(t?.thirdPlace ?? false)
  const [draw, setDraw] = useState<(string | null)[]>(() => (t && hasBracket(t) ? drawOf(t) : Array(2 ** 2).fill(null)))
  const [auto, setAuto] = useState(!!t?.drawAuto)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const matches = useMemo(() => (t ? tournamentMatches(data, t.id) : []), [data, t])
  const hasMatches = matches.length > 0
  // Ciò che è già stato giocato non si può più cambiare da qui.
  const bracketStarted = matches.some((m) => m.stage?.type === 'bracket' || m.stage?.type === 'third')
  const playedInGroup = new Set(matches.filter((m) => m.stage?.type === 'group').flatMap((m) => [m.playerA, m.playerB]))
  const formatLocked = hasMatches

  const multi = format === 'groups-bracket'
  const count = multi ? groupCount : 1
  const inGroup = (id: string) => assign[id] >= 0 && assign[id] < count
  const inGroups = new Set(Object.keys(assign).filter(inGroup))
  // Giocatori attivi, più chi è già in un girone anche se nel frattempo è diventato inattivo.
  const players = data.players
    .filter((p) => !p.deleted && (p.status === 'active' || inGroups.has(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const minGroups = Math.max(
    2,
    ...matches
      .filter((m) => m.stage?.type === 'group')
      .map((m) => (t?.groups?.findIndex((g) => m.stage?.type === 'group' && g.id === m.stage.group) ?? 0) + 1)
  )

  // Per aiutare a comporre il tabellone: posizione di ciascuno nel suo girone.
  const positions = useMemo(() => {
    const out = new Map<string, string>()
    if (!t) return out
    const s = tournamentSummary(data, t)
    for (const g of s.groups) {
      if (!g.matches.length) continue
      for (const r of g.standings) out.set(r.playerId, `${r.position}º${s.groups.length > 1 ? ` ${g.group.name}` : ''}`)
    }
    return out
  }, [data, t])

  const entrants = players.filter((p) => inGroup(p.id))
  const size = 2 ** rounds
  const usedInDraw = new Set(draw.filter((p): p is string => !!p && p !== BYE))
  const byes = draw.filter((p) => p === BYE).length
  const undecided = draw.filter((p) => p === null).length

  function setPlayer(id: string, group: number) {
    setAssign({ ...assign, [id]: group })
    // Chi esce dal torneo esce anche dal tabellone.
    if (group < 0 || group >= count) setDraw(draw.map((p) => (p === id ? null : p)))
  }

  // A gironi finiti il tabellone si compone da solo; qui si può rifare o ritoccare a mano.
  const canAuto = !!t && !bracketStarted && groupsComplete(t, matches)
  function composeFromGroups(r = rounds) {
    if (!t) return
    setDraw(autoDraw(data, { ...t, bracketRounds: r }))
    setAuto(true)
  }

  function changeRounds(r: number) {
    setRounds(r)
    if (canAuto) composeFromGroups(r)
    else {
      setDraw(Array(2 ** r).fill(null))
      setAuto(false)
    }
  }

  function setSlot(i: number, v: string) {
    setDraw(draw.map((p, j) => (j === i ? (v === '' ? null : v) : p)))
    setAuto(false)
  }

  function save() {
    const groups = Array.from({ length: count }, (_, i) => ({
      id: t?.groups?.[i]?.id ?? newId(),
      name: groupName(i),
      players: players.filter((p) => assign[p.id] === i).map((p) => p.id)
    }))
    const draft = { name, date, k, format, groups, bracketRounds: rounds, thirdPlace, draw, drawAuto: auto }
    let id = t?.id ?? ''
    const ok = update(
      (d) => {
        if (t) return updateTournament(d, t.id, draft)
        const r = addTournament(d, draft)
        id = r.id
        return r.data
      },
      t ? 'modifica torneo' : 'nuovo torneo'
    )
    if (!ok) return
    toast(t ? 'Torneo aggiornato' : `Creato: ${tournamentLabel({ name, date })}`)
    onSaved?.(id)
    onClose()
  }

  function remove() {
    if (t && update((d) => deleteTournament(d, t.id), 'eliminazione torneo')) {
      toast(hasMatches ? `Torneo eliminato con le sue ${matches.length} partite (Ctrl+Z per annullare)` : 'Torneo eliminato')
      onClose()
    }
  }

  const slotSelect = (i: number) => {
    const v = draw[i]
    const partner = draw[i % 2 ? i - 1 : i + 1]
    return (
      <select value={v ?? ''} disabled={bracketStarted} onChange={(e) => setSlot(i, e.target.value)} aria-label={`Posto ${i + 1} del tabellone`}>
        <option value="">Da decidere</option>
        {rounds > 1 && (
          <option value={BYE} disabled={partner === BYE}>
            X · passa il turno l'avversario
          </option>
        )}
        {entrants.map((p) => (
          <option key={p.id} value={p.id} disabled={usedInDraw.has(p.id) && v !== p.id}>
            {p.name}
            {positions.get(p.id) ? ` (${positions.get(p.id)})` : ''}
          </option>
        ))}
      </select>
    )
  }

  return (
    <>
      <Modal
        title={t ? 'Imposta torneo' : 'Nuovo torneo'}
        onClose={onClose}
        wide
        footer={
          <>
            {t && (
              <button className="btn btn-ghost danger" onClick={() => setConfirmDelete(true)}>
                Elimina torneo
              </button>
            )}
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>
              Annulla
            </button>
            <button className="btn btn-primary" disabled={!date || !(k > 0)} onClick={save}>
              {t ? 'Salva' : 'Crea torneo'}
            </button>
          </>
        }
      >
        <div className="form-grid tour-form">
          <label className="span2">
            Nome (facoltativo)
            <input value={name} placeholder={tournamentLabel({ date })} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Fattore K
            <input type="number" min={1} value={k} onChange={(e) => setK(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </div>

        <div className="field-stack mt">
          <span className="label">Formato</span>
          <div className="seg seg-wrap" role="group" aria-label="Formato del torneo">
            {FORMATS.map((f) => (
              <button
                key={f}
                className={format === f ? 'active' : ''}
                aria-pressed={format === f}
                disabled={formatLocked && (f === 'free') !== (format === 'free')}
                onClick={() => setFormat(f)}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
          {format === 'free' && <p className="muted small">Solo l'elenco delle partite, senza gironi né tabellone.</p>}
        </div>

        {format !== 'free' && (
          <div className="field-stack mt">
            <span className="label-row">
              <span className="label">{multi ? 'Gironi' : 'Partecipanti'}</span>
              {multi && (
                <span className="row">
                  <span className="small muted">Numero di gironi</span>
                  <input
                    className="num-input"
                    type="number"
                    min={minGroups}
                    max={8}
                    value={groupCount}
                    onChange={(e) => setGroupCount(Math.min(8, Math.max(minGroups, Number(e.target.value) || 2)))}
                  />
                </span>
              )}
            </span>
            <div className="group-assign">
              {players.map((p) => {
                const locked = playedInGroup.has(p.id)
                return (
                  <div
                    key={p.id}
                    className={`group-assign-row ${inGroup(p.id) ? 'on' : ''}`}
                    title={locked ? 'Ha già giocato nel suo girone: non si può spostare' : undefined}
                  >
                    <span className="grow">{p.name}</span>
                    {multi ? (
                      <div className="seg seg-sm" role="group" aria-label={`Girone di ${p.name}`}>
                        <button className={!inGroup(p.id) ? 'active' : ''} disabled={locked} onClick={() => setPlayer(p.id, -1)}>
                          —
                        </button>
                        {Array.from({ length: count }, (_, i) => (
                          <button key={i} className={assign[p.id] === i ? 'active' : ''} disabled={locked} onClick={() => setPlayer(p.id, i)}>
                            {groupName(i)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`${p.name} partecipa`}
                        checked={assign[p.id] === 0}
                        disabled={locked}
                        onChange={(e) => setPlayer(p.id, e.target.checked ? 0 : -1)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="muted small">
              {multi
                ? Array.from({ length: count }, (_, i) => `Girone ${groupName(i)}: ${players.filter((p) => assign[p.id] === i).length}`).join(' · ')
                : `${inGroups.size} partecipanti`}
              {playedInGroup.size > 0 && ' · chi ha già giocato nel girone non si può spostare'}
            </p>
          </div>
        )}

        {hasBracket({ format }) && (
          <>
            <div className="form-grid mt">
              <label>
                Il tabellone parte da
                <select value={rounds} disabled={bracketStarted} onChange={(e) => changeRounds(Number(e.target.value))}>
                  {Array.from({ length: MAX_BRACKET_ROUNDS }, (_, i) => i + 1).map((r) => (
                    <option key={r} value={r} disabled={entrants.length <= 2 ** (r - 1) && r !== rounds}>
                      {roundLabel(r)} ({2 ** r} posti)
                    </option>
                  ))}
                </select>
                <small className="muted">Servono più di {2 ** (rounds - 1)} partecipanti; i posti vuoti si riempiono con la X</small>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={thirdPlace && rounds >= 2}
                  disabled={rounds < 2 || (bracketStarted && !!t?.thirdPlace && matches.some((m) => m.stage?.type === 'third'))}
                  onChange={(e) => setThirdPlace(e.target.checked)}
                />
                Finale per il 3º/4º posto
              </label>
            </div>

            <div className="field-stack mt">
              <span className="label-row">
                <span className="row">
                  <span className="label">{roundLabel(rounds)}: accoppiamenti</span>
                  {auto && !bracketStarted && <span className="chip chip-ok">composto dai gironi</span>}
                  {canAuto && (
                    <button className="btn btn-sm" onClick={() => composeFromGroups()}>
                      {auto ? 'Ricomponi dai gironi' : 'Componi dai gironi'}
                    </button>
                  )}
                </span>
                <span className="small muted">
                  {size - byes - undecided} giocatori · {byes} X · {undecided} da decidere
                </span>
              </span>
              {bracketStarted && (
                <p className="dim small">Il tabellone è già iniziato: per cambiare gli accoppiamenti elimina prima le sue partite.</p>
              )}
              <div className="draw-grid">
                {Array.from({ length: size / 2 }, (_, i) => (
                  <div key={i} className="draw-pair">
                    <span className="mono small dim">{i + 1}</span>
                    {slotSelect(2 * i)}
                    <span className="dim">vs</span>
                    {slotSelect(2 * i + 1)}
                  </div>
                ))}
              </div>
              <p className="muted small">
                Chi è accoppiato con la X passa direttamente al turno successivo. I turni seguenti si compongono da soli con i vincitori. Quando i
                gironi finiscono l'app compone il primo turno: prima i primi classificati, poi i secondi e così via, con la X alle teste di serie e
                senza compagni di girone al primo turno. Puoi sempre cambiarlo a mano: da quel momento resta com'è.
              </p>
              {entrants.length > 0 && usedInDraw.size < entrants.length && undecided === 0 && (
                <p className="dim small">
                  Non entrano nel tabellone:{' '}
                  {entrants
                    .filter((p) => !usedInDraw.has(p.id))
                    .map((p) => nameOf(p.id))
                    .join(', ')}
                </p>
              )}
            </div>
          </>
        )}
      </Modal>
      {confirmDelete && t && (
        <Confirm
          title="Eliminare il torneo?"
          message={
            <p>
              {tournamentLabel(t)} sparisce dagli elenchi
              {hasMatches ? ` e le sue ${matches.length} partite vanno nel cestino (escono dalla classifica)` : ''}. Si può annullare con Ctrl+Z.
            </p>
          }
          confirmLabel="Elimina torneo"
          danger
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
