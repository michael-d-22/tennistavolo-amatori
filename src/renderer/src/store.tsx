import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { compute, type Computed } from '@core/standings'
import { parseDataFile } from '@core/sync'
import { emptyData, type AppData } from '@core/types'

interface Store {
  data: AppData
  computed: Computed
  /** Applica una modifica e salva. Restituisce false se la modifica ha lanciato un errore (già notificato). */
  update: (fn: (d: AppData) => AppData, label?: string) => boolean
  replaceAll: (d: AppData, label: string) => void
  undo: () => void
  undoLabel: string | null
  toast: (msg: string, kind?: 'ok' | 'error') => void
  isNew: boolean
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider mancante')
  return s
}

interface ToastMsg {
  id: number
  msg: string
  kind: 'ok' | 'error'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ data: AppData; label: string }[]>([])
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
    (fn: (d: AppData) => AppData, label = 'modifica') => {
      if (!data) return false
      let next: AppData
      try {
        next = fn(data)
      } catch (e) {
        toast((e as Error).message, 'error')
        return false
      }
      setHistory((h) => [...h.slice(-19), { data, label }])
      setData(next)
      setIsNew(false)
      persist(next)
      return true
    },
    [data, persist, toast]
  )

  const replaceAll = useCallback(
    (d: AppData, label: string) => {
      if (data) setHistory((h) => [...h.slice(-19), { data, label }])
      setData(d)
      setIsNew(false)
      persist(d)
    },
    [data, persist]
  )

  const undo = useCallback(() => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setData(last.data)
    persist(last.data)
    toast(`Annullato: ${last.label}`)
  }, [history, persist, toast])

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
        undoLabel: history.length ? history[history.length - 1].label : null,
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
