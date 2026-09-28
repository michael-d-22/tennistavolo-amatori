import { contextBridge, ipcRenderer } from 'electron'

type FileFilter = { name: string; extensions: string[] }

const api = {
  loadData: (): Promise<string | null> => ipcRenderer.invoke('data:load'),
  saveData: (json: string): Promise<void> => ipcRenderer.invoke('data:save', json),
  createBackup: (): Promise<string | null> => ipcRenderer.invoke('backup:create'),
  listBackups: (): Promise<{ name: string; size: number }[]> => ipcRenderer.invoke('backup:list'),
  readBackup: (name: string): Promise<string> => ipcRenderer.invoke('backup:read', name),
  openBackupFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),
  saveFile: (opts: {
    defaultName: string
    filters: FileFilter[]
    content: string | Uint8Array
    encoding?: 'utf8' | 'base64'
  }): Promise<string | null> => ipcRenderer.invoke('file:save', opts),
  openFile: (opts: { filters: FileFilter[] }): Promise<string | null> => ipcRenderer.invoke('file:open', opts),
  pdfFromHtml: (opts: { html: string; defaultName: string; landscape?: boolean }): Promise<string | null> =>
    ipcRenderer.invoke('pdf:fromHtml', opts),
  saveXlsx: (opts: {
    defaultName: string
    sheets: { name: string; columns: { header: string; width?: number }[]; rows: (string | number | null)[][]; highlightRows?: number[] }[]
  }): Promise<string | null> => ipcRenderer.invoke('xlsx:save', opts),
  copyText:(text: string): Promise<void> => ipcRenderer.invoke('clipboard:text', text),
  copyImage: (dataUrl: string): Promise<void> => ipcRenderer.invoke('clipboard:image', dataUrl),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),
  setNativeTheme: (theme: 'dark' | 'light' | 'system'): Promise<void> => ipcRenderer.invoke('theme:set', theme),
  appInfo:(): Promise<{ version: string; dataDir: string }> => ipcRenderer.invoke('app:info')
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
