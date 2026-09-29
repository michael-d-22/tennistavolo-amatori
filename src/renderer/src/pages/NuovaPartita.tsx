import { useMemo, useState } from 'react'
import { fmtDelta, formatLongDate, todayISO, tournamentLabel } from '@core/format'
import { addMatch, addTournament, updateTournament } from '@core/mutations'
import type { Tournament } from '@core/types'
import { pairKey } from '@core/rules'
import { previewMatch } from '@core/standings'
import { useStore } from '../store'
import { Empty, Meter, PageHead } from '../components/ui'
import { IconChevron } from '../components/icons'
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

const TEMP_TOUR = '~torneo'

export function NuovaPartitaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [score, setScore] = useState<[number, number] | null>(null)
  const [note, setNote] = useState('')
  // Modalità torneo: tutte le partite del torneo si inseriscono di seguito con il K del torneo.
  const [tourMode, setTourMode] = useState(false)
  const [tourId, setTourId] = useState('') // '' = torneo nuovo, non ancora salvato
  const [tourName, setTourName] = useState('')
  const [tourK, setTourK] = useState(data.settings.tournamentK)

  const players = data.players
    .filter((p) => !p.deleted && p.status === 'active')
    .sort((x, y) => x.name.localeCompare(y.name, 'it'))
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const ratingOf = (id: string) => computed.standings.find((s) => s.player.id === id)?.rating ?? data.settings.startRating
  const { maxMatchesPerPair: max, minMatchesPerPair: min } = data.settings

  const tournaments = data.tournaments.filter((t) => !t.deleted).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
  const savedTour = tournaments.find((t) => t.id === tourId)
  // Torneo come sarà dopo il salvataggio (nome/data/K modificati si applicano con la prossima partita).
  const draftTour: Tournament | undefined = tourMode
    ? {
        id: tourId || TEMP_TOUR,
        date,
        name: tourName.trim() || undefined,
        k: tourK,
        createdAt: savedTour?.createdAt ?? '',
        updatedAt: savedTour?.updatedAt ?? ''
      }
    : undefined
  const tourChanged = !!savedTour && (savedTour.date !== date || (savedTour.name ?? '') !== tourName.trim() || savedTour.k !== tourK)

  function pickTournament(id: string) {
    setTourId(id)
    const t = tournaments.find((x) => x.id === id)
    setTourName(t?.name ?? '')
    setTourK(t?.k ?? data.settings.tournamentK)
    if (t) setDate(t.date)
  }

  function switchMode(tour: boolean) {
    setTourMode(tour)
    setScore(null)
    if (tour && !tourId) setTourK(data.settings.tournamentK)
    // Tornando alle partite singole non si resta per sbaglio sulla data del torneo.
    if (!tour && tourId) setDate(todayISO())
  }

  const preview = useMemo(() => {
    if (!a || !b || a === b || !score) return null
    return previewMatch(data, { date, playerA: a, playerB: b, setsA: score[0], setsB: score[1], tournamentId: draftTour?.id }, draftTour)
  }, [data, date, a, b, score, tourMode, tourId, tourName, tourK])

  const pairCount = a && b && a !== b ? (computed.pairCounted.get(pairKey(a, b)) ?? 0) : null
  const tourValid = !tourMode || tourK > 0
  const canSave = a && b && a !== b && score && tourValid
  const aWins = !!score && score[0] > score[1]
  const bWins = !!score && score[1] > score[0]

  function save() {
    if (!canSave) return
    let newTourId = tourId
    const ok = update((d) => {
      let next = d
      if (tourMode) {
        const draft = { date, name: tourName, k: tourK }
        if (!tourId) {
          const r = addTournament(next, draft)
          next = r.data
          newTourId = r.id
        } else if (tourChanged) {
          next = updateTournament(next, tourId, draft)
        }
      }
      const match = { date, playerA: a, playerB: b, setsA: score![0], setsB: score![1], note, tournamentId: tourMode ? newTourId : undefined }
      return addMatch(next, match).data
    }, tourMode ? 'partita di torneo' : 'nuova partita')
    if (!ok) return
    if (tourMode) setTourId(newTourId)
    const winner = aWins ? a : b
    toast(`Salvata: vince ${nameOf(winner)} ${Math.max(...score!)}–${Math.min(...score!)}`)
    setA('')
    setB('')
    setScore(null)
    setNote('')
  }

  if (players.length < 2) {
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
        <select value={value} onChange={(e) => onPick(e.target.value)}>
          <option value="">Scegli…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id} disabled={p.id === other}>
              {p.name} · {Math.round(ratingOf(p.id))}
            </option>
          ))}
        </select>
        <IconChevron />
      </span>
    </label>
  )

  const scoreButtons = (list: [number, number][], label: string) => (
    <div className="score-grid" role="group" aria-label={label}>
      {list.map(([x, y]) => {
        const on = !!score && score[0] === x && score[1] === y
        return (
          <button key={`${x}${y}`} className={`score-btn ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => setScore([x, y])}>
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
  const nextIndex = pairCount != null ? pairCount + 1 : 0

  const asideResults = tourMode
    ? computed.results.filter((r) => !!tourId && r.match.tournamentId === tourId).reverse()
    : computed.results.filter((r) => r.match.date === date).reverse()
  const asideTitle = draftTour ? tournamentLabel(draftTour) : date === todayISO() ? 'Stasera' : formatLongDate(date)

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
                <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
              </label>
            </>
          }
        />

        {tourMode && (
          <section className="tour-bar">
            <label className="field-stack">
              <span className="label">Torneo</span>
              <select value={tourId} onChange={(e) => pickTournament(e.target.value)}>
                <option value="">Nuovo torneo</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tournamentLabel(t)}
                    {t.name ? ` · ${formatLongDate(t.date)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span className="label">Nome (facoltativo)</span>
              <input value={tourName} placeholder={tournamentLabel({ date })} onChange={(e) => setTourName(e.target.value)} />
            </label>
            <label className="field-stack">
              <span className="label">Fattore K</span>
              <input type="number" min={1} value={tourK} onChange={(e) => setTourK(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <p className="tour-bar-note">
              {tourId
                ? tourChanged
                  ? 'Le modifiche a nome, data o K verranno applicate a tutto il torneo con la prossima partita salvata.'
                  : 'Le nuove partite si aggiungono a questo torneo.'
                : 'Il torneo viene creato con la prima partita salvata; poi inserisci le altre di seguito.'}{' '}
              Le partite di torneo usano questo K e non rientrano nel limite di {max} partite per coppia né nel minimo di {min}.
            </p>
          </section>
        )}

        <section className="vs-row">
          {renderSelect(a, b, setA, 'Giocatore 1', aWins)}
          <div className="vs">VS</div>
          {renderSelect(b, a, setB, 'Giocatore 2', bWins)}
        </section>

        <section className="vs-row">
          {scoreGroup(WIN_A, WIN_A3, 'Vince il giocatore 1')}
          <div />
          {scoreGroup(WIN_B, WIN_B3, 'Vince il giocatore 2')}
        </section>

        <section className={`preview-strip ${preview && !preview.eval.counted ? 'warn' : ''}`}>
          {preview && preview.eval.counted ? (
            <>
              <div className="preview-cell">
                <span className="label">{nameOf(a)}</span>
                <span className="preview-value">
                  <b className={deltaA < 0 ? 'neg' : ''}>{fmtDelta(deltaA, 1)}</b>
                  <span className="mono dim">
                    {Math.round(preview.ratingA)} → {Math.round(preview.ratingA + deltaA)}
                  </span>
                </span>
              </div>
              <div className="preview-cell">
                <span className="label">{nameOf(b)}</span>
                <span className="preview-value">
                  <b className={-deltaA < 0 ? 'neg' : ''}>{fmtDelta(-deltaA, 1)}</b>
                  <span className="mono dim">
                    {Math.round(preview.ratingB)} → {Math.round(preview.ratingB - deltaA)}
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
                <span className="label strong">K {tourK}</span>
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

        {preview?.eval.counted && date !== todayISO() && (
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
                  <tr key={m.id} className={`${r.eval.counted ? '' : 'excluded'} ${m.tournamentId ? 'tour' : ''}`}>
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
