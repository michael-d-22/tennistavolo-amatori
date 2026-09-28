import { useMemo, useState } from 'react'
import { fmtDelta, formatLongDate, todayISO } from '@core/format'
import { addMatch } from '@core/mutations'
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

const ORDINALS = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava']

export function NuovaPartitaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [score, setScore] = useState<[number, number] | null>(null)
  const [note, setNote] = useState('')

  const players = data.players
    .filter((p) => !p.deleted && p.status === 'active')
    .sort((x, y) => x.name.localeCompare(y.name, 'it'))
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const ratingOf = (id: string) => computed.standings.find((s) => s.player.id === id)?.rating ?? data.settings.startRating
  const { maxMatchesPerPair: max, minMatchesPerPair: min } = data.settings

  const preview = useMemo(() => {
    if (!a || !b || a === b || !score) return null
    return previewMatch(data, { date, playerA: a, playerB: b, setsA: score[0], setsB: score[1] })
  }, [data, date, a, b, score])

  const pairCount = a && b && a !== b ? (computed.pairCounted.get(pairKey(a, b)) ?? 0) : null
  const canSave = a && b && a !== b && score
  const aWins = !!score && score[0] > score[1]
  const bWins = !!score && score[1] > score[0]

  function save() {
    if (!canSave) return
    const ok = update((d) => addMatch(d, { date, playerA: a, playerB: b, setsA: score![0], setsB: score![1], note }).data, 'nuova partita')
    if (!ok) return
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

  const dayResults = computed.results.filter((r) => r.match.date === date).reverse()
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

  const scoreGroup = (list: [number, number][], label: string) => (
    <div className="score-group">
      <span className="label">{label}</span>
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
    </div>
  )

  const deltaA = preview?.deltaA ?? 0
  const nextIndex = pairCount != null ? pairCount + 1 : 0

  return (
    <div className="entry-layout">
      <div className="entry-main">
        <PageHead
          title="Nuova partita"
          actions={
            <label className="field-stack">
              <span className="label">Data</span>
              <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
            </label>
          }
        />

        <section className="vs-row">
          {renderSelect(a, b, setA, 'Giocatore 1', aWins)}
          <div className="vs">VS</div>
          {renderSelect(b, a, setB, 'Giocatore 2', bWins)}
        </section>

        <section className="vs-row">
          {scoreGroup(WIN_A, 'Vince il giocatore 1')}
          <div />
          {scoreGroup(WIN_B, 'Vince il giocatore 2')}
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
                  ? `Hanno già giocato ${max} partite valide: questa non conta.`
                  : `Questa sarà la ${ORDINALS[nextIndex - 1] ?? `${nextIndex}ª`}: conta per la classifica.`}
            </span>
          </div>
        </section>

        {preview?.eval.counted && date !== todayISO() && (
          <p className="dim small">Partita in data passata: tutta la classifica verrà ricalcolata da quel giorno.</p>
        )}

        <div className="save-row">
          <label className="field-stack grow">
            <span className="label">Note</span>
            <input className="note-input" placeholder="Facoltative" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <button className="btn btn-red btn-save" disabled={!canSave} onClick={save}>
            Salva partita <span className="kbd">Invio</span>
          </button>
        </div>
      </div>

      <aside className="entry-aside">
        <div className="aside-head">
          <h2>{date === todayISO() ? 'Stasera' : formatLongDate(date)}</h2>
          <span className="mono dim small">
            {dayResults.length} {dayResults.length === 1 ? 'partita' : 'partite'}
          </span>
        </div>
        {dayResults.length === 0 ? (
          <p className="dim small">Ancora nessuna partita in questa data.</p>
        ) : (
          <table className="day-list">
            <tbody>
              {dayResults.map((r) => {
                const m = r.match
                const aw = m.setsA > m.setsB
                return (
                  <tr key={m.id} className={r.eval.counted ? '' : 'excluded'}>
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
        {dayResults.some((r) => r.eval.kind === 'cap') && (
          <p className="dim small">Le partite oltre le {max} valide per coppia restano registrate ma non assegnano punti.</p>
        )}
      </aside>
    </div>
  )
}
