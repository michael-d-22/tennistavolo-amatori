import { isValidScore } from './rules'
import {
  MAX_BRACKET_ROUNDS,
  dependentMatch,
  hasGroups,
  setScoresError,
  syncAutoDraw,
  tournamentMatchError,
  tournamentStructureError
} from './tournament'
import type {
  AppData,
  Match,
  MatchOverride,
  MatchStage,
  Player,
  Settings,
  Season,
  Snapshot,
  Tournament,
  TournamentFormat,
  TournamentGroup
} from './types'
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
  if (data.tournaments.some((t) => !t.deleted && (t.groups?.some((g) => g.players.includes(id)) || t.draw?.includes(id)))) {
    throw new Error('Il giocatore è iscritto a un torneo: toglilo prima dal torneo')
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
  stage?: MatchStage
  setScores?: [number, number][]
}

function tournamentOf(data: AppData, id: string | undefined): Tournament | undefined {
  if (!id) return undefined
  const t = data.tournaments.find((x) => x.id === id && !x.deleted)
  if (!t) throw new Error('Torneo non trovato')
  return t
}

/**
 * Valida la partita; quelle di torneo prendono sempre la data del torneo e devono rispettarne
 * la struttura. `excludeId` è la partita che si sta modificando o ripristinando.
 */
function validateDraft(data: AppData, d: MatchDraft, excludeId?: string): MatchDraft {
  if (!d.playerA || !d.playerB) throw new Error('Seleziona entrambi i giocatori')
  if (d.playerA === d.playerB) throw new Error('Un giocatore non può sfidare se stesso')
  const t = tournamentOf(data, d.tournamentId)
  if (!isValidScore(d.setsA, d.setsB, !!t)) {
    throw new Error(t ? 'Risultato non valido: al meglio dei 3 o dei 5 set' : 'Risultato non valido: al meglio dei 5 set (3-0, 3-1, 3-2)')
  }
  const date = t ? t.date : d.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida')
  if (t) {
    const err = tournamentMatchError(data, t, d, excludeId)
    if (err) throw new Error(err)
  }
  const setScores = d.setScores?.length ? d.setScores : undefined
  if (setScores) {
    const err = setScoresError(d.setsA, d.setsB, setScores)
    if (err) throw new Error(err)
  }
  return {
    ...d,
    date,
    tournamentId: t?.id,
    stage: t && hasGroups(t) ? d.stage : undefined,
    setScores,
    note: d.note?.trim() || undefined
  }
}

/**
 * Dopo ogni modifica alle partite di un torneo: se non gli resta nessuna partita lo elimina,
 * altrimenti tiene aggiornato il tabellone composto in automatico dai gironi.
 */
function syncTournament(data: AppData, tournamentId: string | undefined, dropIfEmpty = false): AppData {
  const t = tournamentId ? data.tournaments.find((x) => x.id === tournamentId && !x.deleted) : undefined
  if (!t) return data
  const now = nowISO()
  if (dropIfEmpty && !data.matches.some((m) => !m.deleted && m.tournamentId === t.id)) {
    return { ...data, tournaments: data.tournaments.map((x) => (x.id === t.id ? { ...x, deleted: true, updatedAt: now } : x)) }
  }
  const next = syncAutoDraw(data, t)
  if (next === t) return data
  return { ...data, tournaments: data.tournaments.map((x) => (x.id === t.id ? { ...next, updatedAt: now } : x)) }
}

export function addMatch(data: AppData, d: MatchDraft): { data: AppData; id: string } {
  const clean = validateDraft(data, d)
  const t = nowISO()
  const m: Match = { id: newId(), ...clean, createdAt: t, updatedAt: t }
  return { data: syncTournament({ ...data, matches: [...data.matches, m] }, m.tournamentId), id: m.id }
}

function winnerId(m: Pick<Match, 'playerA' | 'playerB' | 'setsA' | 'setsB'>) {
  return m.setsA > m.setsB ? m.playerA : m.playerB
}

/**
 * Modifica i dati di una partita. Il torneo non cambia; nei tornei con gironi o tabellone
 * restano fissi anche fase e giocatori (si correggono risultato, set e note).
 */
