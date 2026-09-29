import { useEffect, useState, type ReactNode } from 'react'
import { daysBetween, formatLongDate, todayISO } from '@core/format'
import { useStore } from './store'
import { Logo } from './components/Logo'
import { setTheme, useTheme } from './theme'
import {
  IconGrid,
  IconList,
  IconMoon,
  IconPlayers,
  IconPlus,
  IconPublish,
  IconRedo,
  IconRanking,
  IconSettings,
  IconSun,
  IconUndo
} from './components/icons'
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

type Page = Route['page']

// Scorciatoie Ctrl+1…7; "Nuova partita" (2) è il pulsante rosso sopra il menu.
const SHORTCUTS: Record<string, Page> = {
  '1': 'classifica',
  '2': 'nuova',
  '3': 'partite',
  '4': 'matrice',
  '5': 'giocatori',
  '6': 'pubblica',
  '7': 'impostazioni'
}

const NAV: { page: Page; label: string; icon: ReactNode; key: string }[] = [
  { page: 'classifica', label: 'Classifica', icon: <IconRanking />, key: '1' },
  { page: 'partite', label: 'Partite', icon: <IconList />, key: '3' },
  { page: 'matrice', label: 'Scontri diretti', icon: <IconGrid />, key: '4' },
  { page: 'giocatori', label: 'Giocatori', icon: <IconPlayers />, key: '5' },
  { page: 'pubblica', label: 'Pubblica', icon: <IconPublish />, key: '6' },
  { page: 'impostazioni', label: 'Impostazioni', icon: <IconSettings />, key: '7' }
]

export function App() {
  const { data, computed, undo, redo, undoLabel, redoLabel, isNew } = useStore()
  const theme = useTheme()
  const [route, setRoute] = useState<Route>({ page: 'classifica' })
  const navigate: Navigate = (r) => {
    setRoute(r)
    document.querySelector('.content')?.scrollTo(0, 0)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const isUndo = e.ctrlKey && !e.shiftKey && k === 'z'
      const isRedo = e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))
      if (isUndo || isRedo) {
        // Nei campi di testo Ctrl+Z/Ctrl+Y restano quelli del campo.
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
        e.preventDefault()
        if (isUndo) undo()
        else redo()
      }
      if (e.ctrlKey && SHORTCUTS[e.key]) {
        e.preventDefault()
        setRoute({ page: SHORTCUTS[e.key] } as Route)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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
          <div className="brand-logo">
            <Logo />
          </div>
          <div className="brand-name">Classifica Amatori</div>
          <div className="brand-season">{data.season.name}</div>
        </div>

        <button
          className={`btn btn-red btn-block ${current === 'nuova' ? 'is-current' : ''}`}
          data-page="nuova"
          onClick={() => navigate({ page: 'nuova' })}
          title="Ctrl+2"
        >
          <IconPlus />
          Nuova partita
        </button>

        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.page}
              data-page={n.page}
              className={`nav-item ${current === n.page ? 'active' : ''}`}
              aria-current={current === n.page ? 'page' : undefined}
              onClick={() => navigate({ page: n.page } as Route)}
              title={`Ctrl+${n.key}`}
            >
              {n.icon}
              {n.label}
              {n.page === 'pubblica' && publishDue && <span className="nav-due" title="È ora di pubblicare la classifica" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-publish">
            {last ? (
              <>
                Ultima pubblicazione
                <br />
                <strong>{formatLongDate(last.date)}</strong> · {daysSince === 0 ? 'oggi' : daysSince === 1 ? 'ieri' : `${daysSince} giorni fa`}
              </>
            ) : (
              'Nessuna classifica pubblicata'
            )}
          </div>
          <button
            className="sidebar-btn theme-toggle"
            onClick={() => setTheme(theme.resolved === 'dark' ? 'light' : 'dark')}
            title="Cambia tema (anche da Impostazioni)"
          >
            {theme.resolved === 'dark' ? <IconSun /> : <IconMoon />}
            {theme.resolved === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
          </button>
        </div>
      </aside>
      <main className="content">
        <div className="history-bar" role="toolbar" aria-label="Annulla e ripeti">
          <button
            className="icon-btn"
            onClick={undo}
            disabled={!undoLabel}
            aria-label={undoLabel ? `Annulla ${undoLabel}` : 'Niente da annullare'}
            title={undoLabel ? `Annulla ${undoLabel} (Ctrl+Z)` : 'Niente da annullare (Ctrl+Z)'}
          >
            <IconUndo />
          </button>
          <button
            className="icon-btn"
            onClick={redo}
            disabled={!redoLabel}
            aria-label={redoLabel ? `Ripeti ${redoLabel}` : 'Niente da ripetere'}
            title={redoLabel ? `Ripeti ${redoLabel} (Ctrl+Y)` : 'Niente da ripetere (Ctrl+Y)'}
          >
            <IconRedo />
          </button>
        </div>
        {body}
      </main>
    </div>
  )
}
