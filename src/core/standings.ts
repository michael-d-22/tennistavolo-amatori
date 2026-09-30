import { eloDelta } from './elo'
import { evaluateMatches, liveMatches, pairKey, type MatchEval } from './rules'
import type { AppData, Match, Player, Snapshot, Tournament } from './types'

export interface MissingOpponent {
  playerId: string
  name: string
  missing: number
}

export interface Standing {
  player: Player
  rating: number
  /** Posizione tra tutti i giocatori attivi (gli inattivi non hanno posizione). */
  position: number | null
  /** Posizione tra i soli qualificati. */
  officialPosition: number | null
  played: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  excludedMatches: number
  qualified: boolean
  missing: MissingOpponent[]
  /** Variazione rispetto alla classifica pubblicata precedente (alla prima, rispetto ai punti di partenza). */
  deltaSincePublish: number | null
  positionChange: number | null
  lastResults: ('V' | 'P')[]
}

export interface MatchResult {
  match: Match
  eval: MatchEval
  /** Variazione Elo per il giocatore A (B = -deltaA). 0 se non contata. */
  deltaA: number
  /** Punti con cui è calcolata: quelli della classifica in vigore quando è stata giocata. */
  ratingA: number
  ratingB: number
  /** Fattore K applicato (quello del torneo per le partite di torneo). */
  k: number
  /** Giocata dopo l'ultima pubblicazione: entrerà in classifica alla prossima. */
  pending: boolean
}

export interface HistoryPoint {
  date: string
  rating: number
}

export interface Computed {
  /** Classifica ufficiale: quella dell'ultima pubblicazione. */
  standings: Standing[]
  results: MatchResult[]
  resultById: Map<string, MatchResult>
  /** Punti di ciascun giocatore a ogni pubblicazione. */
  history: Map<string, HistoryPoint[]>
  /** Partite normali contate per coppia, comprese quelle non ancora pubblicate (i tornei sono fuori dai limiti). */
  pairCounted: Map<string, number>
  /** Partite in esubero (oltre il limite per coppia) per coppia. */
  pairExcess: Map<string, number>
  /** La pubblicazione della classifica in vigore. */
  lastSnapshot: Snapshot | null
  /** La pubblicazione prima di quella: riferimento per variazioni e frecce. */
  previousSnapshot: Snapshot | null
  /** Partite valide giocate dopo l'ultima pubblicazione. */
  pendingCount: number
}

