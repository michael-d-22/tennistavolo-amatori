import { useEffect, useMemo, useRef, useState } from 'react'
import { daysBetween, formatLongDate, todayISO, whatsappText } from '@core/format'
import { deleteSnapshot, publishSnapshot } from '@core/mutations'
import { useStore } from '../store'
import { Confirm, PageHead } from '../components/ui'
import { CARD_WIDTH, copyPng, copyWhatsapp, rankingHtml, rankingStyle, saveCsv, savePdf, savePng, saveXlsx } from '../export'

export function PubblicaPage() {
  const { data, computed, update, toast } = useStore()
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'grafica' | 'testo'>('grafica')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // La grafica è larga 1080px: in anteprima la rimpiccioliamo per farla stare nel riquadro.
  const previewRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.5)
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setZoom(Math.min(1, el.clientWidth / CARD_WIDTH)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab])

  const last = computed.lastSnapshot
  const daysSince = last ? daysBetween(last.date, todayISO()) : null
  const html = useMemo(() => rankingHtml(data, computed, date), [data, computed, date])
  const text = useMemo(() => whatsappText(data, computed, date), [data, computed, date])
  const snapshots = data.snapshots.filter((s) => !s.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))

  async function run(label: string, fn: () => Promise<unknown>, done: (r: unknown) => string | null) {
    setBusy(label)
    try {
      const r = await fn()
      const msg = done(r)
      if (msg) toast(msg)
    } catch (e) {
      toast(`Errore: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(null)
    }
  }
  const saved = (r: unknown) => (r ? `Salvato: ${r}` : null)

  return (
    <>
      <PageHead
        title="Pubblica"
        subtitle={
          last
            ? `Ultima pubblicazione il ${formatLongDate(last.date)} (${daysSince === 0 ? 'oggi' : daysSince === 1 ? 'ieri' : `${daysSince} giorni fa`}). Si pubblica ogni ${data.settings.publishEveryDays} giorni.`
            : 'Nessuna classifica ancora pubblicata.'
        }
        actions={
          <label className="field-stack">
            <span className="label">Data classifica</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
          </label>
        }
      />

      <div className="publish-layout">
        <section>
          <div className="section-head">
            <div className="seg" role="group" aria-label="Anteprima">
              <button className={tab === 'grafica' ? 'active' : ''} aria-pressed={tab === 'grafica'} onClick={() => setTab('grafica')}>
                Immagine
              </button>
              <button className={tab === 'testo' ? 'active' : ''} aria-pressed={tab === 'testo'} onClick={() => setTab('testo')}>
                Testo WhatsApp
              </button>
            </div>
            <span className="mono dim small">Così la vedono nel gruppo</span>
          </div>
          {tab === 'grafica' ? (
            <div className="ranking-preview" ref={previewRef}>
              <style>{rankingStyle()}</style>
              <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : (
            <pre className="wa-text">{text}</pre>
          )}
        </section>

        <aside className="publish-side">
          <section>
            <div className="section-head">
              <h2>1 · Esporta</h2>
            </div>
            <div className="export-grid">
              <button className="btn btn-red wide" disabled={!!busy} onClick={() => run('png', () => copyPng(data, computed, date), () => 'Immagine copiata: incollala su WhatsApp')}>
                Copia immagine per WhatsApp
              </button>
              <button className="btn wide" disabled={!!busy} onClick={() => run('wa', () => copyWhatsapp(data, computed, date), () => 'Testo copiato negli appunti')}>
                Copia testo WhatsApp
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('png-save', () => savePng(data, computed, date), saved)}>
                Salva PNG
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('pdf', () => savePdf(data, computed, date), saved)}>
                Salva PDF
              </button>
              <button className="btn wide" disabled={!!busy} onClick={() => run('xlsx', () => saveXlsx(data, computed, date), saved)}>
                Excel (classifica e partite)
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('csv', () => saveCsv(data, computed, date, 'classifica'), saved)}>
                CSV classifica
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('csv2', () => saveCsv(data, computed, date, 'partite'), saved)}>
                CSV partite
              </button>
            </div>
            {busy && <p className="dim small">Preparazione in corso…</p>}
          </section>

          <section>
            <div className="section-head">
              <h2>2 · Segna pubblicata</h2>
            </div>
            <p className="dim small">
              Fissa la classifica di questa data: da qui in poi frecce e variazioni si calcolano rispetto a questa pubblicazione. Fallo
              dopo aver esportato.
            </p>
            <button className="btn btn-primary" onClick={() => setConfirmPublish(true)}>
              Segna pubblicata al {formatLongDate(date)}
            </button>
          </section>

          {snapshots.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Pubblicazioni</h2>
              </div>
              <table className="table compact">
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id}>
                      <td>{formatLongDate(s.date)}</td>
                      <td className="dim small">Primo: {s.rows.find((r) => r.position === 1)?.name ?? '—'}</td>
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(s.id)}>
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </aside>
      </div>

      {confirmPublish && (
        <Confirm
          title="Segnare la classifica come pubblicata?"
          message={<p>La classifica attuale verrà salvata con data {formatLongDate(date)} e diventerà il riferimento per le prossime variazioni.</p>}
          confirmLabel="Segna pubblicata"
          onConfirm={() => update((d) => publishSnapshot(d, computed, date), 'pubblicazione', { history: false }) && toast('Classifica segnata come pubblicata')}
          onClose={() => setConfirmPublish(false)}
        />
      )}
      {deleting && (
        <Confirm
          title="Eliminare questa pubblicazione?"
          message={<p>Le variazioni verranno calcolate rispetto alla pubblicazione precedente.</p>}
          confirmLabel="Elimina"
          danger
          onConfirm={() => update((d) => deleteSnapshot(d, deleting), 'eliminazione pubblicazione', { history: false })}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
