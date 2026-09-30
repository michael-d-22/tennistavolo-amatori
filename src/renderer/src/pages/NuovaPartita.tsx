import { useMemo, useState } from 'react'
import { fmtDelta, formatLongDate, todayISO, tournamentLabel } from '@core/format'
import { addMatch } from '@core/mutations'
import { BYE, type MatchStage } from '@core/types'
import { pairKey } from '@core/rules'
import { previewMatch } from '@core/standings'
import {
  FORMAT_LABELS,
  buildBracket,
  hasBracket,
  hasGroups,
  isBye,
  pendingNodes,
  phasesOf,
  remainingPairs,
  samePhase,
  stageLabel,
  stageOfNode,
  tournamentMatches,
  type BracketNode,
  type Phase
} from '@core/tournament'
import { useStore } from '../store'
import { Empty, Meter, PageHead } from '../components/ui'
import { IconChevron } from '../components/icons'
import { TournamentSetup } from '../components/TournamentSetup'
import type { Navigate } from '../App'

const WIN_A: [number, number][] = [
  [3, 0],
  [3, 1],
  [3, 2]
]
const WIN_B: [number, number][] = [
  [2, 3],
  [1, 3],
  [0, 3]
]

const WIN_A3: [number, number][] = [
  [2, 0],
  [2, 1]
]
const WIN_B3: [number, number][] = [
  [1, 2],
  [0, 2]
]

const ORDINALS = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava']

