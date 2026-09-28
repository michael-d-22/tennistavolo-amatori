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
const data = {
  schemaVersion: 1,
  season: { name: 'Stagione 2026-2027', startDate: '2026-09-28', endDate: '2027-06-30' },
  settings: { startRating: 1200, k: 32, maxMatchesPerPair: 8, minMatchesPerPair: 2, publishEveryDays: 14 },
  metaUpdatedAt: t0,
  players,
  matches: matches.filter((m) => m.date <= '2026-10-05'),
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
  win.setSize(1366, 860)
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(800)
      const js = (s) => win.webContents.executeJavaScript(s)
      const shot = async (name) => {
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
      }
      // Pubblica una classifica, poi aggiungi altre partite per vedere le variazioni.
      await js(`[...document.querySelectorAll('.nav-item')][5].click()`)
      await wait(300)
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Segna pubblicata')).click()`)
      await wait(200)
      await js(`document.querySelector('.modal .btn-primary').click()`)
      await wait(800)
      // Aggiunge le partite successive alla pubblicazione e ricarica.
      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'))
      saved.matches.push(...matches.filter((m) => m.date > '2026-10-05'))
      fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(saved))
      win.webContents.reload()
      await new Promise((r) => win.webContents.once('did-finish-load', r))
      await wait(800)
      for (const [name, idx] of pages) {
        await js(`[...document.querySelectorAll('.nav-item')][${idx - 1}].click()`)
        await wait(400)
        await shot(name)
      }
      // Nuova partita con anteprima
      await js(`[...document.querySelectorAll('.nav-item')][1].click()`)
      await wait(200)
      await js(`const g=document.querySelectorAll('.picker');g[0].querySelectorAll('.pick')[0].click();`)
      await wait(100)
      await js(`document.querySelectorAll('.picker')[1].querySelectorAll('.pick')[3].click();`)
      await wait(100)
      await js(`document.querySelectorAll('.score-btn')[4].click()`)
      await wait(300)
      await shot('nuova-anteprima')
      // Scheda giocatore
      await js(`[...document.querySelectorAll('.nav-item')][0].click()`)
      await wait(200)
      await js(`document.querySelector('.standings tbody tr').click()`)
      await wait(400)
      await shot('giocatore')
      // Export dalla pagina Pubblica
      await js(`[...document.querySelectorAll('.nav-item')][5].click()`)
      await wait(300)
      for (const label of ['Salva PNG', 'Salva PDF', 'Excel', 'CSV classifica', 'CSV partite']) {
        await js(`[...document.querySelectorAll('.export-grid button')].find(b=>b.textContent.includes('${label}')).click()`)
        await wait(2500)
        console.log('EXPORT', label, await js(`document.querySelector('.toasts')?.innerText + ' | ' + document.querySelector('h1')?.innerText`))
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
