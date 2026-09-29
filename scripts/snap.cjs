// Avvia l'app compilata con dati di prova e salva uno screenshot di ogni pagina.
// Uso: npm run build && npx electron scripts/snap.cjs <cartella-output>
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const outDir = path.resolve(process.argv[2] || 'snaps')
fs.mkdirSync(outDir, { recursive: true })
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-'))
process.env.AMATORI_DATA_DIR = dataDir

// --- dati di prova ---
let rnd = 7
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647)
const names = ['Matteo Bianchi', 'Luca Ferri', 'Marco Sala', 'Giulia Riva', 'Paolo Conti', 'Sara Galli', 'Andrea Neri', 'Davide Colombo']
const strength = [1.3, 1.1, 1.0, 0.95, 0.9, 0.8, 0.7, 0.6]
const t0 = '2026-09-28T18:00:00.000Z'
const players = names.map((n, i) => ({
  id: `p${i}`,
  name: n,
  joinedAt: '2026-09-28',
  status: i === 7 ? 'retired' : 'active',
  retiredAt: i === 7 ? '2026-10-20' : undefined,
  createdAt: t0,
  updatedAt: t0
}))
const dates = ['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26']
const matches = []
let k = 0
for (const d of dates) {
  for (let j = 0; j < 7; j++) {
    const a = Math.floor(rand() * 8)
    let b = Math.floor(rand() * 8)
    if (a === b) b = (b + 1) % 8
    if ((a === 7 || b === 7) && d > '2026-10-19') continue
    const pa = strength[a] / (strength[a] + strength[b])
    const aWon = rand() < pa
    const lose = Math.floor(rand() * 3)
    const t = new Date(Date.parse(d + 'T19:00:00Z') + k++ * 60000).toISOString()
    matches.push({ id: `m${k}`, date: d, playerA: `p${a}`, playerB: `p${b}`, setsA: aWon ? 3 : lose, setsB: aWon ? lose : 3, createdAt: t, updatedAt: t })
  }
}
// Coppia oltre il limite di 8
for (let i = 0; i < 9; i++) {
  const t = new Date(Date.parse('2026-10-01T19:00:00Z') + i * 60000).toISOString()
  matches.push({ id: `c${i}`, date: '2026-10-01', playerA: 'p0', playerB: 'p1', setsA: 3, setsB: i % 3, createdAt: t, updatedAt: t })
}
// Un torneo con K 48: due gironi, poi tabellone dalle semifinali con finale per il 3º posto.
const tournament = {
  id: 't1',
  date: '2026-10-24',
  name: "Torneo d'autunno",
  k: 48,
  format: 'groups-bracket',
  groups: [
    { id: 'gA', name: 'A', players: ['p0', 'p2', 'p4', 'p6'] },
    { id: 'gB', name: 'B', players: ['p1', 'p3', 'p5'] }
  ],
  bracketRounds: 3,
  draw: ['p0', 'X', 'p5', 'p2', 'p1', 'X', 'p3', 'p4'],
  thirdPlace: true,
  createdAt: t0,
  updatedAt: t0
}
const gA = { type: 'group', group: 'gA' }
const gB = { type: 'group', group: 'gB' }
const tourGames = [
  [0, 2, [[11, 7], [9, 11], [11, 5], [11, 8]], gA],
  [4, 6, [[11, 9], [11, 6], [12, 10]], gA],
  [0, 4, [[11, 4], [11, 8], [11, 9]], gA],
  [2, 6, [[8, 11], [11, 7], [11, 9], [7, 11], [11, 6]], gA],
  [0, 6, [[11, 3], [11, 5], [11, 7]], gA],
  [2, 4, [[11, 9], [5, 11], [11, 8], [11, 13], [11, 9]], gA],
  [1, 3, [[11, 6], [11, 8]], gB],
  [3, 5, [[11, 9], [8, 11], [11, 7]], gB],
  [1, 5, [[11, 5], [11, 9]], gB],
  [2, 5, [[11, 6], [11, 9], [11, 7]], { type: 'bracket', round: 3, slot: 1 }],
  [3, 4, [[11, 8], [9, 11], [11, 9], [11, 5]], { type: 'bracket', round: 3, slot: 3 }],
  [0, 2, [[11, 8], [11, 6], [9, 11], [11, 7]], { type: 'bracket', round: 2, slot: 0 }],
  [1, 3, [[11, 9], [13, 11], [11, 4]], { type: 'bracket', round: 2, slot: 1 }],
  [3, 2, [[11, 7], [11, 9], [11, 8]], { type: 'third' }],
  [0, 1, [[9, 11], [11, 6], [11, 9], [8, 11], [11, 7]], { type: 'bracket', round: 1, slot: 0 }]
]
tourGames.forEach(([a, b, sets, stage], i) => {
  const t = new Date(Date.parse('2026-10-24T16:00:00Z') + i * 60000).toISOString()
  const setsA = sets.filter(([x, y]) => x > y).length
  const setsB = sets.length - setsA
  matches.push({ id: `t${i}`, date: '2026-10-24', playerA: `p${a}`, playerB: `p${b}`, setsA, setsB, tournamentId: 't1', stage, setScores: sets, createdAt: t, updatedAt: t })
})
// Un secondo torneo ancora in corso (girone unico a 5, poi semifinali): per le schermate dell'inserimento.
const tournament2 = {
  id: 't2',
  date: '2026-10-28',
  name: 'Torneo di Halloween',
  k: 48,
  format: 'group-bracket',
  groups: [{ id: 'gH', name: 'A', players: ['p0', 'p1', 'p2', 'p3', 'p4'] }],
  bracketRounds: 2,
  thirdPlace: false,
  draw: [null, null, null, null],
  createdAt: t0,
  updatedAt: t0
}
;[
  [0, 4, [[11, 5], [11, 8], [11, 6]]],
  [1, 2, [[11, 9], [9, 11], [11, 7], [11, 8]]],
  [3, 4, [[7, 11], [11, 9], [11, 13], [11, 6], [11, 9]]],
  [0, 3, [[11, 7], [12, 10], [11, 4]]]
].forEach(([a, b, sets], i) => {
  const t = new Date(Date.parse('2026-10-28T16:00:00Z') + i * 60000).toISOString()
  const setsA = sets.filter(([x, y]) => x > y).length
  matches.push({ id: `h${i}`, date: '2026-10-28', playerA: `p${a}`, playerB: `p${b}`, setsA, setsB: sets.length - setsA, tournamentId: 't2', stage: { type: 'group', group: 'gH' }, setScores: sets, createdAt: t, updatedAt: t })
})
const data = {
  schemaVersion: 2,
  season: { name: 'Stagione 2026-2027', startDate: '2026-09-28', endDate: '2027-06-30' },
  settings: { startRating: 1200, k: 32, tournamentK: 48, maxMatchesPerPair: 8, minMatchesPerPair: 2, publishEveryDays: 14 },
  metaUpdatedAt: t0,
  players,
  matches: matches.filter((m) => m.date <= '2026-10-05'),
  tournaments: [tournament, tournament2],
  snapshots: []
}
fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(data))

