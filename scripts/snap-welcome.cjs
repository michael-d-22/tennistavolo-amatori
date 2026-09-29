// Schermata del primo avvio (dati vuoti) per il manuale.
// Uso: npm run build && npx electron scripts/snap-welcome.cjs <cartella-output>
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const outDir = path.resolve(process.argv[2] || 'snaps')
fs.mkdirSync(outDir, { recursive: true })
process.env.AMATORI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-welcome-'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let hooked = false
app.on('browser-window-created', (_e, win) => {
  if (hooked) return
  hooked = true
  win.setSize(1366, 860)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(1200)
      // Qualche nome già scritto, come farebbe il responsabile.
      await win.webContents.executeJavaScript(`(() => {
        const t = document.querySelector('textarea')
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(t, 'Matteo Bianchi\\nLuca Ferri\\nMarco Sala\\nGiulia Riva\\nPaolo Conti\\nSara Galli')
        t.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await wait(800)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, 'benvenuto.png'), img.toPNG())
      console.log('WELCOME_OK')
    } catch (e) {
      console.error('WELCOME_ERR', e)
    } finally {
      app.exit(0)
    }
  })
})

require(path.resolve(__dirname, '../out/main/index.js'))
