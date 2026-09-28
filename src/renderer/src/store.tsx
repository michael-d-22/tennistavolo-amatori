import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { compute, type Computed } from '@core/standings'
import { parseDataFile } from '@core/sync'
import { emptyData, type AppData } from '@core/types'

interface Store {
  data: AppData
  computed: Computed
  /** Applica una modifica e salva. Restituisce false se la modifica ha lanciato un errore (già notificato). */
  update: (fn: (d: AppData) => AppData, label?: string, opts?: { history?: boolean }) => boolean
  replaceAll: (d: AppData, label: string) => void
  undo: () => void
  redo: () => void
  undoLabel: string | null
  redoLabel: string | null
  toast: (msg: string, kind?: 'ok' | 'error') => void
  isNew: boolean
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider mancante')
  return s
}

/**
 * Una voce della cronologia Annulla/Ripeti. Le pubblicazioni non entrano nella cronologia
 * (si tolgono da Pubblica → Elimina), quindi annullando si mantengono quelle attuali;
 * solo import e ripristino backup ("full") riportano indietro anche le pubblicazioni.
 */
interface HistoryEntry {
  data: AppData
  label: string
  full: boolean
}

const MAX_HISTORY = 30

interface ToastMsg {
  id: number
  msg: string
  kind: 'ok' | 'error'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [past, setPast] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const saveChain = useRef<Promise<void>>(Promise.resolve())

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])

  useEffect(() => {
    window.api
      .loadData()
      .then((json) => {
        if (json == null) {
          setIsNew(true)
          setData(emptyData())
        } else {
          setData(parseDataFile(JSON.parse(json)))
        }
      })
      .catch((e) => setLoadError(String(e?.message ?? e)))
  }, [])

  const persist = useCallback(
    (d: AppData) => {
      // Salvataggi in coda: mai due scritture contemporanee.
      saveChain.current = saveChain.current
        .then(() => window.api.saveData(JSON.stringify(d, null, 1)))
        .catch((e) => toast(`Errore di salvataggio: ${e?.message ?? e}`, 'error'))
    },
    [toast]
  )

  const update = useCallback(
    (fn: (d: AppData) => AppData, label = 'modifica', opts?: { history?: boolean }) => {
      if (!data) return false
      let next: AppData
      try {
        next = fn(data)
      } catch (e) {
        toast((e as Error).message, 'error')
        return false
      }
      if (opts?.history !== false) {
        setPast((h) => [...h.slice(-(MAX_HISTORY - 1)), { data, label, full: false }])
        setFuture([])
      }
      setData(next)
      setIsNew(false)
      persist(next)
      return true
    },
    [data, persist, toast]
  )

  const replaceAll = useCallback(
    (d: AppData, label: string) => {
      if (data) {
        setPast((h) => [...h.slice(-(MAX_HISTORY - 1)), { data, label, full: true }])
        setFuture([])
      }
      setData(d)
      setIsNew(false)
      persist(d)
    },
    [data, persist]
  )

  // Porta i dati allo stato della voce; le pubblicazioni restano quelle attuali (salvo "full").
  const restore = useCallback(
    (entry: HistoryEntry, current: AppData): AppData => (entry.full ? entry.data : { ...entry.data, snapshots: current.snapshots }),
    []
  )

  const undo = useCallback(() => {
    const last = past[past.length - 1]
    if (!last || !data) return
    setPast((h) => h.slice(0, -1))
    setFuture((f) => [...f, { data, label: last.label, full: last.full }])
    const next = restore(last, data)
    setData(next)
    persist(next)
    toast(`Annullato: ${last.label}`)
  }, [past, data, persist, restore, toast])

  const redo = useCallback(() => {
    const nextEntry = future[future.length - 1]
    if (!nextEntry || !data) return
    setFuture((f) => f.slice(0, -1))
    setPast((h) => [...h, { data, label: nextEntry.label, full: nextEntry.full }])
    const next = restore(nextEntry, data)
    setData(next)
    persist(next)
    toast(`Ripristinato: ${nextEntry.label}`)
  }, [future, data, persist, restore, toast])

  const computed = useMemo(() => (data ? compute(data) : null), [data])

  if (loadError) {
    return (
      <div className="fatal">
        <h1>Impossibile leggere i dati</h1>
        <p>{loadError}</p>
        <p>I backup automatici si trovano nella cartella dati dell'app.</p>
        <button className="btn" onClick={() => window.api.openBackupFolder()}>
          Apri cartella backup
        </button>
      </div>
    )
  }
  if (!data || !computed) return <div className="loading">Caricamento…</div>

  return (
    <Ctx.Provider
      value={{
        data,
        computed,
        update,
        replaceAll,
        undo,
        redo,
        undoLabel: past.length ? past[past.length - 1].label : null,
        redoLabel: future.length ? future[future.length - 1].label : null,
        toast,
        isNew
      }}
    >
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