export function updateMatch(data: AppData, id: string, d: MatchDraft): AppData {
  const current = data.matches.find((m) => m.id === id)
  if (!current) throw new Error('Partita non trovata')
  const t = current.tournamentId ? tournamentOf(data, current.tournamentId) : undefined
  const locked = !!t && hasGroups(t)
  const draft: MatchDraft = {
    ...d,
    tournamentId: current.tournamentId,
    playerA: locked ? current.playerA : d.playerA,
    playerB: locked ? current.playerB : d.playerB,
    stage: locked ? current.stage : undefined,
    setScores: 'setScores' in d ? d.setScores : current.setScores
  }
  const clean = validateDraft(data, draft, id)
  if (t && winnerId(clean) !== winnerId(current)) {
    const dep = dependentMatch(data, t, current)
    if (dep) throw new Error('Il vincitore di questa partita ha già giocato il turno successivo: elimina prima quella partita')
  }
  return syncTournament(
    {
      ...data,
      matches: data.matches.map((m) => (m.id === id ? { ...m, ...clean, updatedAt: nowISO() } : m))
    },
    current.tournamentId
  )
}

export interface TournamentDraft {
  date: string
  name?: string
  k: number
  format?: TournamentFormat
  groups?: TournamentGroup[]
  bracketRounds?: number
  thirdPlace?: boolean
  draw?: (string | null)[]
  drawAuto?: boolean
}

function validateTournament(data: AppData, d: TournamentDraft, old?: Tournament): TournamentDraft {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Data del torneo non valida')
  if (!(d.k > 0)) throw new Error('Il fattore K del torneo deve essere maggiore di zero')
  const format = d.format ?? 'free'
  const base = { date: d.date, name: d.name?.trim() || undefined, k: d.k, format }
  const none = { groups: undefined, bracketRounds: undefined, thirdPlace: undefined, draw: undefined, drawAuto: undefined }
  let clean: TournamentDraft
  if (format === 'free') {
    clean = { ...base, ...none }
  } else {
    const groups = (d.groups ?? []).map((g) => ({ ...g, players: [...new Set(g.players)] }))
    if (format === 'groups-bracket' ? groups.length < 2 : groups.length !== 1) {
      throw new Error(format === 'groups-bracket' ? 'Servono almeno due gironi' : 'Il formato prevede un solo girone')
    }
    const seen = new Set<string>()
    const exists = new Set(data.players.filter((p) => !p.deleted).map((p) => p.id))
    for (const g of groups) {
      if (g.players.length < 2) throw new Error(`Il girone ${g.name} deve avere almeno due giocatori`)
      for (const p of g.players) {
        if (!exists.has(p)) throw new Error('Giocatore non trovato')
        if (seen.has(p)) throw new Error('Un giocatore può stare in un solo girone')
        seen.add(p)
      }
    }
    if (format === 'group') {
      clean = { ...base, ...none, groups }
    } else {
      const rounds = d.bracketRounds ?? 1
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_BRACKET_ROUNDS) throw new Error('Turno iniziale del tabellone non valido')
      const size = 2 ** rounds
      const draw = Array.from({ length: size }, (_, i) => d.draw?.[i] ?? null)
      clean = { ...base, groups, bracketRounds: rounds, thirdPlace: rounds >= 2 && !!d.thirdPlace, draw, drawAuto: !!d.drawAuto }
    }
  }
  const probe: Tournament = { ...(old ?? { id: '', createdAt: '', updatedAt: '' }), ...clean } as Tournament
  const err = tournamentStructureError(data, probe, old)
  if (err) throw new Error(err)
  return clean
}

export function addTournament(data: AppData, d: TournamentDraft): { data: AppData; id: string } {
  const t = nowISO()
  const tour: Tournament = { id: newId(), ...validateTournament(data, d), createdAt: t, updatedAt: t }
  return { data: { ...data, tournaments: [...data.tournaments, tour] }, id: tour.id }
}

/** Elimina un torneo senza partite (quelle eliminate restano nel cestino, senza torneo). */
export function deleteTournament(data: AppData, id: string): AppData {
  const t = nowISO()
  return {
    ...data,
    tournaments: data.tournaments.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: t } : x)),
    // Le sue partite vanno nel cestino con lui: escono dalla classifica ma si possono ancora recuperare.
    matches: data.matches.map((m) => (m.tournamentId === id && !m.deleted ? { ...m, deleted: true, updatedAt: t } : m))
  }
}

