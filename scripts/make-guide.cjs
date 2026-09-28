// Crea il PDF della guida per l'utente a partire da docs/guida/guida.html.
// Uso: npm run guide  →  docs/guida/Guida-Classifica-Amatori.pdf
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const html = path.join(__dirname, '../docs/guida/guida.html')
const out = path.join(__dirname, '../docs/guida/Guida-Classifica-Amatori.pdf')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400 })
  await win.loadFile(html)
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => null))))')
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  fs.writeFileSync(out, pdf)
  console.log('GUIDA', out, Math.round(pdf.length / 1024) + ' KB')
  app.exit(0)
})
