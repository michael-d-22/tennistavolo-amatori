import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

// Il processo main si occupa solo di file system e dialoghi.
// Tutta la logica di classifica vive nel renderer (src/core), riusabile anche su Android.

const MAX_BACKUPS = 30

interface XlsxSheet {
  name: string
  columns: { header: string; width?: number }[]
  rows: (string | number | null)[][]
  /** Indici (0-based) delle righe dati da evidenziare in rosso. */
  highlightRows?: number[]
}

const dataDir = () => app.getPath('userData')
const dataFile = () => join(dataDir(), 'data.json')
const backupDir = () => join(dataDir(), 'backup')

async function exists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function writeAtomic(file: string, content: string) {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, file)
}

/** Data e ora locali per i nomi dei file di backup, es. 2026-09-29T21-05-33. */
function stamp() {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function rotateBackups() {
  const files = (await fs.readdir(backupDir())).filter((f) => f.startsWith('data-') && f.endsWith('.json')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
    await fs.unlink(join(backupDir(), f))
  }
}

let lastBackupAt = 0

async function saveData(json: string) {
  await fs.mkdir(backupDir(), { recursive: true })
  // Un backup della versione precedente al massimo ogni 10 minuti, più quelli manuali.
  if ((await exists(dataFile())) && Date.now() - lastBackupAt > 10 * 60 * 1000) {
    await fs.copyFile(dataFile(), join(backupDir(), `data-${stamp()}.json`))
    lastBackupAt = Date.now()
    await rotateBackups()
  }
  await writeAtomic(dataFile(), json)
}

function registerIpc(win: BrowserWindow) {
  ipcMain.handle('data:load', async () => {
    if (!(await exists(dataFile()))) return null
    return fs.readFile(dataFile(), 'utf8')
  })

  ipcMain.handle('data:save', (_e, json: string) => saveData(json))

  ipcMain.handle('backup:create', async () => {
    await fs.mkdir(backupDir(), { recursive: true })
    if (!(await exists(dataFile()))) return null
    const name = `data-${stamp()}-manuale.json`
    await fs.copyFile(dataFile(), join(backupDir(), name))
    return name
  })

  ipcMain.handle('backup:list', async () => {
    await fs.mkdir(backupDir(), { recursive: true })
    const files = (await fs.readdir(backupDir())).filter((f) => f.endsWith('.json'))
    const out = await Promise.all(
      files.map(async (f) => ({ name: f, size: (await fs.stat(join(backupDir(), f))).size }))
    )
    return out.sort((a, b) => (a.name < b.name ? 1 : -1))
  })

  ipcMain.handle('backup:read', (_e, name: string) => {
    if (name.includes('/') || name.includes('\\')) throw new Error('Nome non valido')
    return fs.readFile(join(backupDir(), name), 'utf8')
  })

  ipcMain.handle('backup:openFolder', async () => {
    await fs.mkdir(backupDir(), { recursive: true })
    await shell.openPath(backupDir())
  })

  ipcMain.handle(
    'file:save',
    async (_e, opts: { defaultName: string; filters: Electron.FileFilter[]; content: string | Uint8Array; encoding?: 'utf8' | 'base64' }) => {
      const res = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters })
      if (res.canceled || !res.filePath) return null
      const buf =
        typeof opts.content === 'string'
          ? Buffer.from(opts.content, opts.encoding === 'base64' ? 'base64' : 'utf8')
          : Buffer.from(opts.content)
      await fs.writeFile(res.filePath, buf)
      return res.filePath
    }
  )

  ipcMain.handle('file:open', async (_e, opts: { filters: Electron.FileFilter[] }) => {
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters })
    if (res.canceled || !res.filePaths[0]) return null
    return fs.readFile(res.filePaths[0], 'utf8')
  })

  // Genera un PDF da un frammento HTML autonomo, in una finestra nascosta.
  ipcMain.handle('pdf:fromHtml', async (_e, opts: { html: string; defaultName: string; landscape?: boolean }) => {
    const res = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (res.canceled || !res.filePath) return null
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(opts.html))
      const pdf = await pdfWin.webContents.printToPDF({
        pageSize: 'A4',
        landscape: !!opts.landscape,
        printBackground: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      })
      await fs.writeFile(res.filePath, pdf)
      return res.filePath
    } finally {
      pdfWin.destroy()
    }
  })

  ipcMain.handle('xlsx:save', async (_e, opts: { defaultName: string; sheets: XlsxSheet[] }) => {
    const res = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
    if (res.canceled || !res.filePath) return null
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Tornei e partite interne tennistavolo'
    for (const s of opts.sheets) {
      const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] })
      ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width ?? 12 }))
      ws.addRows(s.rows)
      const head = ws.getRow(1)
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF131A45' } }
      s.highlightRows?.forEach((i) => {
        ws.getRow(i + 2).font = { color: { argb: 'FFB91C1C' } }
      })
    }
    await wb.xlsx.writeFile(res.filePath)
    return res.filePath
  })

  ipcMain.handle('clipboard:text', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('clipboard:image', (_e, dataUrl: string) => clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)))
  ipcMain.handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('theme:set', (_e, theme: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = theme
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir() }))
}

function createWindow() {
  // Tema scuro predefinito finché l'interfaccia non comunica la preferenza salvata.
  nativeTheme.themeSource = 'dark'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Tornei e partite interne tennistavolo',
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    backgroundColor: '#0e1021',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Link esterni nel browser di sistema, mai dentro l'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpc(win)

  // L'interfaccia è disegnata per circa 1400×880: su finestre più grandi (schermo intero, monitor grandi)
  // si ingrandisce tutta in proporzione invece di lasciare testi piccoli e spazi vuoti.
  const fitZoom = () => {
    if (win.isDestroyed()) return
    const [w, h] = win.getContentSize()
    const factor = Math.min(1.6, Math.max(1, Math.min(w / 1400, h / 880)))
    win.webContents.setZoomFactor(Math.round(factor * 100) / 100)
  }
  win.on('resize', fitZoom)
  win.webContents.on('did-finish-load', fitZoom)

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Cartella dati alternativa (AMATORI_DATA_DIR) per i test e per eventuali installazioni "da chiavetta".
// La cartella dati resta %APPDATA%\Amatori anche se il nome dell'app cambia,
// così i dati già inseriti non si perdono.
app.setPath('userData', process.env['AMATORI_DATA_DIR'] || join(app.getPath('appData'), 'Amatori'))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => app.quit())
}