/** Pubblicazioni valide, dalla più vecchia alla più recente. */
export function liveSnapshots(data: AppData): Snapshot[] {
  return data.snapshots
    .filter((s) => !s.deleted)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

export function latestSnapshot(data: AppData): Snapshot | null {
  return liveSnapshots(data).at(-1) ?? null
}

type Stat = { played: number; wins: number; losses: number; setsWon: number; setsLost: number; excluded: number; last: ('V' | 'P')[] }
const newStat = (): Stat => ({ played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, excluded: 0, last: [] })

// Come nella classifica FITET, i punti cambiano solo quando si pubblica. Ogni pubblicazione chiude un periodo:
// le partite con data fino a quella della pubblicazione (e dopo la precedente) si calcolano tutte con i punti
// della classifica in vigore, e le variazioni si sommano alla pubblicazione. Le partite successive all'ultima
// pubblicazione hanno già il loro valore, ma entrano in classifica solo alla prossima.
// Tutto è ricalcolato da zero: correggere una partita vecchia aggiorna anche le classifiche già pubblicate.
export function compute(data: AppData): Computed {
  const { startRating, k, tournamentK, minMatchesPerPair } = data.settings
  const tournamentKs = new Map(data.tournaments.filter((t) => !t.deleted).map((t) => [t.id, t.k]))
  const kOf = (m: Match) => (m.tournamentId ? (tournamentKs.get(m.tournamentId) ?? tournamentK) : k)
  const players = data.players.filter((p) => !p.deleted)
  const active = players.filter((p) => p.status === 'active')
  const evals = evaluateMatches(data)
  const matches = liveMatches(data)
  const snaps = liveSnapshots(data)
  const cutoffs = [...new Set(snaps.map((s) => s.date))]

  // `rating` e `stats` sono la classifica in vigore; `pending*` accumulano il periodo aperto.
  const rating = new Map<string, number>()
  const pendingDelta = new Map<string, number>()
  const history = new Map<string, HistoryPoint[]>()
  for (const p of players) {
    rating.set(p.id, startRating)
    pendingDelta.set(p.id, 0)
    history.set(p.id, [{ date: p.joinedAt, rating: startRating }])
  }
  const stats = new Map<string, Stat>(players.map((p) => [p.id, newStat()]))
  let pendingStats = new Map<string, Stat>(players.map((p) => [p.id, newStat()]))
  const pairCounted = new Map<string, number>()
  const pairExcess = new Map<string, number>()
  const pairOfficial = new Map<string, number>()
  let pairPending = new Map<string, number>()
  const results: MatchResult[] = []

  const positions = () => {
    const order = [...active].sort(
      (a, b) => rating.get(b.id)! - rating.get(a.id)! || stats.get(b.id)!.wins - stats.get(a.id)!.wins || a.name.localeCompare(b.name, 'it')
    )
    return new Map(order.map((p, i) => [p.id, i + 1]))
  }
  type Board = { date: string; rating: Map<string, number>; position: Map<string, number> }
  let board: Board | null = null
  let prevBoard: Board | null = null

  let next = 0
  const publish = (date: string) => {
    for (const p of players) {
      rating.set(p.id, rating.get(p.id)! + pendingDelta.get(p.id)!)
      pendingDelta.set(p.id, 0)
      const s = stats.get(p.id)!
      const q = pendingStats.get(p.id)!
      s.played += q.played
      s.wins += q.wins
      s.losses += q.losses
      s.setsWon += q.setsWon
      s.setsLost += q.setsLost
      s.excluded += q.excluded
      s.last.push(...q.last)
      if (p.joinedAt <= date) history.get(p.id)!.push({ date, rating: rating.get(p.id)! })
    }
    for (const [key, n] of pairPending) pairOfficial.set(key, (pairOfficial.get(key) ?? 0) + n)
    pendingStats = new Map(players.map((p) => [p.id, newStat()]))
    pairPending = new Map()
    prevBoard = board
    board = { date, rating: new Map(rating), position: positions() }
    next++
  }

  for (const m of matches) {
    while (next < cutoffs.length && m.date > cutoffs[next]) publish(cutoffs[next])
    const pending = next >= cutoffs.length
    const ev = evals.get(m.id)!
    const key = pairKey(m.playerA, m.playerB)
    const ra = rating.get(m.playerA)!
    const rb = rating.get(m.playerB)!
    const mk = kOf(m)
    if (!ev.counted) {
      if (ev.kind === 'cap') pairExcess.set(key, (pairExcess.get(key) ?? 0) + 1)
      pendingStats.get(m.playerA)!.excluded++
      pendingStats.get(m.playerB)!.excluded++
      results.push({ match: m, eval: ev, deltaA: 0, ratingA: ra, ratingB: rb, k: mk, pending })
      continue
    }
    if (!m.tournamentId) {
      pairCounted.set(key, (pairCounted.get(key) ?? 0) + 1)
      pairPending.set(key, (pairPending.get(key) ?? 0) + 1)
    }
    const aWon = m.setsA > m.setsB
    const d = eloDelta(ra, rb, aWon, mk)
    pendingDelta.set(m.playerA, pendingDelta.get(m.playerA)! + d)
    pendingDelta.set(m.playerB, pendingDelta.get(m.playerB)! - d)
    const sa = pendingStats.get(m.playerA)!
    const sb = pendingStats.get(m.playerB)!
    sa.played++
    sb.played++
    sa.setsWon += m.setsA
    sa.setsLost += m.setsB
    sb.setsWon += m.setsB
    sb.setsLost += m.setsA
    if (aWon) {
      sa.wins++
      sb.losses++
    } else {
      sb.wins++
      sa.losses++
    }
    sa.last.push(aWon ? 'V' : 'P')
    sb.last.push(aWon ? 'P' : 'V')
    results.push({ match: m, eval: ev, deltaA: d, ratingA: ra, ratingB: rb, k: mk, pending })
  }
  while (next < cutoffs.length) publish(cutoffs[next])

  const standings: Standing[] = players.map((p) => {
    const s = stats.get(p.id)!
    const missing: MissingOpponent[] = []
    if (p.status === 'active') {
      for (const q of active) {
        if (q.id === p.id) continue
        const c = pairOfficial.get(pairKey(p.id, q.id)) ?? 0
        if (c < minMatchesPerPair) missing.push({ playerId: q.id, name: q.name, missing: minMatchesPerPair - c })
      }
    }
    return {
      player: p,
      rating: rating.get(p.id)!,
      position: null,
      officialPosition: null,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      excludedMatches: s.excluded,
      qualified: p.status === 'active' && missing.length === 0,
      missing,
      deltaSincePublish: null,
      positionChange: null,
      lastResults: s.last.slice(-5)
    }
  })

  standings.sort((a, b) => {
    const ra = a.player.status === 'retired' ? 1 : 0
    const rb = b.player.status === 'retired' ? 1 : 0
    if (ra !== rb) return ra - rb
    if (b.rating !== a.rating) return b.rating - a.rating
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.player.name.localeCompare(b.player.name, 'it')
  })
  const prev = prevBoard as Board | null
  let pos = 0
  let off = 0
  for (const s of standings) {
    if (s.player.status !== 'active') continue
    s.position = ++pos
    if (s.qualified) s.officialPosition = ++off
    if (!board) continue
    s.deltaSincePublish = s.rating - (prev?.rating.get(s.player.id) ?? startRating)
    // Le frecce solo per chi era già in gruppo alla pubblicazione precedente.
    const prevPos = prev && s.player.joinedAt <= prev.date ? prev.position.get(s.player.id) : undefined
    if (prevPos != null) s.positionChange = prevPos - s.position
  }

  return {
    standings,
    results,
    resultById: new Map(results.map((r) => [r.match.id, r])),
    history,
    pairCounted,
    pairExcess,
    lastSnapshot: snaps.at(-1) ?? null,
    previousSnapshot: [...snaps].reverse().find((s) => s.date === prev?.date) ?? null,
    pendingCount: results.filter((r) => r.pending && r.eval.counted).length
  }
}

/**
 * Simula l'inserimento di una partita e restituisce come verrebbe valutata.
 * `tournament` è un torneo non ancora salvato (il primo inserimento di un torneo nuovo).
 */
export function previewMatch(
  data: AppData,
  draft: Pick<Match, 'playerA' | 'playerB' | 'setsA' | 'setsB' | 'date' | 'tournamentId'>,
  tournament?: Tournament
): MatchResult | null {
  const now = new Date().toISOString()
  const temp: Match = { ...draft, id: '~preview', createdAt: now, updatedAt: now }
  const tournaments = tournament ? [...data.tournaments.filter((t) => t.id !== tournament.id), tournament] : data.tournaments
  const c = compute({ ...data, tournaments, matches: [...data.matches, temp] })
  return c.resultById.get(temp.id) ?? null
}
