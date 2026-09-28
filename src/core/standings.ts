import { eloDelta } from './elo'
import { evaluateMatches, liveMatches, pairKey, type MatchEval } from './rules'
import type { AppData, Match, Player, Snapshot } from './types'

export interface MissingOpponent {
  playerId: string
  name: string
  missing: number
}

export interface Standing {
  player: Player
  rating: number
  /** Posizione tra tutti i giocatori attivi (i ritirati non hanno posizione). */
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
  /** Variazione rispetto all'ultima classifica pubblicata. */
  deltaSincePublish: number | null
  positionChange: number | null
  lastResults: ('V' | 'P')[]
}

export interface MatchResult {
  match: Match
  eval: MatchEval
  /** Variazione Elo per il giocatore A (B = -deltaA). 0 se non contata. */
  deltaA: number
  ratingA: number
  ratingB: number
}

export interface HistoryPoint {
  date: string
  rating: number
  matchId?: string
}

export interface Computed {
  standings: Standing[]
  results: MatchResult[]
  resultById: Map<string, MatchResult>
  history: Map<string, HistoryPoint[]>
  /** Partite contate per coppia. */
  pairCounted: Map<string, number>
  /** Tutte le partite (anche escluse) per coppia. */
  pairTotal: Map<string, number>
  lastSnapshot: Snapshot | null
}

export function latestSnapshot(data: AppData): Snapshot | null {
  const list = data.snapshots.filter((s) => !s.deleted)
  if (!list.length) return null
  return list.reduce((a, b) => (a.date > b.date || (a.date === b.date && a.createdAt > b.createdAt) ? a : b))
}

export function compute(data: AppData): Computed {
  const { startRating, k, minMatchesPerPair } = data.settings
  const players = data.players.filter((p) => !p.deleted)
  const evals = evaluateMatches(data)
  const matches = liveMatches(data)

  const rating = new Map<string, number>()
  const history = new Map<string, HistoryPoint[]>()
  for (const p of players) {
    rating.set(p.id, startRating)
    history.set(p.id, [{ date: p.joinedAt, rating: startRating }])
  }

  type Stat = { played: number; wins: number; losses: number; setsWon: number; setsLost: number; excluded: number; last: ('V' | 'P')[] }
  const stats = new Map<string, Stat>(
    players.map((p) => [p.id, { played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, excluded: 0, last: [] }])
  )
  const pairCounted = new Map<string, number>()
  const pairTotal = new Map<string, number>()
  const results: MatchResult[] = []

  for (const m of matches) {
    const ev = evals.get(m.id)!
    const key = pairKey(m.playerA, m.playerB)
    pairTotal.set(key, (pairTotal.get(key) ?? 0) + 1)
    const ra = rating.get(m.playerA)!
    const rb = rating.get(m.playerB)!
    if (!ev.counted) {
      stats.get(m.playerA)!.excluded++
      stats.get(m.playerB)!.excluded++
      results.push({ match: m, eval: ev, deltaA: 0, ratingA: ra, ratingB: rb })
      continue
    }
    pairCounted.set(key, (pairCounted.get(key) ?? 0) + 1)
    const aWon = m.setsA > m.setsB
    const d = eloDelta(ra, rb, aWon, k)
    rating.set(m.playerA, ra + d)
    rating.set(m.playerB, rb - d)
    history.get(m.playerA)!.push({ date: m.date, rating: ra + d, matchId: m.id })
    history.get(m.playerB)!.push({ date: m.date, rating: rb - d, matchId: m.id })
    const sa = stats.get(m.playerA)!
    const sb = stats.get(m.playerB)!
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
    results.push({ match: m, eval: ev, deltaA: d, ratingA: ra, ratingB: rb })
  }

  const active = players.filter((p) => p.status === 'active')
  const snap = latestSnapshot(data)
  const snapRows = new Map(snap?.rows.map((r) => [r.playerId, r]) ?? [])

  const standings: Standing[] = players.map((p) => {
    const s = stats.get(p.id)!
    const missing: MissingOpponent[] = []
    if (p.status === 'active') {
      for (const q of active) {
        if (q.id === p.id) continue
        const c = pairCounted.get(pairKey(p.id, q.id)) ?? 0
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
  let pos = 0
  let off = 0
  for (const s of standings) {
    if (s.player.status !== 'active') continue
    s.position = ++pos
    if (s.qualified) s.officialPosition = ++off
    const prev = snapRows.get(s.player.id)
    if (prev) {
      s.deltaSincePublish = s.rating - prev.rating
      s.positionChange = prev.position - s.position
    }
  }

  return {
    standings,
    results,
    resultById: new Map(results.map((r) => [r.match.id, r])),
    history,
    pairCounted,
    pairTotal,
    lastSnapshot: snap
  }
}

/** Simula l'inserimento di una partita e restituisce come verrebbe valutata. */
export function previewMatch(data: AppData, draft: Pick<Match, 'playerA' | 'playerB' | 'setsA' | 'setsB' | 'date'>): MatchResult | null {
  const now = new Date().toISOString()
  const temp: Match = { ...draft, id: '~preview', createdAt: now, updatedAt: now }
  const c = compute({ ...data, matches: [...data.matches, temp] })
  return c.resultById.get(temp.id) ?? null
}