/** Aggiorna dati e struttura del torneo; se cambia la data, la cambia anche a tutte le sue partite. */
export function updateTournament(data: AppData, id: string, d: TournamentDraft): AppData {
  const old = data.tournaments.find((x) => x.id === id)
  if (!old) throw new Error('Torneo non trovato')
  const clean = validateTournament(data, d, old)
  const t = nowISO()
  return syncTournament(
    {
      ...data,
      tournaments: data.tournaments.map((x) => (x.id === id ? { ...x, ...clean, updatedAt: t } : x)),
      matches:
        old.date !== clean.date
          ? data.matches.map((m) => (m.tournamentId === id ? { ...m, date: clean.date, updatedAt: t } : m))
          : data.matches
    },
    id
  )
}

export function setMatchOverride(data: AppData, id: string, override: MatchOverride | undefined): AppData {
  return {
    ...data,
    matches: data.matches.map((m) => (m.id === id ? { ...m, override, updatedAt: nowISO() } : m))
  }
}

export function deleteMatch(data: AppData, id: string): AppData {
  const m = data.matches.find((x) => x.id === id)
  const t = m?.tournamentId ? data.tournaments.find((x) => x.id === m.tournamentId && !x.deleted) : undefined
  if (m && t && dependentMatch(data, t, m)) {
    throw new Error('Il vincitore di questa partita ha già giocato il turno successivo: elimina prima quella partita')
  }
  // Eliminata l'ultima partita di un torneo, se ne va anche il torneo.
  return syncTournament(
    {
      ...data,
      matches: data.matches.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: nowISO() } : x))
    },
    m?.tournamentId,
    true
  )
}

/**
 * Ripristina dal cestino, solo se la partita ha ancora posto (es. nel girone non è stata reinserita).
 * Se il suo torneo era stato eliminato, torna anche il torneo.
 */
export function restoreMatch(data: AppData, id: string): AppData {
  const m = data.matches.find((x) => x.id === id)
  if (!m) throw new Error('Partita non trovata')
  const now = nowISO()
  let next = data
  if (m.tournamentId) {
    const tour = data.tournaments.find((x) => x.id === m.tournamentId)
    if (!tour) throw new Error('Non si può ripristinare: il torneo non esiste più')
    if (tour.deleted) {
      next = { ...data, tournaments: data.tournaments.map((x) => (x.id === tour.id ? { ...x, deleted: false, updatedAt: now } : x)) }
    }
    try {
      validateDraft(next, m, id)
    } catch (e) {
      throw new Error(`Non si può ripristinare: ${(e as Error).message.replace(/^\w/, (c) => c.toLowerCase())}`)
    }
  }
  return syncTournament(
    {
      ...next,
      matches: next.matches.map((x) => (x.id === id ? { ...x, deleted: false, updatedAt: now } : x))
    },
    m.tournamentId
  )
}

/** Stagione e regolamento: niente valori che renderebbero la classifica senza senso. */
export function updateMeta(data: AppData, season: Season, settings: Settings): AppData {
  const name = season.name.trim()
  if (!name) throw new Error('Il nome della stagione è obbligatorio')
  const date = /^\d{4}-\d{2}-\d{2}$/
  if (!date.test(season.startDate) || !date.test(season.endDate)) throw new Error('Date della stagione non valide')
  if (season.startDate > season.endDate) throw new Error('La stagione non può finire prima di iniziare')
  const whole = (n: number) => Number.isInteger(n)
  if (!whole(settings.startRating) || settings.startRating <= 0) throw new Error('Il punteggio di partenza deve essere maggiore di zero')
  if (!(settings.k > 0)) throw new Error('Il fattore K deve essere maggiore di zero')
  if (!(settings.tournamentK > 0)) throw new Error('Il fattore K dei tornei deve essere maggiore di zero')
  if (!whole(settings.maxMatchesPerPair) || settings.maxMatchesPerPair < 1) throw new Error('Il massimo di partite per coppia deve essere almeno 1')
  if (!whole(settings.minMatchesPerPair) || settings.minMatchesPerPair < 0) throw new Error('La soglia di qualificazione non può essere negativa')
  if (settings.minMatchesPerPair > settings.maxMatchesPerPair) throw new Error('La soglia minima non può superare il limite massimo')
  if (!whole(settings.publishEveryDays) || settings.publishEveryDays < 1) throw new Error('I giorni tra le pubblicazioni devono essere almeno 1')
  return { ...data, season: { ...season, name }, settings, metaUpdatedAt: nowISO() }
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
