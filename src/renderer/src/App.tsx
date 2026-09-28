import { useEffect, useState } from 'react'
import { daysBetween, formatDate, todayISO } from '@core/format'
import { useStore } from './store'
import { setTheme, useTheme } from './theme'
import { ClassificaPage } from './pages/Classifica'
import { NuovaPartitaPage } from './pages/NuovaPartita'
import { PartitePage } from './pages/Partite'
import { MatricePage } from './pages/Matrice'
import { GiocatoriPage } from './pages/Giocatori'
import { GiocatorePage } from './pages/Giocatore'
import { PubblicaPage } from './pages/Pubblica'
import { ImpostazioniPage } from './pages/Impostazioni'
import { BenvenutoPage } from './pages/Benvenuto'

export type Route =
  | { page: 'classifica' }
  | { page: 'nuova' }
  | { page: 'partite'; playerId?: string }
  | { page: 'matrice' }
  | { page: 'giocatori' }
  | { page: 'giocatore'; id: string }
  | { page: 'pubblica' }
  | { page: 'impostazioni' }

export type Navigate = (r: Route) => void

const NAV: { page: Route['page']; label: string; icon: string; key: string }[] = [
  { page: 'classifica', label: 'Classifica', icon: '🏆', key: '1' },
  { page: 'nuova', label: 'Nuova partita', icon: '➕', key: '2' },
  { page: 'partite', label: 'Partite', icon: '📋', key: '3' },
  { page: 'matrice', label: 'Scontri diretti', icon: '▦', key: '4' },
  { page: 'giocatori', label: 'Giocatori', icon: '👥', key: '5' },
  { page: 'pubblica', label: 'Pubblica', icon: '📤', key: '6' },
  { page: 'impostazioni', label: 'Impostazioni', icon: '⚙️', key: '7' }
]

export function App() {
  const { data, computed, undo, undoLabel, isNew } = useStore()
  const theme = useTheme()
  const [route, setRoute] = useState<Route>({ page: 'classifica' })
  const navigate: Navigate = (r) => {
    setRoute(r)
    document.querySelector('.content')?.scrollTo(0, 0)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
        e.preventDefault()
        undo()
      }
      if (e.ctrlKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault()
        const n = NAV.find((x) => x.key === e.key)!
        setRoute({ page: n.page } as Route)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const last = computed.lastSnapshot
  const daysSince = last ? daysBetween(last.date, todayISO()) : null
  const publishDue = computed.results.length > 0 && (daysSince == null || daysSince >= data.settings.publishEveryDays)
  const activePlayers = data.players.filter((p) => !p.deleted).length

  if (isNew && activePlayers === 0) return <BenvenutoPage />

  let body
  switch (route.page) {
    case 'classifica':
      body = <ClassificaPage navigate={navigate} />
      break
    case 'nuova':
      body = <NuovaPartitaPage navigate={navigate} />
      break
    case 'partite':
      body = <PartitePage navigate={navigate} initialPlayer={route.playerId} />
      break
    case 'matrice':
      body = <MatricePage navigate={navigate} />
      break
    case 'giocatori':
      body = <GiocatoriPage navigate={navigate} />
      break
    case 'giocatore':
      body = <GiocatorePage navigate={navigate} id={route.id} />
      break
    case 'pubblica':
      body = <PubblicaPage />
      break
    case 'impostazioni':
      body = <ImpostazioniPage />
      break
  }

  const current = route.page === 'giocatore' ? 'giocatori' : route.page

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-ball">🏓</span>
          <div>
            <div className="brand-name">AMATORI</div>
            <div className="brand-season">{data.season.name}</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.page}
              className={`nav-item ${current === n.page ? 'active' : ''} ${n.page === 'nuova' ? 'nav-primary' : ''}`}
              onClick={() => navigate({ page: n.page } as Route)}
              title={`Ctrl+${n.key}`}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.page === 'pubblica' && publishDue && <span className="dot" title="È ora di pubblicare la classifica" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {last ? (
            <div className="muted small">
              Ultima pubblicazione:
              <br />
              <strong>{formatDate(last.date)}</strong> ({daysSince === 0 ? 'oggi' : `${daysSince} gg fa`})
            </div>
          ) : (
            <div className="muted small">Nessuna classifica pubblicata</div>
          )}
          <button
            className="btn btn-ghost btn-sm theme-toggle"
            onClick={() => setTheme(theme.resolved === 'dark' ? 'light' : 'dark')}
            title="Cambia tema (anche da Impostazioni)"
          >
            {theme.resolved === 'dark' ? '☀️ Tema chiaro' : '🌙 Tema scuro'}
          </button>
          {undoLabel && (
            <button className="btn btn-ghost btn-sm undo" onClick={undo} title="Ctrl+Z">
              ↶ Annulla {undoLabel}
            </button>
          )}
        </div>
      </aside>
      <main className="content">{body}</main>
    </div>
  )
}
