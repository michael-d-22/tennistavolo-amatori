import { useEffect, useState } from 'react'
import { formatDate, todayISO } from '@core/format'
import { updateMeta } from '@core/mutations'
import { mergeData, parseDataFile, toExportFile, type MergeReport } from '@core/sync'
import type { AppData, Season, Settings } from '@core/types'
import { useStore } from '../store'
import { Confirm, Modal, PageHead } from '../components/ui'

export function ImpostazioniPage() {
  const { data, update, replaceAll, toast } = useStore()
  const [season, setSeason] = useState<Season>(data.season)
  const [settings, setSettings] = useState<Settings>(data.settings)
  const [backups, setBackups] = useState<{ name: string; size: number }[]>([])
  const [info, setInfo] = useState<{ version: string; dataDir: string } | null>(null)
  const [importing, setImporting] = useState<AppData | null>(null)
  const [restoring, setRestoring] = useState<{ name: string; data: AppData } | null>(null)

  const refreshBackups = () => window.api.listBackups().then(setBackups)
  useEffect(() => {
    refreshBackups()
    window.api.appInfo().then(setInfo)
  }, [])
  useEffect(() => {
    setSeason(data.season)
    setSettings(data.settings)
  }, [data.season, data.settings])

  const dirty = JSON.stringify(season) !== JSON.stringify(data.season) || JSON.stringify(settings) !== JSON.stringify(data.settings)
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings({ ...settings, [k]: Math.max(0, Number(e.target.value) || 0) })

  function saveMeta() {
    if (settings.minMatchesPerPair > settings.maxMatchesPerPair) {
      toast('La soglia minima non può superare il limite massimo', 'error')
      return
    }
    if (update((d) => updateMeta(d, season, settings), 'impostazioni')) toast('Impostazioni salvate, classifica ricalcolata')
  }

  async function exportAll() {
    const path = await window.api.saveFile({
      defaultName: `amatori-dati-${todayISO().replace(/-/g, '')}.amat`,
      filters: [{ name: 'Dati Amatori', extensions: ['amat', 'json'] }],
      content: JSON.stringify(toExportFile(data), null, 1)
    })
    if (path) toast(`Dati esportati in ${path}`)
  }

  async function importFile() {
    try {
      const txt = await window.api.openFile({ filters: [{ name: 'Dati Amatori', extensions: ['amat', 'json'] }] })
      if (!txt) return
      setImporting(parseDataFile(JSON.parse(txt)))
    } catch (e) {
      toast(`Impossibile leggere il file: ${(e as Error).message}`, 'error')
    }
  }

  async function pickBackup(name: string) {
    try {
      setRestoring({ name, data: parseDataFile(JSON.parse(await window.api.readBackup(name))) })
    } catch (e) {
      toast(`Backup non leggibile: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <>
      <PageHead title="Impostazioni e dati" />

      <div className="settings-grid">
        <div className="card">
          <h3 className="card-title">Stagione e regolamento</h3>
          <div className="form-grid">
            <label className="span2">
              Nome stagione
              <input value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} />
            </label>
            <label>
              Inizio
              <input type="date" value={season.startDate} onChange={(e) => setSeason({ ...season, startDate: e.target.value })} />
            </label>
            <label>
              Fine
              <input type="date" value={season.endDate} onChange={(e) => setSeason({ ...season, endDate: e.target.value })} />
            </label>
            <label>
              Punteggio di partenza
              <input type="number" value={settings.startRating} onChange={num('startRating')} />
            </label>
            <label>
              Fattore K
              <input type="number" value={settings.k} onChange={num('k')} />
            </label>
            <label>
              Max partite per coppia
              <input type="number" min={1} value={settings.maxMatchesPerPair} onChange={num('maxMatchesPerPair')} />
              <small className="muted">Le partite oltre questo numero non contano</small>
            </label>
            <label>
              Soglia qualificazione
              <input type="number" min={0} value={settings.minMatchesPerPair} onChange={num('minMatchesPerPair')} />
              <small className="muted">Partite minime con ciascun avversario</small>
            </label>
            <label>
              Pubblicazione ogni (giorni)
              <input type="number" min={1} value={settings.publishEveryDays} onChange={num('publishEveryDays')} />
            </label>
          </div>
          <div className="row-end">
            <button className="btn btn-ghost" disabled={!dirty} onClick={() => (setSeason(data.season), setSettings(data.settings))}>
              Annulla modifiche
            </button>
            <button className="btn btn-primary" disabled={!dirty} onClick={saveMeta}>
              Salva
            </button>
          </div>
        </div>

        <div>
          <div className="card">
            <h3 className="card-title">Esporta / importa dati</h3>
            <p className="muted small">
              Il file <strong>.amat</strong> contiene tutti i dati (giocatori, partite, pubblicazioni). Usalo per copiare i dati su un
              altro PC o, in futuro, sull'app Android. L'importazione <strong>unisce</strong> i dati: per ogni partita o giocatore
              vince la versione modificata più di recente, niente viene duplicato.
            </p>
            <div className="row">
              <button className="btn" onClick={exportAll}>
                ⬆️ Esporta tutti i dati
              </button>
              <button className="btn" onClick={importFile}>
                ⬇️ Importa / unisci da file
              </button>
            </div>
          </div>

          <div className="card mt">
            <h3 className="card-title">Backup</h3>
            <p className="muted small">
              L'app salva da sola una copia dei dati almeno ogni 10 minuti di utilizzo (ultime 30 copie).
            </p>
            <div className="row">
              <button
                className="btn"
                onClick={async () => {
                  const n = await window.api.createBackup()
                  toast(n ? `Backup creato: ${n}` : 'Nessun dato da salvare')
                  refreshBackups()
                }}
              >
                Crea backup ora
              </button>
              <button className="btn btn-ghost" onClick={() => window.api.openBackupFolder()}>
                Apri cartella
              </button>
            </div>
            {backups.length > 0 && (
              <div className="backup-list">
                {backups.slice(0, 12).map((b) => (
                  <div key={b.name} className="backup-item">
                    <span className="small">{backupLabel(b.name)}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => pickBackup(b.name)}>
                      Ripristina
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {info && (
            <p className="muted small mt">
              Amatori v{info.version} · dati in {info.dataDir}
            </p>
          )}
        </div>
      </div>

      {importing && <ImportModal incoming={importing} onClose={() => setImporting(null)} />}
      {restoring && (
        <Confirm
          title="Ripristinare questo backup?"
          message={
            <p>
              I dati attuali verranno sostituiti con quelli del {backupLabel(restoring.name)} ({restoring.data.players.filter((p) => !p.deleted).length}{' '}
              giocatori, {restoring.data.matches.filter((m) => !m.deleted).length} partite). Puoi comunque tornare indietro con “Annulla”.
            </p>
          }
          confirmLabel="Ripristina"
          danger
          onConfirm={() => {
            replaceAll(restoring.data, 'ripristino backup')
            toast('Backup ripristinato')
          }}
          onClose={() => setRestoring(null)}
        />
      )}
    </>
  )
}

function backupLabel(name: string) {
  const m = name.match(/data-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/)
  if (!m) return name
  return `${formatDate(m[1])} ore ${m[2]}:${m[3]}${name.includes('manuale') ? ' (manuale)' : ''}`
}

function ImportModal({ incoming, onClose }: { incoming: AppData; onClose: () => void }) {
  const { data, replaceAll, toast } = useStore()
  const { data: merged, report } = mergeData(data, incoming)
  const nothing = sum(report) === 0 && !report.settingsFromIncoming

  return (
    <Modal
      title="Importa dati"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button
            className="btn btn-primary"
            disabled={nothing}
            onClick={() => {
              replaceAll(merged, 'importazione')
              toast('Dati importati e uniti')
              onClose()
            }}
          >
            Unisci
          </button>
        </>
      }
    >
      {nothing ? (
        <p>Il file non contiene novità rispetto ai dati attuali.</p>
      ) : (
        <ul>
          <li>
            Giocatori: {report.players.added} nuovi, {report.players.updated} aggiornati
          </li>
          <li>
            Partite: {report.matches.added} nuove, {report.matches.updated} aggiornate
          </li>
          <li>
            Pubblicazioni: {report.snapshots.added} nuove, {report.snapshots.updated} aggiornate
          </li>
          {report.settingsFromIncoming && <li>Impostazioni della stagione prese dal file (più recenti)</li>}
        </ul>
      )}
    </Modal>
  )
}

function sum(r: MergeReport) {
  return r.players.added + r.players.updated + r.matches.added + r.matches.updated + r.snapshots.added + r.snapshots.updated
}
