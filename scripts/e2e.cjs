// Prova completa dell'interfaccia, come la userebbe il responsabile: apre l'app compilata su dati di prova,
// clicca pulsanti e menu, e alla fine controlla il file dati e i file esportati.
// Uso: npm run e2e   (esce con codice 1 se qualcosa non va)
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-e2e-'))
const outDir = path.join(dataDir, 'export')
fs.mkdirSync(outDir)
process.env.AMATORI_DATA_DIR = dataDir

// 8 giocatori, nessuna partita.
const t0 = '2026-09-28T18:00:00.000Z'
const names = ['Matteo Bianchi', 'Luca Ferri', 'Marco Sala', 'Giulia Riva', 'Paolo Conti', 'Sara Galli', 'Andrea Neri', 'Davide Colombo']
fs.writeFileSync(
  path.join(dataDir, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    season: { name: 'Stagione 2026-2027', startDate: '2026-09-28', endDate: '2027-06-30' },
    settings: { startRating: 1200, k: 32, tournamentK: 48, maxMatchesPerPair: 8, minMatchesPerPair: 2, publishEveryDays: 14 },
    metaUpdatedAt: t0,
    players: names.map((name, i) => ({ id: `p${i}`, name, joinedAt: '2026-09-28', status: 'active', createdAt: t0, updatedAt: t0 })),
    matches: [],
    tournaments: [],
    snapshots: []
  })
)
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(outDir, path.basename(o.defaultPath)) })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
let checks = 0
function check(ok, what) {
  checks++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`)
  if (!ok) failures.push(what)
}
const readData = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'))
const live = (d) => d.matches.filter((m) => !m.deleted)

let hooked = false
app.on('browser-window-created', (_e, win) => {
  if (hooked) return
  hooked = true
  win.webContents.setBackgroundThrottling(false)
  win.webContents.once('did-finish-load', async () => {
    const js = (s) => win.webContents.executeJavaScript(`(async () => { ${s} })()`)
    // Aiuti per "usare" l'interfaccia come un utente.
    await js(`
      window.__t = {
        byText(sel, text) {
          const all = [...document.querySelectorAll(sel)]
          const t = (e) => e.textContent.trim()
          // Prima il testo esatto, poi "testo + contatore" (es. "Finale 0/1"), infine l'inizio del testo.
          const isCount = (s) => s.split('/').length === 2 && s.split('/').every((x) => x !== '' && [...x].every((c) => '0123456789'.includes(c)))
          const counted = (e) => t(e).startsWith(text + ' ') && isCount(t(e).slice(text.length + 1))
          return all.find((e) => t(e) === text) ?? all.find(counted) ?? all.find((e) => t(e).startsWith(text))
        },
        click(sel, text) {
          const el = text === undefined ? document.querySelector(sel) : this.byText(sel, text)
          if (!el) throw new Error('Non trovato: ' + sel + ' ' + (text ?? ''))
          if (el.disabled) throw new Error('Disabilitato: ' + sel + ' ' + (text ?? ''))
          el.click()
        },
        select(el, value) {
          if (typeof el === 'string') el = document.querySelector(el)
          el.value = value
          el.dispatchEvent(new Event('change', { bubbles: true }))
        },
        type(el, value) {
          if (typeof el === 'string') el = document.querySelector(el)
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(el, value)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        },
        toasts: () => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '),
        errors: () => [...document.querySelectorAll('.toast-error')].map((t) => t.textContent).join(' | ')
      }
    `)
    const page = async (p) => {
      await js(`document.querySelector('[data-page="${p}"]').click()`)
      await wait(250)
    }
    const idle = async () => {
      await wait(300)
      for (let i = 0; i < 120 && (await js(`return document.body.innerText.includes('Preparazione in corso')`)); i++) await wait(500)
    }
    try {
      await wait(800)

      // --- 1. Partita singola ---
      await page('nuova')
      await js(`
        const s = document.querySelectorAll('.player-select select')
        __t.select(s[0], 'p0'); await new Promise(r => setTimeout(r, 50)); __t.select(s[1], 'p1')
      `)
      await wait(100)
      await js(`__t.click('.score-btn', '3–1')`)
      await wait(100)
      await js(`__t.click('.btn-save')`)
      await wait(400)
      let d = readData()
      check(live(d).length === 1 && live(d)[0].setsA === 3 && live(d)[0].setsB === 1, 'partita singola salvata')

      // --- 2. Creazione torneo: due gironi da 4, tabellone dalle semifinali con finale 3º posto ---
      await js(`__t.click('.page-actions .seg button', 'Torneo')`)
      await wait(200)
      await js(`__t.click('.tour-bar button', 'Nuovo torneo')`)
      await wait(300)
      await js(`__t.type('.modal input', 'Coppa di prova')`)
      await js(`__t.click('.modal .seg button', 'Più gironi + tabellone')`)
      await wait(200)
      // Primi quattro nel girone A, gli altri nel B.
      await js(`
        const rows = [...document.querySelectorAll('.group-assign-row')]
        for (const r of rows) {
          const name = r.querySelector('span').textContent
          const i = ${JSON.stringify(names)}.indexOf(name)
          const btn = [...r.querySelectorAll('button')].find(b => b.textContent === (i < 4 ? 'A' : 'B'))
          btn.click()
          await new Promise(res => setTimeout(res, 20))
        }
      `)
      await wait(200)
      await js(`
        const sel = [...document.querySelectorAll('.modal select')].find(s => [...s.options].some(o => o.textContent.startsWith('Semifinali')))
        __t.select(sel, '2')
      `)
      await wait(150)
      await js(`[...document.querySelectorAll('.modal label.check')].find(l => l.textContent.includes('3º'))?.querySelector('input').click()`)
      await wait(150)
      await js(`__t.click('.modal .btn-primary', 'Crea torneo')`)
      await wait(400)
      d = readData()
      const tour = d.tournaments[0]
      check(!!tour && tour.name === 'Coppa di prova' && tour.format === 'groups-bracket', 'torneo creato con il suo nome e formato')
      check(tour?.groups?.length === 2 && tour.groups.every((g) => g.players.length === 4), 'due gironi da 4 giocatori')
      check(tour?.bracketRounds === 2 && tour.thirdPlace === true, 'tabellone dalle semifinali con finale 3º posto')

      // --- 3. Gironi: si gioca cliccando le coppie "da giocare" finché non finiscono ---
      async function playAll(phase, maxGames) {
        await js(`__t.click('.stage-row .seg button', ${JSON.stringify(phase)})`)
        await wait(200)
        let n = 0
        for (; n < maxGames + 3; n++) {
          const has = await js(`return !!document.querySelector('.pair-chip')`)
          if (!has) break
          await js(`document.querySelector('.pair-chip').click()`)
          await wait(80)
          await js(`__t.click('.score-btn', ${n % 2 ? "'3–2'" : "'2–3'"})`)
          await wait(80)
          await js(`__t.click('.btn-save')`)
          await wait(250)
        }
        return n
      }
      const playedA = await playAll('Girone A', 6)
      check(playedA === 6, `girone A: 6 partite giocate, poi niente altro da giocare (giocate ${playedA})`)
      // Dopo il girone A le coppie non si possono ripetere: nei menu sono disabilitate.
      const dupBlocked = await js(`
        const s = document.querySelectorAll('.player-select select')
        __t.select(s[0], 'p0')
        await new Promise(r => setTimeout(r, 80))
        const opts = [...document.querySelectorAll('.player-select select')[1].options].filter(o => ['p1','p2','p3'].includes(o.value))
        return opts.length === 3 && opts.every(o => o.disabled)
      `)
      check(dupBlocked, 'nel girone completo gli avversari già affrontati non si possono scegliere')
      check((await js(`return document.querySelector('.btn-save').disabled`)) === true, 'salvataggio impossibile senza una coppia valida')
      d = readData()
      check(!d.tournaments[0].drawAuto && d.tournaments[0].draw.every((p) => p === null), 'tabellone ancora vuoto a gironi non finiti')
      const playedB = await playAll('Girone B', 6)
      check(playedB === 6, `girone B: 6 partite giocate (giocate ${playedB})`)
      await wait(500)
      d = readData()
      const t2 = d.tournaments[0]
      check(t2.drawAuto === true && t2.draw.every((p) => p && p !== 'X'), 'a gironi finiti il tabellone si compone da solo')
      const groupOf = (p) => t2.groups.findIndex((g) => g.players.includes(p))
      check(groupOf(t2.draw[0]) !== groupOf(t2.draw[1]) && groupOf(t2.draw[2]) !== groupOf(t2.draw[3]), 'semifinali incrociate tra i gironi')
      check((await js(`return __t.toasts()`)).includes('tabellone composto'), 'avviso "tabellone composto"')

      // --- 4. Tabellone: semifinali, finale 3º posto, finale ---
      const semis = await playAll('Semifinale', 2)
      check(semis === 2, `semifinali: 2 partite, non una di più (giocate ${semis})`)
      const third = await playAll('Finale 3º posto', 1)
      const final = await playAll('Finale', 1)
      check(third === 1 && final === 1, 'finale 3º posto e finale: una sola partita ciascuna')
      d = readData()
      const tm = live(d).filter((m) => m.tournamentId === t2.id)
      check(tm.length === 16, `16 partite di torneo in tutto (sono ${tm.length})`)
      check(
        tm.filter((m) => m.stage?.type === 'bracket').every((m) => Number.isInteger(m.stage.slot)),
        'ogni partita del tabellone ha il suo posto'
      )
      check(tm.every((m) => m.date === t2.date), 'tutte le partite hanno la data del torneo')
      check(!(await js(`return __t.errors()`)), 'nessun messaggio di errore durante il torneo')

      // --- 5. Pubblicazione del torneo ---
      await page('pubblica')
      await js(`__t.click('.page-actions .seg button', 'Torneo')`)
      await wait(500)
      const preview = await js(`return document.querySelector('.ranking-preview')?.innerText ?? ''`)
      check(preview.includes('COPPA') && preview.includes('TABELLONE') && preview.includes('GIRONE A'), 'anteprima del riepilogo torneo')
      for (const label of ['Salva PNG', 'Salva PDF']) {
        await js(`__t.click('.export-grid button', ${JSON.stringify(label)})`)
        await idle()
      }
      await wait(500)
      const files = fs.readdirSync(outDir)
      check(files.some((f) => f.startsWith('coppa-di-prova') && f.endsWith('.png')), 'PNG del torneo salvato')
      check(files.some((f) => f.startsWith('coppa-di-prova') && f.endsWith('.pdf')), 'PDF del torneo salvato')
      await js(`__t.click('.page-actions .seg button', 'Classifica')`)
      await wait(300)
      // Prima della pubblicazione la classifica è ferma: le partite aspettano.
      check(readData().snapshots.length === 0, 'nessuna classifica pubblicata')
      await js(`__t.click('.publish-side button', 'Pubblica la classifica')`)
      await wait(200)
      await js(`__t.click('.modal .btn-primary', 'Pubblica')`)
      await wait(400)
      d = readData()
      check(d.snapshots.length === 1 && d.snapshots[0].rows.some((r) => r.rating !== 1200), 'nuova classifica pubblicata con i punti aggiornati')
      for (const label of ['Salva PNG', 'Salva PDF', 'Excel', 'CSV classifica', 'CSV partite']) {
        await js(`__t.click('.export-grid button', ${JSON.stringify(label)})`)
        await idle()
      }
      await wait(500)
      const files2 = fs.readdirSync(outDir)
      for (const ext of ['png', 'pdf', 'xlsx']) check(files2.some((f) => f.startsWith('classifica-') && f.endsWith(ext)), `export classifica .${ext}`)
      check(files2.filter((f) => f.endsWith('.csv')).length === 2, 'export CSV classifica e partite')

      // --- 6. Una partita del tabellone non si elimina se il turno dopo è giocato ---
      await page('partite')
      const semiId = tm.find((m) => m.stage?.type === 'bracket' && m.stage.round === 2).id
      const before = live(readData()).length
      await js(`
        const rows = [...document.querySelectorAll('tr')].filter(r => r.innerText.includes('Semifinale'))
        rows[0].querySelector('button.danger').click()
      `)
      await wait(200)
      await js(`__t.click('.modal .btn-danger')`)
      await wait(300)
      check(live(readData()).length === before, 'eliminazione di una semifinale già seguita dalla finale rifiutata')
      check((await js(`return __t.errors()`)).includes('turno successivo'), 'con spiegazione del motivo')
      check(!!semiId, '(semifinale trovata)')

      // --- 7. Eliminazione del torneo intero e annulla ---
      await page('nuova')
      await js(`__t.click('.page-actions .seg button', 'Torneo')`)
      await wait(200)
      await js(`__t.select('.tour-bar select', ${JSON.stringify(t2.id)})`)
      await wait(200)
      await js(`__t.click('.tour-bar button', 'Imposta')`)
      await wait(300)
      await js(`__t.click('.modal-foot button', 'Elimina torneo')`)
      await wait(200)
      await js(`__t.click('.modal .btn-danger', 'Elimina torneo')`)
      await wait(400)
      d = readData()
      check(d.tournaments[0].deleted === true && live(d).filter((m) => m.tournamentId === t2.id).length === 0, 'torneo eliminato con tutte le sue partite')
      await page('pubblica')
      await js(`__t.click('.page-actions .seg button', 'Torneo')`)
      await wait(300)
      check((await js(`return document.body.innerText`)).includes('Nessun torneo registrato'), 'il torneo eliminato non compare più')
      await js(`document.querySelectorAll('.history-bar button')[0].click()`)
      await wait(200)
      await wait(400)
      d = readData()
      check(!d.tournaments[0].deleted && live(d).filter((m) => m.tournamentId === t2.id).length === 16, 'Annulla riporta torneo e partite')

      // --- 8. Giocatore inattivo: partite in pausa, riattivazione ---
      await page('classifica')
      await js(`[...document.querySelectorAll('.standings tbody tr')].find(r => r.innerText.includes('Matteo Bianchi')).click()`)
      await wait(300)
      await js(`__t.click('.page-actions button', 'Segna come inattivo')`)
      await wait(200)
      await js(`__t.click('.modal .btn-primary', 'Segna inattivo')`)
      await wait(300)
      check(readData().players.find((p) => p.id === 'p0').status === 'retired', 'giocatore segnato come inattivo')
      await page('partite')
      check((await js(`return document.body.innerText`)).toLowerCase().includes('in pausa'), 'le sue partite risultano in pausa')
      await page('classifica')
      await js(`[...document.querySelectorAll('.standings tbody tr')].find(r => r.innerText.includes('Matteo Bianchi')).click()`)
      await wait(300)
      await js(`__t.click('.page-actions button', 'Riattiva')`)
      await wait(300)
      check(readData().players.find((p) => p.id === 'p0').status === 'active', 'giocatore riattivato')

      // --- 9. Impostazioni assurde rifiutate ---
      await page('impostazioni')
      const k = [...(await js(`return [...document.querySelectorAll('.settings-grid label')].map(l => l.textContent)`))]
      check(k.some((t) => t.startsWith('Fattore K tornei')), 'campo "Fattore K tornei" presente')
      await js(`
        const input = [...document.querySelectorAll('.settings-grid label')].find(l => l.textContent.startsWith('Fattore K') && !l.textContent.includes('tornei')).querySelector('input')
        __t.type(input, '0')
      `)
      await wait(100)
      await js(`__t.click('.row-end .btn-primary', 'Salva')`)
      await wait(300)
      check(readData().settings.k === 32 && (await js(`return __t.errors()`)).includes('K'), 'K = 0 rifiutato con messaggio')

      // --- 10. Pagine principali senza errori ---
      for (const p of ['classifica', 'nuova', 'partite', 'matrice', 'giocatori', 'pubblica', 'impostazioni']) {
        await page(p)
        const h1 = await js(`return document.querySelector('h1')?.innerText ?? ''`)
        check(h1.length > 0, `pagina ${p} si apre (${h1})`)
      }
    } catch (e) {
      failures.push(String(e))
      console.error('ERRORE', e)
    } finally {
      console.log(`\n${checks - failures.length}/${checks} controlli superati${failures.length ? `\nFALLITI:\n - ${failures.join('\n - ')}` : ''}`)
      setTimeout(() => app.exit(failures.length ? 1 : 0), 200)
      try {
        fs.rmSync(dataDir, { recursive: true, force: true })
      } catch {
        // La cartella è ancora in uso da Electron: resta nei file temporanei.
      }
      app.exit(failures.length ? 1 : 0)
    }
  })
})

require(path.resolve(__dirname, '../out/main/index.js'))
