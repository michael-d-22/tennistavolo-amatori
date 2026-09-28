import { useState } from 'react'
import { formatDate, todayISO } from '@core/format'
import { addPlayer } from '@core/mutations'
import { useStore } from '../store'
import { Empty, PageHead } from '../components/ui'
import type { Navigate } from '../App'

export function GiocatoriPage({ navigate }: { navigate: Navigate }) {
  const { data, computed, update, toast } = useStore()
  const [name, setName] = useState('')
  const [joined, setJoined] = useState(todayISO())

  function add() {
    if (update((d) => addPlayer(d, name, joined), 'nuovo giocatore')) {
      toast(`${name.trim()} aggiunto a ${data.settings.startRating} punti`)
      setName('')
    }
  }

  const list = [...computed.standings].sort((a, b) => a.player.name.localeCompare(b.player.name, 'it'))

  return (
    <>
      <PageHead title="Giocatori" subtitle={`${list.filter((s) => s.player.status === 'active').length} attivi`} />

      <div className="card add-player">
        <input
          placeholder="Nome e cognome del nuovo giocatore"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()}
          autoFocus
        />
        <label className="field-inline">
          Ingresso
          <input type="date" value={joined} onChange={(e) => setJoined(e.target.value || todayISO())} />
        </label>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={add}>
          Aggiungi
        </button>
        <span className="muted small">Ogni nuovo giocatore parte da {data.settings.startRating} punti.</span>
      </div>

      {list.length === 0 ? (
        <Empty>Nessun giocatore.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Ingresso</th>
                <th className="num">Punti</th>
                <th className="num">Partite valide</th>
                <th className="num">Escluse</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.player.id} className="clickable" onClick={() => navigate({ page: 'giocatore', id: s.player.id })}>
                  <td className="name-cell">{s.player.name}</td>
                  <td className="small">{formatDate(s.player.joinedAt)}</td>
                  <td className="num">{Math.round(s.rating)}</td>
                  <td className="num">{s.played}</td>
                  <td className="num">{s.excludedMatches || ''}</td>
                  <td>
                    {s.player.status === 'retired' ? (
                      <span className="chip chip-grey">ritirato{s.player.retiredAt ? ` dal ${formatDate(s.player.retiredAt)}` : ''}</span>
                    ) : (
                      <span className="chip chip-ok">attivo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
