import { isValidScore } from './rules'
import type { AppData, Match, MatchOverride, Player, Settings, Season, Snapshot, Tournament } from './types'
import type { Computed } from './standings'

// Operazioni sui dati: funzioni pure che restituiscono una nuova copia di AppData.
// Aggiornano sempre updatedAt, necessario per il merge in sincronizzazione.

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

const nowISO = () => new Date().toISOString()

export function addPlayer(data: AppData, name: string, joinedAt: string): AppData {
  const clean = name.trim()
  if (!clean) throw new Error('Il nome è obbligatorio')
  if (data.players.some((p) => !p.deleted && p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`Esiste già un giocatore chiamato "${clean}"`)
  }
  const t = nowISO()
  const p: Player = { id: newId(), name: clean, joinedAt, status: 'active', createdAt: t, updatedAt: t }
  return { ...data, players: [...data.players, p] }
}

export function updatePlayer(data: AppData, id: string, patch: Partial<Omit<Player, 'id' | 'createdAt'>>): AppData {
  if (patch.name !== undefined) {
    const clean = patch.name.trim()
    if (!clean) throw new Error('Il nome è obbligatorio')
    if (data.players.some((p) => p.id !== id && !p.deleted && p.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error(`Esiste già un giocatore chiamato "${clean}"`)
    }
    patch = { ...patch, name: clean }
  }
  return {
    ...data,
    players: data.players.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p))
  }
}

export function deletePlayer(data: AppData, id: string): AppData {
  if (data.matches.some((m) => !m.deleted && (m.playerA === id || m.playerB === id))) {
    throw new Error('Il giocatore ha partite registrate: segnalo come inattivo invece di eliminarlo')
  }
  return updatePlayer(data, id, { deleted: true })
}

export interface MatchDraft {
  date: string
  playerA: string
  playerB: string
  setsA: number
  setsB: number
  note?: string
  tournamentId?: string
}

function tournamentOf(data: AppData, id: string | undefined): Tournament | undefined {
  if (!id) return undefined
  const t = data.tournaments.find((x) => x.id === id && !x.deleted)
  if (!t) throw new Error('Torneo non trovato')
  return t
}

/** Valida la partita; quelle di torneo prendono sempre la data del torneo. */
function validateDraft(data: AppData, d: MatchDraft): MatchDraft {
  if (!d.playerA || !d.playerB) throw new Error('Seleziona entrambi i giocatori')
  if (d.playerA === d.playerB) throw new Error('Un giocatore non può sfidare se stesso')
  const t = tournamentOf(data, d.tournamentId)
  if (!isValidScore(d.setsA, d.setsB, !!t)) {
    throw new Error(t ? 'Risultato non valido: al meglio dei 3 o dei 5 set' : 'Risultato non valido: al meglio dei 5 set (3-0, 3-1, 3-2)')
  }
  const date = t ? t.date : d.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida')
  return { ...d, date, tournamentId: t?.id, note: d.note?.trim() || undefined }
}

export function addMatch(data: AppData, d: MatchDraft): { data: AppData; id: string } {
  const clean = validateDraft(data, d)
  const t = nowISO()
  const m: Match = { id: newId(), ...clean, createdAt: t, updatedAt: t }
  return { data: { ...data, matches: [...data.matches, m] }, id: m.id }
}

/** Modifica i dati di una partita. Il torneo di appartenenza non cambia. */
export function updateMatch(data: AppData, id: string, d: MatchDraft): AppData {
  const current = data.matches.find((m) => m.id === id)
  const clean = validateDraft(data, { ...d, tournamentId: current?.tournamentId })
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, ...clean, updatedAt: nowISO() } : m))
  }
}

export interface TournamentDraft {
  date: string
  name?: string
  k: number
}

function validateTournament(d: TournamentDraft): TournamentDraft {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Data del torneo non valida')
  if (!(d.k > 0)) throw new Error('Il fattore K del torneo deve essere maggiore di zero')
  return { date: d.date, name: d.name?.trim() || undefined, k: d.k }
}

export function addTournament(data: AppData, d: TournamentDraft): { data: AppData; id: string } {
  const t = nowISO()
  const tour: Tournament = { id: newId(), ...validateTournament(d), createdAt: t, updatedAt: t }
  return { data: { ...data, tournaments: [...data.tournaments, tour] }, id: tour.id }
}

/** Aggiorna nome, data e K del torneo; se cambia la data, la cambia anche a tutte le sue partite. */
export function updateTournament(data: AppData, id: string, d: TournamentDraft): AppData {
  const clean = validateTournament(d)
  const t = nowISO()
  const old = data.tournaments.find((x) => x.id === id)
  return {
    ...data,
    tournaments: data.tournaments.map((x) => (x.id === id ? { ...x, ...clean, updatedAt: t } : x)),
    matches:
      old && old.date !== clean.date
        ? data.matches.map((m) => (m.tournamentId === id ? { ...m, date: clean.date, updatedAt: t } : m))
        : data.matches
  }
}

export function setMatchOverride(data: AppData, id: string, override: MatchOverride | undefined): AppData {
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, override, updatedAt: nowISO() } : m))
  }
}

export function deleteMatch(data: AppData, id: string): AppData {
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, deleted: true, updatedAt: nowISO() } : m))
  }
}

export function restoreMatch(data: AppData, id: string): AppData {
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, deleted: false, updatedAt: nowISO() } : m))
  }
}

export function updateMeta(data: AppData, season: Season, settings: Settings): AppData {
  return { ...data, season, settings, metaUpdatedAt: nowISO() }
}

export function publishSnapshot(data: AppData, c: Computed, date: string, title?: string): AppData {
  const t = nowISO()
  const snap: Snapshot = {
    id: newId(),
    date,
    title,
    rows: c.standings
      .filter((s) => s.player.status === 'active')
      .map((s) => ({
        playerId: s.player.id,
        name: s.player.name,
        rating: s.rating,
        position: s.position!,
        qualified: s.qualified,
        played: s.played,
        wins: s.wins,
        losses: s.losses
      })),
    createdAt: t,
    updatedAt: t
  }
  return { ...data, snapshots: [...data.snapshots, snap] }
}

export function deleteSnapshot(data: AppData, id: string): AppData {
  return {
    ...data,
    snapshots: data.snapshots.map((s) => (s.id === id ? { ...s, deleted: true, updatedAt: nowISO() } : s))
  }
}
