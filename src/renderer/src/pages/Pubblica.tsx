import { useEffect, useMemo, useRef, useState } from 'react'
import { daysBetween, formatLongDate, todayISO, tournamentLabel, tournamentText, whatsappText } from '@core/format'
import { deleteSnapshot, publishSnapshot } from '@core/mutations'
import { tournamentSummary } from '@core/tournament'
import { useStore } from '../store'
import { Confirm, Empty, PageHead } from '../components/ui'
import {
  CARD_WIDTH,
  TOURNAMENT_CSS,
  copyPng,
  copyTournamentPng,
  copyTournamentText,
  copyWhatsapp,
  rankingHtml,
  rankingStyle,
  saveCsv,
  savePdf,
  savePng,
  saveTournamentPdf,
  saveTournamentPng,
  saveXlsx,
  tournamentHtml
} from '../export'

export function PubblicaPage() {
  const { data, computed, update, toast } = useStore()
  const [what, setWhat] = useState<'classifica' | 'torneo'>('classifica')
  const tournaments = data.tournaments.filter((t) => !t.deleted).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
  const [tourId, setTourId] = useState(tournaments[0]?.id ?? '')
  // Se il torneo scelto viene eliminato, si passa al più recente.
  const tour = tournaments.find((t) => t.id === tourId) ?? tournaments[0]
  const summary = useMemo(() => (tour ? tournamentSummary(data, tour) : null), [data, tour])
  // Data fino a cui le partite entrano nella nuova classifica.
  const [cutoff, setCutoff] = useState(todayISO())
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
  }, [tab, what, summary])

  const last = computed.lastSnapshot
  const daysSince = last ? daysBetween(last.date, todayISO()) : null
  // Gli export mostrano sempre la classifica ufficiale, datata alla sua pubblicazione.
  const date = last?.date ?? todayISO()
  const entering = computed.results.filter((r) => r.pending && r.eval.counted && r.match.date <= cutoff).length
  const waiting = computed.pendingCount - entering
  const isTour = what === 'torneo'
  const html = useMemo(
    () => (isTour ? (summary ? tournamentHtml(data, summary) : '') : rankingHtml(data, computed, date)),
    [data, computed, date, isTour, summary]
  )
  const text = useMemo(
    () => (isTour ? (summary ? tournamentText(data, summary) : '') : whatsappText(data, computed, date)),
    [data, computed, date, isTour, summary]
  )
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
          isTour
            ? 'Riepilogo di un torneo: partecipanti, gironi, tabellone e risultati set per set.'
            : last
              ? `Ultima pubblicazione il ${formatLongDate(last.date)} (${daysSince === 0 ? 'oggi' : daysSince === 1 ? 'ieri' : `${daysSince} giorni fa`}). Si pubblica ogni ${data.settings.publishEveryDays} giorni.`
              : 'Nessuna classifica ancora pubblicata.'
        }
        actions={
          <>
            <div className="seg" role="group" aria-label="Cosa pubblicare">
              <button className={!isTour ? 'active' : ''} aria-pressed={!isTour} onClick={() => setWhat('classifica')}>
                Classifica
              </button>
              <button className={isTour ? 'active' : ''} aria-pressed={isTour} onClick={() => setWhat('torneo')}>
                Torneo
              </button>
            </div>
            {isTour ? (
              <label className="field-stack">
                <span className="label">Torneo</span>
                <select value={tour?.id ?? ''} onChange={(e) => setTourId(e.target.value)}>
                  {tournaments.length === 0 && <option value="">Nessun torneo</option>}
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tournamentLabel(t)}
                      {t.name ? ` · ${formatLongDate(t.date)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        }
      />

      {isTour && !summary ? (
        <Empty>Nessun torneo registrato. Creane uno da Nuova partita → Torneo.</Empty>
      ) : (
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
                <style>{isTour ? TOURNAMENT_CSS : rankingStyle()}</style>
                <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ) : (
              <pre className="wa-text">{text}</pre>
            )}
          </section>

          {isTour && summary ? (
            <aside className="publish-side">
              <section>
                <div className="section-head">
                  <h2>Esporta il torneo</h2>
                </div>
                <div className="export-grid">
                  <button
                    className="btn btn-red wide"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        't-png',
                        () => copyTournamentPng(data, summary),
                        () => 'Immagine copiata: incollala su WhatsApp'
                      )
                    }
                  >
                    Copia immagine per WhatsApp
                  </button>
                  <button
                    className="btn wide"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        't-wa',
                        () => copyTournamentText(data, summary),
                        () => 'Testo copiato negli appunti'
                      )
                    }
                  >
                    Copia testo WhatsApp
                  </button>
                  <button className="btn" disabled={!!busy} onClick={() => run('t-png-save', () => saveTournamentPng(data, summary), saved)}>
                    Salva PNG
                  </button>
                  <button className="btn" disabled={!!busy} onClick={() => run('t-pdf', () => saveTournamentPdf(data, summary), saved)}>
                    Salva PDF
                  </button>
                </div>
                {busy && <p className="dim small">Preparazione in corso…</p>}
              </section>
              <p className="dim small">
                Gironi e tabellone si impostano da Nuova partita → Torneo → “Imposta”. I punteggi dei set compaiono se sono stati inseriti.
              </p>
            </aside>
          ) : (
            <aside className="publish-side">
              <section>
                <div className="section-head">
                  <h2>1 · Nuova classifica</h2>
                </div>
                <p className="dim small">
                  {computed.pendingCount === 0
                    ? last
                      ? 'Nessuna partita nuova dall’ultima pubblicazione: la classifica è aggiornata.'
                      : 'Nessuna partita da mettere in classifica.'
                    : `${computed.pendingCount} ${computed.pendingCount === 1 ? 'partita aspetta' : 'partite aspettano'} di entrare in classifica. Pubblicando, i punti di tutti si aggiornano e restano fermi fino alla pubblicazione successiva; le partite inserite dopo entrano nella prossima.`}
                </p>
                <label className="field-stack">
                  <span className="label">Partite fino al</span>
                  <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value || todayISO())} />
                </label>
                <button className="btn btn-primary" disabled={entering === 0} onClick={() => setConfirmPublish(true)}>
                  Pubblica la classifica al {formatLongDate(cutoff)}
                </button>
                {waiting > 0 && entering > 0 && (
                  <p className="dim small">
                    {waiting} {waiting === 1 ? 'partita successiva resterà' : 'partite successive resteranno'} per la prossima pubblicazione.
                  </p>
                )}
              </section>

              <section>
                <div className="section-head">
                  <h2>2 · Esporta</h2>
                </div>
                <div className="export-grid">
                  <button
                    className="btn btn-red wide"
                    disabled={!!busy || !last}
                    onClick={() =>
                      run(
                        'png',
                        () => copyPng(data, computed, date),
                        () => 'Immagine copiata: incollala su WhatsApp'
                      )
                    }
                  >
                    Copia immagine per WhatsApp
                  </button>
                  <button
                    className="btn wide"
                    disabled={!!busy || !last}
                    onClick={() =>
                      run(
                        'wa',
                        () => copyWhatsapp(data, computed, date),
                        () => 'Testo copiato negli appunti'
                      )
                    }
                  >
                    Copia testo WhatsApp
                  </button>
                  <button className="btn" disabled={!!busy || !last} onClick={() => run('png-save', () => savePng(data, computed, date), saved)}>
                    Salva PNG
                  </button>
                  <button className="btn" disabled={!!busy || !last} onClick={() => run('pdf', () => savePdf(data, computed, date), saved)}>
                    Salva PDF
                  </button>
                  <button className="btn wide" disabled={!!busy || !last} onClick={() => run('xlsx', () => saveXlsx(data, computed, date), saved)}>
                    Excel (classifica e partite)
                  </button>
                  <button className="btn" disabled={!!busy || !last} onClick={() => run('csv', () => saveCsv(data, computed, date, 'classifica'), saved)}>
                    CSV classifica
                  </button>
                  <button className="btn" disabled={!!busy || !last} onClick={() => run('csv2', () => saveCsv(data, computed, date, 'partite'), saved)}>
                    CSV partite
                  </button>
                </div>
                {!last && <p className="dim small">Si esporta la classifica ufficiale: prima pubblicane una.</p>}
                {busy && <p className="dim small">Preparazione in corso…</p>}
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
          )}
        </div>
      )}

      {confirmPublish && (
        <Confirm
          title="Pubblicare la nuova classifica?"
          message={
            <p>
              {entering === 1 ? 'La partita giocata' : `Le ${entering} partite giocate`} fino al {formatLongDate(cutoff)} entrano in classifica e i punti
              di tutti si aggiornano. La classifica resta questa fino alla prossima pubblicazione.
            </p>
          }
          confirmLabel="Pubblica"
          onConfirm={() => update((d) => publishSnapshot(d, cutoff), 'pubblicazione', { history: false }) && toast('Nuova classifica pubblicata')}
          onClose={() => setConfirmPublish(false)}
        />
      )}
      {deleting && (
        <Confirm
          title="Eliminare questa pubblicazione?"
          message={<p>Le sue partite passano alla pubblicazione successiva (o tornano in attesa, se era l’ultima) e la classifica si ricalcola.</p>}
          confirmLabel="Elimina"
          danger
          onConfirm={() => update((d) => deleteSnapshot(d, deleting), 'eliminazione pubblicazione', { history: false })}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