const pages = [
  ['classifica', 1],
  ['nuova', 2],
  ['partite', 3],
  ['matrice', 4],
  ['giocatori', 5],
  ['pubblica', 6],
  ['impostazioni', 7]
]
// I dialoghi "Salva con nome" salvano direttamente nella cartella di output.
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(outDir, path.basename(o.defaultPath)) })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let hooked = false
app.on('browser-window-created', (_e, win) => {
  if (hooked) return
  hooked = true
  const [sw, sh] = (process.env.SNAP_SIZE || '1366x860').split('x').map(Number)
  win.setSize(sw, sh)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(800)
      const js = (s) => win.webContents.executeJavaScript(s)
      // Aspetta che l'export in corso finisca ("Preparazione in corso…" sparisce), al massimo 60 secondi.
      const idle = async () => {
        await wait(300)
        for (let i = 0; i < 120 && (await js(`document.body.innerText.includes('Preparazione in corso')`)); i++) await wait(500)
        await wait(300)
      }
      const shot = async (name) => {
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
      }
      // Pubblica una classifica, poi aggiungi altre partite per vedere le variazioni.
      await js(`document.querySelector('[data-page="pubblica"]').click()`)
      await wait(300)
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Segna pubblicata')).click()`)
      await wait(200)
      await js(`document.querySelector('.modal .btn-primary').click()`)
      await wait(800)
      // Aggiunge le partite successive alla pubblicazione e ricarica.
      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'))
      saved.matches.push(...matches.filter((m) => m.date > '2026-10-05'))
      // Un giocatore entrato dopo la pubblicazione: in classifica compare come "nuovo".
      saved.players.push({ id: 'p9', name: 'Chiara Bruno', joinedAt: '2026-10-20', status: 'active', createdAt: t0, updatedAt: t0 })
      fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(saved))
      win.webContents.reload()
      await new Promise((r) => win.webContents.once('did-finish-load', r))
      await wait(800)
      for (const [name, idx] of pages) {
        await js(`document.querySelector('[data-page="${name}"]').click()`)
        await wait(400)
        console.log('PAGE', name, await js(`document.querySelector('h1')?.innerText`))
        await shot(name)
      }
      // Tabella delle partite in esubero
      await js(`document.querySelector('[data-page="matrice"]').click()`)
      await wait(300)
      await js(`document.querySelectorAll('.matrix-section')[1].scrollIntoView()`)
      await wait(300)
      await shot('matrice-esubero')
      // Nuova partita con anteprima
      await js(`document.querySelector('[data-page="nuova"]').click()`)
      await wait(200)
      // Imposta i menu a tendina come farebbe l'utente (React ascolta l'evento "change").
      const pick = (i, optIndex) =>
        js(`(() => { const s = document.querySelectorAll('.player-select select')[${i}];
          s.value = s.options[${optIndex}].value; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
      await pick(0, 1)
      await wait(100)
      await pick(1, 4)
      await wait(100)
      await js(`document.querySelectorAll('.score-btn')[4].click()`)
      await wait(300)
      await shot('nuova-anteprima')
      // Modalità torneo con anteprima (K del torneo, risultati al meglio dei 3)
      await js(`[...document.querySelectorAll('.page-actions .seg button')].find(b=>b.textContent==='Torneo').click()`)
      await wait(200)
      await js(`(() => { const s = document.querySelector('.tour-bar select');
        s.value = 't2'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
      await wait(300)
      // Coppia dall'elenco "da giocare", risultato 3–1 e punteggi dei set.
      await js(`document.querySelectorAll('.pair-chip')[1].click()`)
      await wait(150)
      await js(`document.querySelectorAll('.score-btn')[1].click()`)
      await wait(200)
      await js(`(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        const vals = ['11', '8', '9', '11', '11', '6', '13', '11']
        document.querySelectorAll('.set-pair input').forEach((el, i) => { setter.call(el, vals[i]); el.dispatchEvent(new Event('input', { bubbles: true })) })
      })()`)
      await wait(1000)
      await shot('nuova-torneo')
      await js(`(() => { const s = document.querySelector('.tour-bar select');
        s.value = 't1'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
      await wait(300)
      // Finestra di impostazione con gli accoppiamenti del primo turno
      await js(`[...document.querySelectorAll('.tour-bar button')].find(b=>b.textContent==='Imposta').click()`)
      await wait(800)
      await shot('torneo-imposta-top')
      await js(`document.querySelector('.modal-body').scrollTop = 10000`)
      await wait(200)
      await shot('torneo-imposta')
      await js(`document.querySelector('.modal-head .icon-btn').click()`)
      await wait(200)
      // Fase a eliminazione diretta: le partite in programma e chi passa con la X
      await js(`[...document.querySelectorAll('.stage-row .seg button')].find(b=>b.textContent.startsWith('Quarto'))?.click()`)
      await wait(1000)
      await shot('nuova-torneo-tabellone')
      console.log('TABELLONE', await js(`[...document.querySelectorAll('.stage-row')].map(e=>e.innerText.replace(/\\n/g,' | ')).join(' || ')`))
      await js(`[...document.querySelectorAll('.page-actions .seg button')].find(b=>b.textContent==='Partita singola').click()`)
      await wait(100)
      await pick(0, 1)
      await pick(1, 4)
      await js(`document.querySelectorAll('.score-btn')[4].click()`)
      await wait(200)
      // Salva, annulla, ripeti: controlla i pulsanti in alto a destra.
      const histState = () => js(`[...document.querySelectorAll('.history-bar button')].map(b => b.disabled ? 'off' : 'on').join('/')`)
      await js(`document.querySelector('.btn-save').click()`)
      await wait(300)
      console.log('HISTORY dopo salva', await histState())
      await js(`document.querySelectorAll('.history-bar button')[0].click()`)
      await wait(300)
      console.log('HISTORY dopo annulla', await histState())
      await js(`document.querySelectorAll('.history-bar button')[1].click()`)
      await wait(300)
      console.log('HISTORY dopo ripeti', await histState())
      await wait(3500) // lascia sparire le notifiche prima degli screenshot successivi
      // Scheda giocatore
      await js(`document.querySelector('[data-page="classifica"]').click()`)
      await wait(200)
      await js(`document.querySelector('.standings tbody tr').click()`)
      await wait(400)
      await shot('giocatore')
      // Stesse pagine principali con il tema chiaro
      await js(`document.querySelector('.theme-toggle').click()`)
      await wait(300)
      await shot('giocatore-chiaro')
      for (const [name, idx] of pages.filter(([n]) => ['classifica', 'partite', 'matrice', 'impostazioni'].includes(n))) {
        await js(`document.querySelector('[data-page="${name}"]').click()`)
        await wait(400)
        await shot(`${name}-chiaro`)
      }
      await js(`document.querySelector('.theme-toggle').click()`)

      // Export dalla pagina Pubblica
      await js(`document.querySelector('[data-page="pubblica"]').click()`)
      await wait(300)
      for (const label of ['Salva PNG', 'Salva PDF', 'Excel', 'CSV classifica', 'CSV partite']) {
        await js(`[...document.querySelectorAll('.export-grid button')].find(b=>b.textContent.includes('${label}')).click()`)
        await idle()
        console.log('EXPORT', label, await js(`document.querySelector('.toasts')?.innerText + ' | ' + document.querySelector('h1')?.innerText`))
      }
      // Riepilogo del torneo: anteprima e immagine esportata
      await js(`[...document.querySelectorAll('.page-actions .seg button')].find(b=>b.textContent==='Torneo').click()`)
      await wait(600)
      await wait(4000) // lascia sparire le notifiche degli export (contengono percorsi locali)
      await shot('pubblica-torneo')
      console.log('PUBBLICA TORNEO', await js(`document.querySelector('.publish-side, .empty')?.innerText.split('\\n').join(' | ')`))
      for (const label of ['Salva PNG', 'Salva PDF']) {
        await js(`[...document.querySelectorAll('.export-grid button')].find(b=>b.textContent.includes('${label}')).click()`)
        await idle()
        console.log('EXPORT torneo', label, await js(`document.querySelector('.toasts')?.innerText`))
      }
      const errs = await js(`document.body.innerText.length`)
      console.log('SNAP_OK', outDir, errs)
    } catch (e) {
      console.error('SNAP_ERR', e)
    } finally {
      app.exit(0)
    }
  })
})

require(path.resolve(__dirname, '../out/main/index.js'))
