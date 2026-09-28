import { isValidScore } from './rules'
import type { AppData, Match, MatchOverride, Player, Settings, Season, Snapshot } from './types'
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
    throw new Error('Il giocatore ha partite registrate: segnalo come ritirato invece di eliminarlo')
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
}

function validateDraft(d: MatchDraft) {
  if (!d.playerA || !d.playerB) throw new Error('Seleziona entrambi i giocatori')
  if (d.playerA === d.playerB) throw new Error('Un giocatore non può sfidare se stesso')
  if (!isValidScore(d.setsA, d.setsB)) throw new Error('Risultato non valido: al meglio dei 5 set (3-0, 3-1, 3-2)')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Data non valida')
}

export function addMatch(data: AppData, d: MatchDraft): { data: AppData; id: string } {
  validateDraft(d)
  const t = nowISO()
  const m: Match = { id: newId(), ...d, note: d.note?.trim() || undefined, createdAt: t, updatedAt: t }
  return { data: { ...data, matches: [...data.matches, m] }, id: m.id }
}

export function updateMatch(data: AppData, id: string, d: MatchDraft): AppData {
  validateDraft(d)
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, ...d, note: d.note?.trim() || undefined, updatedAt: nowISO() } : m))
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
