// Modello dati dell'app. Tutto il file dati è un unico oggetto `AppData`
// serializzato in JSON: è lo stesso formato usato per backup ed export/import.

export const SCHEMA_VERSION = 1

export interface Settings {
  startRating: number
  k: number
  /** Oltre questo numero di partite con lo stesso avversario, le partite non contano. */
  maxMatchesPerPair: number
  /** Soglia minima di partite contro ciascun avversario per essere in classifica ufficiale. */
  minMatchesPerPair: number
  publishEveryDays: number
}

export interface Season {
  name: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

export type PlayerStatus = 'active' | 'retired'

export interface Player {
  id: string
  name: string
  joinedAt: string // YYYY-MM-DD
  status: PlayerStatus
  retiredAt?: string
  createdAt: string // ISO
  updatedAt: string // ISO
  deleted?: boolean
}

export type OverrideMode = 'include' | 'exclude'

export interface MatchOverride {
  mode: OverrideMode
  reason?: string
}

export interface Match {
  id: string
  date: string // YYYY-MM-DD
  playerA: string
  playerB: string
  setsA: number
  setsB: number
  note?: string
  override?: MatchOverride
  createdAt: string // ISO, usato anche per ordinare partite dello stesso giorno
  updatedAt: string // ISO
  deleted?: boolean
}

export interface SnapshotRow {
  playerId: string
  name: string
  rating: number
  position: number
  qualified: boolean
  played: number
  wins: number
  losses: number
}

export interface Snapshot {
  id: string
  date: string // YYYY-MM-DD
  title?: string
  rows: SnapshotRow[]
  createdAt: string
  updatedAt: string
  deleted?: boolean
}

export interface AppData {
  schemaVersion: number
  season: Season
  settings: Settings
  /** Data di ultima modifica di stagione/impostazioni (per il merge in sync). */
  metaUpdatedAt: string
  players: Player[]
  matches: Match[]
  snapshots: Snapshot[]
}

export const DEFAULT_SETTINGS: Settings = {
  startRating: 1200,
  k: 32,
  maxMatchesPerPair: 8,
  minMatchesPerPair: 2,
  publishEveryDays: 14
}

export function emptyData(now = new Date()): AppData {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return {
    schemaVersion: SCHEMA_VERSION,
    season: { name: `Stagione ${y}-${y + 1}`, startDate: `${y}-09-28`, endDate: `${y + 1}-06-30` },
    settings: { ...DEFAULT_SETTINGS },
    metaUpdatedAt: now.toISOString(),
    players: [],
    matches: [],
    snapshots: []
  }
}
