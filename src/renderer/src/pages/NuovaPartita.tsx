import { useMemo, useState } from 'react'
import { formatDate, todayISO } from '@core/format'
import { addMatch } from '@core/mutations'
import { pairKey } from '@core/rules'
import { previewMatch } from '@core/standings'
import { useStore } from '../store'
import { Empty, PageHead } from '../components/ui'
import type { Navigate } from '../App'

const SCORES: [number, number][] = [
  [3, 0],
  [3, 1],
  [3, 2],
  [2, 3],
  [1, 3],
  [0, 3]
]

export function NuovaPartitaPage({ navigate }: { navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [score, setScore] = useState<[number, number] | null>(null)
  const [note, setNote] = useState('')
  const [sessionIds, setSessionIds] = useState<string[]>([])

  const players = data.players
    .filter((p) => !p.deleted && p.status === 'active')
    .sort((x, y) => x.name.localeCompare(y.name, 'it'))
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const ratingOf = (id: string) => computed.standings.find((s) => s.player.id === id)?.rating ?? data.settings.startRating

  const preview = useMemo(() => {
    if (!a || !b || a === b || !score) return null
    return previewMatch(data, { date, playerA: a, playerB: b, setsA: score[0], setsB: score[1] })
  }, [data, date, a, b, score])

  const pairCount = a && b && a !== b ? (computed.pairCounted.get(pairKey(a, b)) ?? 0) : null
  const canSave = a && b && a !== b && score

  function save() {
    if (!canSave) return
    let newId = ''
    const ok = update((d) => {
      const r = addMatch(d, { date, playerA: a, playerB: b, setsA: score![0], setsB: score![1], note })
      newId = r.id
      return r.data
    }, 'nuova partita')
    if (!ok) return
    const winner = score![0] > score![1] ? a : b
    toast(`Salvata: vince ${nameOf(winner)} ${Math.max(...score!)}-${Math.min(...score!)}`)
    setSessionIds((s) => [newId, ...s])
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

  const PlayerPicker = ({ value, other, onPick, label }: { value: string; other: string; onPick: (id: string) => void; label: string }) => (
    <div className="picker">
      <div className="picker-label">{label}</div>
      <div className="picker-grid">
        {players.map((p) => (
          <button
            key={p.id}
            className={`pick ${value === p.id ? 'selected' : ''}`}
            disabled={p.id === other}
            onClick={() => onPick(value === p.id ? '' : p.id)}
          >
            <span>{p.name}</span>
            <small>{Math.round(ratingOf(p.id))}</small>
          </button>
        ))}
      </div>
    </div>
  )

  const deltaA = preview?.deltaA ?? 0
  const sessionResults = sessionIds.map((id) => computed.resultById.get(id)).filter((r) => r != null)

  return (
    <>
      <PageHead
        title="Nuova partita"
        subtitle="Seleziona i due giocatori e il risultato in set (al meglio dei 5)."
        actions={
          <label className="field-inline">
            Data
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
          </label>
        }
      />

      <div className="match-entry">
        <PlayerPicker label="Giocatore 1" value={a} other={b} onPick={setA} />
        <div className="versus">
          <div className="vs-names">
            <span className={score && score[0] > score[1] ? 'winner' : ''}>{a ? nameOf(a) : '—'}</span>
            <span className="vs">vs</span>
            <span className={score && score[1] > score[0] ? 'winner' : ''}>{b ? nameOf(b) : '—'}</span>
          </div>
          <div className="score-grid">
            {SCORES.map(([x, y]) => (
              <button
                key={`${x}${y}`}
                className={`score-btn ${score && score[0] === x && score[1] === y ? 'selected' : ''} ${x > y ? 'score-a' : 'score-b'}`}
                onClick={() => setScore([x, y])}
              >
                {x} – {y}
              </button>
            ))}
          </div>
          <input
            className="note-input"
            placeholder="Note (facoltative)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />

          {pairCount != null && (
            <div className="muted small center">
              Partite valide già giocate tra loro: <strong>{pairCount}</strong> / {data.settings.maxMatchesPerPair}
            </div>
          )}

          {preview && (
            <div className={`preview ${preview.eval.counted ? '' : 'preview-warn'}`}>
              {preview.eval.counted ? (
                <>
                  <div>
                    {nameOf(a)} <strong className={deltaA >= 0 ? 'pos' : 'neg'}>{deltaA >= 0 ? '+' : ''}{deltaA.toFixed(1)}</strong>
                    <span className="muted"> → {Math.round(preview.ratingA + deltaA)}</span>
                  </div>
                  <div>
                    {nameOf(b)} <strong className={-deltaA >= 0 ? 'pos' : 'neg'}>{-deltaA >= 0 ? '+' : ''}{(-deltaA).toFixed(1)}</strong>
                    <span className="muted"> → {Math.round(preview.ratingB - deltaA)}</span>
                  </div>
                  {date !== todayISO() && <div className="muted small">Partita inserita in data passata: la classifica verrà ricalcolata.</div>}
                </>
              ) : (
                <>⚠️ Questa partita verrà registrata ma <strong>non conterà</strong> per la classifica: {preview.eval.reason}.</>
              )}
            </div>
          )}

          <button className="btn btn-primary btn-lg" disabled={!canSave} onClick={save}>
            Salva partita
          </button>
        </div>
        <PlayerPicker label="Giocatore 2" value={b} other={a} onPick={setB} />
      </div>

      {sessionResults.length > 0 && (
        <div className="card mt">
          <h3 className="card-title">Inserite in questa sessione</h3>
          <table className="table">
            <tbody>
              {sessionResults.map((r) => (
                <tr key={r.match.id}>
                  <td className="small muted">{formatDate(r.match.date)}</td>
                  <td className={r.match.setsA > r.match.setsB ? 'winner' : ''}>{nameOf(r.match.playerA)}</td>
                  <td className="num">
                    {r.match.setsA}-{r.match.setsB}
                  </td>
                  <td className={r.match.setsB > r.match.setsA ? 'winner' : ''}>{nameOf(r.match.playerB)}</td>
                  <td className="num small">{r.eval.counted ? `±${Math.abs(r.deltaA).toFixed(1)}` : <span className="chip chip-bad">non conta</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