export function NuovaPartitaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [score, setScore] = useState<[number, number] | null>(null)
  const [note, setNote] = useState('')
  // Modalità torneo: tutte le partite del torneo si inseriscono di seguito, fase per fase.
  const [tourMode, setTourMode] = useState(false)
  const [tourId, setTourId] = useState('')
  const [phase, setPhase] = useState<Phase | undefined>(undefined)
  const [nodeSlot, setNodeSlot] = useState<number | null>(null)
  const [sets, setSets] = useState<[string, string][]>([])
  const [setup, setSetup] = useState<'new' | 'edit' | null>(null)

  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const ratingOf = (id: string) => computed.standings.find((s) => s.player.id === id)?.rating ?? data.settings.startRating
  const { maxMatchesPerPair: max, minMatchesPerPair: min } = data.settings

  const tournaments = data.tournaments.filter((t) => !t.deleted).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
  const tour = tourMode ? tournaments.find((t) => t.id === tourId) : undefined
  const phases = tour ? phasesOf(tour) : []
  const curPhase = phases.find((p) => samePhase(p, phase)) ?? phases[0]
  const matchDate = tour ? tour.date : date
  const tMatches = useMemo(() => (tour ? tournamentMatches(data, tour.id) : []), [data, tour])
  const bracket = useMemo(() => (tour && hasBracket(tour) ? buildBracket(tour, tMatches) : null), [tour, tMatches])

  // Girone: chi ha già affrontato chi (ogni coppia gioca una volta sola).
  const group = curPhase?.type === 'group' ? tour?.groups?.find((g) => g.id === curPhase.group) : undefined
  const remaining = group ? remainingPairs(group, tMatches) : []
  const canStillPlay = (p: string, vs?: string) => remaining.some(([x, y]) => (x === p || y === p) && (!vs || x === vs || y === vs))

  // Tabellone: solo le partite in programma nel turno scelto.
  const isKnockout = curPhase?.type === 'bracket' || curPhase?.type === 'third'
  const pending = bracket && curPhase && isKnockout ? pendingNodes(bracket, curPhase) : []
  const node = pending.find((n) => n.slot === nodeSlot) ?? null
  const roundNodes =
    bracket && curPhase?.type === 'bracket' ? (bracket.rounds.find((r) => r[0]?.round === curPhase.round) ?? []) : bracket?.third ? [bracket.third] : []

  const players = data.players
    .filter((p) => {
      if (p.deleted) return false
      if (group) return group.players.includes(p.id)
      if (tour && hasGroups(tour)) return false
      return p.status === 'active'
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'it'))
  const activeCount = data.players.filter((p) => !p.deleted && p.status === 'active').length

  function clearPlayers() {
    setA('')
    setB('')
    setNodeSlot(null)
  }

  function pickTournament(id: string) {
    setTourId(id)
    setPhase(undefined)
    clearPlayers()
    // Cambiando torneo si riparte da capo: niente risultato o set rimasti dal torneo precedente.
    pickScore(null)
  }

  function pickPhase(p: Phase) {
    setPhase(p)
    clearPlayers()
  }

  function pickNode(n: BracketNode) {
    setNodeSlot(n.slot)
    setA(n.a!)
    setB(n.b!)
  }

  function pickPair(x: string, y: string) {
    setA(x)
    setB(y)
  }

  // Nel girone, cambiando un giocatore si toglie l'altro se hanno già giocato tra loro.
  function pickA(id: string) {
    setA(id)
    if (group && b && (b === id || !canStillPlay(id, b))) setB('')
  }
  function pickB(id: string) {
    setB(id)
    if (group && a && (a === id || !canStillPlay(id, a))) setA('')
  }

  function switchMode(on: boolean) {
    setTourMode(on)
    pickScore(null)
    clearPlayers()
  }

  function pickScore(s: [number, number] | null) {
    setScore(s)
    const n = s ? s[0] + s[1] : 0
    setSets((old) => Array.from({ length: n }, (_, i) => old[i] ?? ['', '']))
  }

  function setSet(i: number, side: 0 | 1, v: string) {
    setSets(sets.map((x, j) => (j === i ? ((side === 0 ? [v, x[1]] : [x[0], v]) as [string, string]) : x)))
  }

  const preview = useMemo(() => {
    if (!a || !b || a === b || !score) return null
    return previewMatch(data, { date: matchDate, playerA: a, playerB: b, setsA: score[0], setsB: score[1], tournamentId: tour?.id })
  }, [data, matchDate, a, b, score, tour])

  const stageToSave: MatchStage | undefined = !tour || !hasGroups(tour) ? undefined : isKnockout ? (node ? stageOfNode(node) : undefined) : curPhase
  const structureOk = !tourMode || (!!tour && (!hasGroups(tour) || (isKnockout ? !!node : !!group && canStillPlay(a, b))))
  const pairCount = a && b && a !== b ? (computed.pairCounted.get(pairKey(a, b)) ?? 0) : null
  const canSave = !!a && !!b && a !== b && !!score && structureOk
  const aWins = !!score && score[0] > score[1]
  const bWins = !!score && score[1] > score[0]

  function save() {
    if (!canSave) return
    const filled = sets.filter(([x, y]) => x !== '' || y !== '').length
    if (filled > 0 && filled < sets.length) {
      toast('Completa i punteggi di tutti i set, oppure lasciali tutti vuoti', 'error')
      return
    }
    const setScores = filled ? sets.map(([x, y]) => [Number(x), Number(y)] as [number, number]) : undefined
    const match = {
      date: matchDate,
      playerA: a,
      playerB: b,
      setsA: score![0],
      setsB: score![1],
      note,
      tournamentId: tour?.id,
      stage: stageToSave,
      setScores
    }
    let bracketReady = false
    const ok = update(
      (d) => {
        const next = addMatch(d, match).data
        // A gironi finiti l'app compone il tabellone: lo si segnala.
        const before = d.tournaments.find((x) => x.id === tour?.id)
        const after = next.tournaments.find((x) => x.id === tour?.id)
        bracketReady = !!after?.drawAuto && JSON.stringify(before?.draw) !== JSON.stringify(after.draw)
        return next
      },
      tour ? 'partita di torneo' : 'nuova partita'
    )
    if (!ok) return
    const winner = aWins ? a : b
    toast(`Salvata: vince ${nameOf(winner)} ${Math.max(...score!)}–${Math.min(...score!)}`)
    if (bracketReady) setTimeout(() => toast('Gironi completati: tabellone composto. Puoi ritoccarlo da “Imposta”'), 400)
    clearPlayers()
    pickScore(null)
    setNote('')
  }

  // Avanzamento di ogni fase, mostrato sui pulsanti.
  const phaseCount = (p: Phase): string => {
    if (!tour) return ''
    if (p.type === 'group') {
      const g = tour.groups?.find((x) => x.id === p.group)
      if (!g) return ''
      const total = (g.players.length * (g.players.length - 1)) / 2
      return `${total - remainingPairs(g, tMatches).length}/${total}`
    }
    if (!bracket) return ''
    const nodes = p.type === 'third' ? (bracket.third ? [bracket.third] : []) : (bracket.rounds.find((r) => r[0]?.round === p.round) ?? [])
    const real = nodes.filter((n) => !isBye(n))
    return `${real.filter((n) => n.match).length}/${real.length}`
  }

  if (activeCount < 2) {
    return (
      <>
        <PageHead title="Nuova partita" />
        <Empty>
          Servono almeno due giocatori attivi.{' '}
          <button className="link" onClick={() => navigate({ page: 'giocatori' })}>
            Aggiungi giocatori
          </button>
        </Empty>
      </>
    )
  }

  const surname = (id: string) => {
    const n = nameOf(id)
    const parts = n.split(' ')
    return parts.length > 1 ? parts.slice(1).join(' ') : n
  }

  const renderSelect = (value: string, other: string, onPick: (id: string) => void, label: string, winner: boolean) => (
    <label className={`player-select ${winner ? 'winner' : ''}`}>
      <span className="label-row">
        <span className="label">{label}</span>
        {winner && <span className="label strong">Vincitore</span>}
      </span>
      <span className="select-wrap">
        {isKnockout ? (
          <select value={value} disabled aria-label={label}>
            <option value="">{pending.length ? 'Scegli la partita qui sopra' : '—'}</option>
            {value && <option value={value}>{nameOf(value)}</option>}
          </select>
        ) : (
          <select value={value} onChange={(e) => onPick(e.target.value)}>
            <option value="">Scegli…</option>
            {players.map((p) => {
              // Nel girone: niente avversari già affrontati né chi ha già giocato con tutti.
              const blocked = group ? (other ? !canStillPlay(p.id, other) : !canStillPlay(p.id)) : false
              return (
                <option key={p.id} value={p.id} disabled={p.id === other || (blocked && p.id !== value)}>
                  {p.name} · {Math.round(ratingOf(p.id))}
                  {group && blocked && p.id !== other ? ' (già giocata)' : ''}
                </option>
              )
            })}
          </select>
        )}
        <IconChevron />
      </span>
    </label>
  )


  const scoreButtons = (list: [number, number][], label: string) => (
    <div className="score-grid" role="group" aria-label={label}>
      {list.map(([x, y]) => {
        const on = !!score && score[0] === x && score[1] === y
        return (
          <button key={`${x}${y}`} className={`score-btn ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => pickScore([x, y])}>
            {x}–{y}
          </button>
        )
      })}
    </div>
  )

  // Nei tornei si sceglie per ogni partita se era al meglio dei 5 o dei 3 set.
  const scoreGroup = (bo5: [number, number][], bo3: [number, number][], label: string) => (
    <div className="score-group">
      <span className="label">{label}</span>
      {tourMode && <span className="bo-label">Al meglio dei 5</span>}
      {scoreButtons(bo5, `${label}, al meglio dei 5`)}
      {tourMode && (
        <>
          <span className="bo-label">Al meglio dei 3</span>
          {scoreButtons(bo3, `${label}, al meglio dei 3`)}
        </>
      )}
    </div>
  )

  const deltaA = preview?.deltaA ?? 0
  // I punti si calcolano sulla classifica in vigore e si sommano alla prossima pubblicazione.
  const periodNote = preview && !preview.pending ? ' · classifica già pubblicata: verrà ricalcolata' : ''
  const nextIndex = pairCount != null ? pairCount + 1 : 0

  const asideResults = tourMode
    ? computed.results.filter((r) => !!tour && r.match.tournamentId === tour.id).reverse()
    : computed.results.filter((r) => r.match.date === date).reverse()
  const asideTitle = tourMode ? (tour ? tournamentLabel(tour) : 'Torneo') : date === todayISO() ? 'Stasera' : formatLongDate(date)
  const stageKey = (s: Phase) => (s.type === 'group' ? `g${s.group}` : s.type === 'third' ? 't' : `b${s.round}`)

  // Perché nel turno scelto non c'è niente da giocare.
  function knockoutHint(): string {
    if (curPhase?.type === 'third') {
      if (!bracket?.third) return 'Non si gioca: una semifinale è stata vinta con la X.'
      if (bracket.third.match) return 'Finale per il 3º posto già inserita.'
      return 'In attesa dei risultati delle semifinali.'
    }
    const real = roundNodes.filter((n) => !isBye(n))
    if (real.length && real.every((n) => n.match)) return 'Turno completo: tutte le partite sono state inserite.'
    if (curPhase?.type === 'bracket' && curPhase.round === tour?.bracketRounds) {
      return 'Accoppiamenti non ancora decisi: completali da “Imposta”.'
    }
    return 'In attesa dei risultati del turno precedente.'
  }

  return (
    <div className="entry-layout">
      <div className="entry-main">
        <PageHead
          title={tourMode ? 'Partite di torneo' : 'Nuova partita'}
          actions={
            <>
              <div className="seg" role="group" aria-label="Tipo di inserimento">
                <button className={!tourMode ? 'active' : ''} aria-pressed={!tourMode} onClick={() => switchMode(false)}>
                  Partita singola
                </button>
                <button className={tourMode ? 'active' : ''} aria-pressed={tourMode} onClick={() => switchMode(true)}>
                  Torneo
                </button>
              </div>
              <label className="field-stack">
                <span className="label">Data</span>
                <input
                  type="date"
                  value={matchDate}
                  max={todayISO()}
                  disabled={!!tour}
                  title={tour ? 'È la data del torneo: si cambia da “Imposta”' : undefined}
                  onChange={(e) => setDate(e.target.value || todayISO())}
                />
              </label>
            </>
          }
        />

        {tourMode && (
          <section className="tour-bar">
            <label className="field-stack">
              <span className="label">Torneo</span>
              <select value={tour?.id ?? ''} onChange={(e) => pickTournament(e.target.value)}>
                <option value="">Scegli un torneo…</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tournamentLabel(t)}
                    {t.name ? ` · ${formatLongDate(t.date)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="tour-bar-info">
              {tour ? (
                <>
                  <span className="label">{FORMAT_LABELS[tour.format ?? 'free']}</span>
                  <span className="small">
                    {formatLongDate(tour.date)} · K {tour.k}
                    {tour.groups?.length ? ` · ${tour.groups.reduce((n, g) => n + g.players.length, 0)} partecipanti` : ''}
                  </span>
                </>
              ) : (
                <span className="small">Scegli il torneo o creane uno nuovo con gironi e tabellone.</span>
              )}
            </div>
            <div className="row">
              {tour && (
                <button className="btn" onClick={() => setSetup('edit')}>
                  Imposta
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setSetup('new')}>
                Nuovo torneo
              </button>
            </div>
            {tour && phases.length > 0 && (
              <div className="stage-row">
                <span className="label">Fase</span>
                <div className="seg seg-wrap" role="group" aria-label="Fase del torneo">
                  {phases.map((p) => (
                    <button key={stageKey(p)} className={samePhase(p, curPhase) ? 'active' : ''} aria-pressed={samePhase(p, curPhase)} onClick={() => pickPhase(p)}>
                      {stageLabel(tour, p)} <span className="seg-count">{phaseCount(p)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tour && group && (
              <div className="stage-row">
                <span className="label">Da giocare</span>
                {remaining.length === 0 ? (
                  <span className="small">Girone {group.name} completo: tutte le coppie si sono affrontate.</span>
                ) : (
                  <div className="pair-chips">
                    {remaining.map(([x, y]) => (
                      <button
                        key={`${x}${y}`}
                        className={`pair-chip ${(a === x && b === y) || (a === y && b === x) ? 'active' : ''}`}
                        onClick={() => pickPair(x, y)}
                      >
                        {surname(x)} – {surname(y)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tour && isKnockout && (
              <div className="stage-row">
                <span className="label">Da giocare</span>
                {pending.length > 0 ? (
                  <div className="pair-chips">
                    {pending.map((n) => (
                      <button key={n.slot} className={`pair-chip ${nodeSlot === n.slot ? 'active' : ''}`} onClick={() => pickNode(n)}>
                        {nameOf(n.a!)} – {nameOf(n.b!)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="small">{knockoutHint()}</span>
                )}
                {roundNodes.some(isBye) && (
                  <span className="small dim">
                    Passano il turno con la X:{' '}
                    {roundNodes
                      .filter(isBye)
                      .map((n) => (n.a === BYE ? n.b : n.a))
                      .filter((p): p is string => !!p && p !== BYE)
                      .map(nameOf)
                      .join(', ') || '—'}
                  </span>
                )}
              </div>
            )}
            <p className="tour-bar-note">
              Le partite di torneo usano il K del torneo e non rientrano nel limite di {max} partite per coppia né nel minimo di {min}.
            </p>
          </section>
        )}

        {setup && (
          <TournamentSetup
            tournament={setup === 'edit' ? tour : undefined}
            defaultDate={date}
            onClose={() => setSetup(null)}
            onSaved={(id) => setup === 'new' && pickTournament(id)}
          />
        )}

        <section className="vs-row">
          {renderSelect(a, b, pickA, 'Giocatore 1', aWins)}
          <div className="vs">VS</div>
          {renderSelect(b, a, pickB, 'Giocatore 2', bWins)}
        </section>

        <section className="vs-row">
          {scoreGroup(WIN_A, WIN_A3, 'Vince il giocatore 1')}
          <div />
          {scoreGroup(WIN_B, WIN_B3, 'Vince il giocatore 2')}
        </section>

        {tourMode && sets.length > 0 && (
          <section className="set-scores">
            <span className="label-row">
              <span className="label">Punteggi dei set (facoltativi)</span>
              <span className="label">
                {a ? surname(a) : 'G1'} – {b ? surname(b) : 'G2'}
              </span>
            </span>
            <div className="set-grid">
              {sets.map(([x, y], i) => (
                <div key={i} className="set-cell">
                  <span className="bo-label">Set {i + 1}</span>
                  <span className="set-pair">
                    <input type="number" min={0} inputMode="numeric" aria-label={`Set ${i + 1}, giocatore 1`} value={x} onChange={(e) => setSet(i, 0, e.target.value)} />
                    <span className="dim">–</span>
                    <input type="number" min={0} inputMode="numeric" aria-label={`Set ${i + 1}, giocatore 2`} value={y} onChange={(e) => setSet(i, 1, e.target.value)} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={`preview-strip ${preview && !preview.eval.counted ? 'warn' : ''}`}>
          {preview && preview.eval.counted ? (
            <>
              <div className="preview-cell">
                <span className="label">{nameOf(a)}</span>
                <span className="preview-value">
                  <b className={deltaA < 0 ? 'neg' : ''}>{fmtDelta(deltaA, 1)}</b>
                  <span className="mono dim">
                    su {Math.round(preview.ratingA)} pt{periodNote}
                  </span>
                </span>
              </div>
              <div className="preview-cell">
                <span className="label">{nameOf(b)}</span>
                <span className="preview-value">
                  <b className={-deltaA < 0 ? 'neg' : ''}>{fmtDelta(-deltaA, 1)}</b>
                  <span className="mono dim">
                    su {Math.round(preview.ratingB)} pt{periodNote}
                  </span>
                </span>
              </div>
            </>
          ) : preview ? (
            <div className="preview-cell wide">
              <span className="label neg">Non conta per la classifica</span>
              <span>La partita viene registrata ma non assegna punti: {preview.eval.reason?.toLowerCase()}.</span>
            </div>
          ) : (
            <div className="preview-cell wide">
              <span className="label">Punti in palio</span>
              <span className="dim">Scegli i due giocatori e il risultato per vedere quanti punti guadagnano o perdono.</span>
            </div>
          )}
          {tourMode ? (
            <div className="preview-cell meter-cell">
              <span className="label-row">
                <span className="label">Partita di torneo</span>
                <span className="label strong">K {tour?.k ?? '—'}</span>
              </span>
              <span className="dim small">
                Fuori dai limiti per coppia: non occupa nessuna delle {max} partite
                {pairCount != null ? ` (tra loro ne hanno già ${pairCount} valide)` : ''}.
              </span>
            </div>
          ) : (
            <div className="preview-cell meter-cell">
              <span className="label-row">
                <span className="label">Scontri validi tra loro</span>
                <span className="label strong">{pairCount != null ? `${pairCount} / ${max}` : `— / ${max}`}</span>
              </span>
              <Meter value={pairCount ?? 0} max={max} min={min} label={pairCount != null ? `${pairCount} partite valide su ${max}` : 'Nessuna coppia scelta'} />
              <span className="dim small">
                {pairCount == null
                  ? `Contano al massimo ${max} partite per coppia.`
                  : nextIndex > max
                    ? `Hanno già giocato ${max} partite valide: questa va in esubero e non conta.`
                    : `Questa sarà la ${ORDINALS[nextIndex - 1] ?? `${nextIndex}ª`}: conta per la classifica.`}
              </span>
            </div>
          )}
        </section>

        {preview?.eval.counted && matchDate !== todayISO() && (
          <p className="dim small">Partita in data passata: tutta la classifica verrà ricalcolata da quel giorno.</p>
        )}

        <div className="save-row">
          <label className="field-stack grow">
            <span className="label">Note</span>
            <input className="note-input" placeholder="Facoltative" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <button className={`btn btn-red btn-save ${tourMode ? 'tour' : ''}`} disabled={!canSave} onClick={save}>
            {tourMode ? 'Salva e continua' : 'Salva partita'} <span className="kbd">Invio</span>
          </button>
        </div>
      </div>

      <aside className="entry-aside">
        <div className="aside-head">
          <h2>{asideTitle}</h2>
          <span className="mono dim small">
            {asideResults.length} {asideResults.length === 1 ? 'partita' : 'partite'}
          </span>
        </div>
        {asideResults.length === 0 ? (
          <p className="dim small">{tourMode ? 'Ancora nessuna partita in questo torneo.' : 'Ancora nessuna partita in questa data.'}</p>
        ) : (
          <table className="day-list">
            <tbody>
              {asideResults.map((r) => {
                const m = r.match
                const aw = m.setsA > m.setsB
                return (
                  <tr
                    key={m.id}
                    className={`${r.eval.counted ? '' : 'excluded'} ${m.tournamentId ? 'tour' : ''}`}
                    title={[stageLabel(tour, m.stage), m.setScores?.map(([x, y]) => `${x}-${y}`).join(' ')].filter(Boolean).join(' · ') || undefined}
                  >
                    <td className={aw ? 'strong' : 'dim'}>{surname(m.playerA)}</td>
                    <td className="day-score">
                      {m.setsA}–{m.setsB}
                    </td>
                    <td className={!aw ? 'strong' : 'dim'}>{surname(m.playerB)}</td>
                    <td className="mono small right">{r.eval.counted ? `±${Math.abs(r.deltaA).toFixed(1).replace('.', ',')}` : <span className="neg">non conta</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!tourMode && asideResults.some((r) => r.match.tournamentId) && (
          <p className="legend">
            <span className="legend-swatch tour" /> partite di torneo
          </p>
        )}
        {asideResults.some((r) => r.eval.kind === 'cap') && (
          <p className="dim small">Le partite oltre le {max} valide per coppia restano registrate come esubero ma non assegnano punti.</p>
        )}
      </aside>
    </div>
  )
}
