import { useState } from 'react'
import { todayISO } from '@core/format'
import { addPlayer, updateMeta } from '@core/mutations'
import { parseDataFile } from '@core/sync'
import { useStore } from '../store'

/** Prima apertura: nome stagione e lista iniziale dei giocatori (uno per riga). */
export function BenvenutoPage() {
  const { data, update, replaceAll, toast } = useStore()
  const [seasonName, setSeasonName] = useState(data.season.name)
  const [names, setNames] = useState('')
  const list = names
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean)

  function start() {
    update((d) => {
      let next = updateMeta(d, { ...d.season, name: seasonName.trim() || d.season.name }, d.settings)
      for (const n of list) next = addPlayer(next, n, todayISO())
      return next
    }, 'configurazione iniziale')
  }

  async function importFile() {
    try {
      const txt = await window.api.openFile({ filters: [{ name: 'Dati Amatori', extensions: ['amat', 'json'] }] })
      if (txt) replaceAll(parseDataFile(JSON.parse(txt)), 'importazione')
    } catch (e) {
      toast(`Impossibile leggere il file: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-ball">🏓</div>
        <h1>Benvenuto in Amatori</h1>
        <p className="muted">
          Classifica interna con sistema Elo (K {data.settings.k}, partenza {data.settings.startRating} punti). Le regole della stagione
          si possono modificare in qualsiasi momento da Impostazioni.
        </p>
        <label className="block">
          Nome della stagione
          <input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} />
        </label>
        <label className="block">
          Giocatori del gruppo (uno per riga)
          <textarea rows={8} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Mario Rossi\nLuca Bianchi\n…'} autoFocus />
        </label>
        <div className="row-end">
          <button className="btn btn-ghost" onClick={importFile}>
            Ho già un file dati…
          </button>
          <button className="btn btn-primary btn-lg" disabled={list.length < 2} onClick={start}>
            Inizia con {list.length} giocatori
          </button>
        </div>
      </div>
    </div>
  )
}
