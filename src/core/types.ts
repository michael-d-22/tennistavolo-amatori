// Modello dati dell'app. Tutto il file dati è un unico oggetto `AppData`
// serializzato in JSON: è lo stesso formato usato per backup ed export/import.

export const SCHEMA_VERSION = 2

export interface Settings {
  startRating: number
  k: number
  /** K proposto per i nuovi tornei (ogni torneo conserva il suo). */
  tournamentK: number
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

/** 'retired' = inattivo: le sue partite restano salvate ma sono in pausa (non contano per nessuno). */
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
  /** Partita di torneo: usa il K del torneo ed è fuori dai limiti per coppia. */
  tournamentId?: string
  /** Fase del torneo (girone o turno del tabellone). */
  stage?: MatchStage
  /** Punteggi dei singoli set, dal punto di vista di A (facoltativi). */
  setScores?: [number, number][]
  override?: MatchOverride
  createdAt: string // ISO, usato anche per ordinare partite dello stesso giorno
  updatedAt: string // ISO
  deleted?: boolean
}

/**
 * Turni del tabellone contati dalla fine: 1 = finale, 2 = semifinali, 3 = quarti, 4 = ottavi, 5 = sedicesimi.
 * `slot` è la posizione della partita nel turno (0 = la prima in alto). 'third' è la finale per il 3º/4º posto.
 */
export type MatchStage = { type: 'group'; group: string } | { type: 'bracket'; round: number; slot: number } | { type: 'third' }

/** Nel sorteggio del tabellone: il giocatore accoppiato con BYE passa il turno senza giocare ("prende la X"). */
export const BYE = 'X'

/**
 * - free: solo partite, senza struttura
 * - group: girone unico all'italiana
 * - group-bracket: girone unico, poi tabellone
 * - groups-bracket: più gironi, poi tabellone
 */
export type TournamentFormat = 'free' | 'group' | 'group-bracket' | 'groups-bracket'

export interface TournamentGroup {
  id: string
  name: string
  players: string[]
}

export interface Tournament {
  id: string
  date: string // YYYY-MM-DD, la stessa di tutte le sue partite
  name?: string
  k: number
  /** Assente nei tornei creati prima della struttura: equivale a 'free'. */
  format?: TournamentFormat
  groups?: TournamentGroup[]
  /** Turno da cui parte il tabellone (vedi MatchStage), es. 2 = dalle semifinali. */
  bracketRounds?: number
  thirdPlace?: boolean
  /**
   * Accoppiamenti del primo turno, scelti a mano: 2^bracketRounds posti, a coppie (0-1, 2-3…).
   * Ogni posto è un giocatore, BYE oppure null (ancora da decidere). I turni successivi seguono i risultati.
   */
  draw?: (string | null)[]
  /** Accoppiamenti composti dall'app a gironi finiti (e non ritoccati a mano): si aggiornano se cambiano i risultati. */
  drawAuto?: boolean
  createdAt: string
  updatedAt: string
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
  tournaments: Tournament[]
  snapshots: Snapshot[]
}

export const DEFAULT_SETTINGS: Settings = {
  startRating: 1200,
  k: 32,
  tournamentK: 48,
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
    tournaments: [],
    snapshots: []
  }
}
