// Genera, a partire dal logo vettoriale (build/logo.svg):
//  - src/renderer/src/assets/logo.png       logo trasparente (tema chiaro)
//  - src/renderer/src/assets/logo-dark.png  stesso logo con il blu in color crema (tema scuro)
//  - build/icon.png                         icona 512x512: il logo su fondo bianco arrotondato
// Uso: npm run icon
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'build/logo.svg'), 'utf8')
// Tema scuro: il blu diventa color crema (come i testi dell'app), il rosso resta rosso.
const svgDark = svg.replaceAll('#131a45', '#eeebe3').replaceAll('#c8231a', '#d42c22')
const dataUrl = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')

const pageScript = `(async () => {
  const load = async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    return img
  }
  const render = (img, size, background) => {
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    if (background) {
      const pad = 16, radius = 110
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.roundRect(pad, pad, size - 2 * pad, size - 2 * pad, radius); ctx.fill()
      const inner = size - 120
      ctx.drawImage(img, 60, 60, inner, inner)
    } else {
      ctx.drawImage(img, 0, 0, size, size)
    }
    return c.toDataURL('image/png')
  }
  const light = await load(${JSON.stringify(dataUrl(svg))})
  const dark = await load(${JSON.stringify(dataUrl(svgDark))})
  return { logo: render(light, 600), logoDark: render(dark, 600), icon: render(light, 512, true) }
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<body></body>')
  const out = await win.webContents.executeJavaScript(pageScript)
  const save = (file, dataUrl) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('scritto', path.relative(root, file))
  }
  save(path.join(root, 'src/renderer/src/assets/logo.png'), out.logo)
  save(path.join(root, 'src/renderer/src/assets/logo-dark.png'), out.logoDark)
  save(path.join(root, 'build/icon.png'), out.icon)
  app.exit(0)
})
