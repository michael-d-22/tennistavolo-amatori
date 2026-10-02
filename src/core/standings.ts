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
  /** Classifica provvisoria: come sarebbe pubblicando adesso (variazioni rispetto a quella ufficiale). */
  provisional: Standing[]
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

/** Pubblicazioni valide, nell'ordine in cui sono state fatte. */
export function liveSnapshots(data: AppData): Snapshot[] {
  return data.snapshots
    .filter((s) => !s.deleted)
    .sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1))
}

export function latestSnapshot(data: AppData): Snapshot | null {
  return liveSnapshots(data).at(-1) ?? null
}

type Stat = { played: number; wins: number; losses: number; setsWon: number; setsLost: number; excluded: number; last: ('V' | 'P')[] }
const newStat = (): Stat => ({ played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, excluded: 0, last: [] })

/**
 * Pubblicazione in cui entra una partita: la prima fatta dopo che la partita è stata inserita
 * e con data non precedente a quella della partita. `snaps.length` = non ancora pubblicata.
 */
function periodOf(m: Match, snaps: Snapshot[]): number {
  const i = snaps.findIndex((s) => m.date <= s.date && m.createdAt <= s.createdAt)
  return i < 0 ? snaps.length : i
}

// Come nella classifica FITET, i punti cambiano solo quando si pubblica. Ogni pubblicazione chiude un periodo:
// ci entrano le partite già inserite al momento della pubblicazione (con data fino a quella scelta), tutte
// calcolate con i punti della classifica in vigore; le variazioni si sommano alla pubblicazione. Una partita
// inserita dopo, anche se giocata prima, entra nella pubblicazione successiva.
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

  // Partite divise per periodo (l'ultimo è quello aperto), in ordine cronologico.
  const periods: Match[][] = Array.from({ length: snaps.length + 1 }, () => [])
  for (const m of matches) periods[periodOf(m, snaps)].push(m)

  const rating = new Map<string, number>()
  const history = new Map<string, HistoryPoint[]>()
  const stats = new Map<string, Stat>()
  for (const p of players) {
    rating.set(p.id, startRating)
    history.set(p.id, [{ date: p.joinedAt, rating: startRating }])
    stats.set(p.id, newStat())
  }
  const pairCounted = new Map<string, number>()
  const pairExcess = new Map<string, number>()
  // Partite per coppia già entrate in classifica: valgono per la qualificazione.
  const pairInRanking = new Map<string, number>()
  const resultById = new Map<string, MatchResult>()

  type Board = { snap: Snapshot; rating: Map<string, number>; position: Map<string, number> }
  const positions = () => {
    const order = [...active].sort(
      (a, b) => rating.get(b.id)! - rating.get(a.id)! || stats.get(b.id)!.wins - stats.get(a.id)!.wins || a.name.localeCompare(b.name, 'it')
    )
    return new Map(order.map((p, i) => [p.id, i + 1]))
  }
  const boards: Board[] = []

  /** Calcola le partite di un periodo sui punti in vigore e le somma alla classifica. */
  const runPeriod = (list: Match[], pending: boolean) => {
    const delta = new Map<string, number>()
    for (const m of list) {
      const ev = evals.get(m.id)!
      const key = pairKey(m.playerA, m.playerB)
      const ra = rating.get(m.playerA)!
      const rb = rating.get(m.playerB)!
      const mk = kOf(m)
      const sa = stats.get(m.playerA)!
      const sb = stats.get(m.playerB)!
      if (!ev.counted) {
        if (ev.kind === 'cap') pairExcess.set(key, (pairExcess.get(key) ?? 0) + 1)
        sa.excluded++
        sb.excluded++
        resultById.set(m.id, { match: m, eval: ev, deltaA: 0, ratingA: ra, ratingB: rb, k: mk, pending })
        continue
      }
      if (!m.tournamentId) {
        pairCounted.set(key, (pairCounted.get(key) ?? 0) + 1)
        pairInRanking.set(key, (pairInRanking.get(key) ?? 0) + 1)
      }
      const aWon = m.setsA > m.setsB
      const d = eloDelta(ra, rb, aWon, mk)
      delta.set(m.playerA, (delta.get(m.playerA) ?? 0) + d)
      delta.set(m.playerB, (delta.get(m.playerB) ?? 0) - d)
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
      resultById.set(m.id, { match: m, eval: ev, deltaA: d, ratingA: ra, ratingB: rb, k: mk, pending })
    }
    for (const [id, d] of delta) rating.set(id, rating.get(id)! + d)
  }

  /** Classifica dai punti attuali; con `compare`, variazioni e frecce rispetto a `prev` (o alla partenza). */
  const buildStandings = (prev: Board | null, compare: boolean): Standing[] => {
    const list: Standing[] = players.map((p) => {
      const s = stats.get(p.id)!
      const missing: MissingOpponent[] = []
      if (p.status === 'active') {
        for (const q of active) {
          if (q.id === p.id) continue
          const c = pairInRanking.get(pairKey(p.id, q.id)) ?? 0
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
    list.sort((a, b) => {
      const ra = a.player.status === 'retired' ? 1 : 0
      const rb = b.player.status === 'retired' ? 1 : 0
      if (ra !== rb) return ra - rb
      if (b.rating !== a.rating) return b.rating - a.rating
      if (b.wins !== a.wins) return b.wins - a.wins
      return a.player.name.localeCompare(b.player.name, 'it')
    })
    let pos = 0
    let off = 0
    for (const s of list) {
      if (s.player.status !== 'active') continue
      s.position = ++pos
      if (s.qualified) s.officialPosition = ++off
      if (!compare) continue
      s.deltaSincePublish = s.rating - (prev?.rating.get(s.player.id) ?? startRating)
      // Le frecce solo per chi era già in gruppo alla classifica di confronto.
      const prevPos = prev && s.player.joinedAt <= prev.snap.date ? prev.position.get(s.player.id) : undefined
      if (prevPos != null) s.positionChange = prevPos - s.position
    }
    return list
  }

  snaps.forEach((snap, i) => {
    runPeriod(periods[i], false)
    for (const p of players) if (p.joinedAt <= snap.date) history.get(p.id)!.push({ date: snap.date, rating: rating.get(p.id)! })
    boards.push({ snap, rating: new Map(rating), position: positions() })
  })
  const last = boards.at(-1) ?? null
  const prev = boards.at(-2) ?? null
  const standings = buildStandings(prev, !!last)

  // Provvisoria: come sarebbe se si pubblicassero adesso tutte le partite in attesa.
  runPeriod(periods[snaps.length], true)
  const provisional = buildStandings(last, true)

  const results = matches.map((m) => resultById.get(m.id)!)
  return {
    standings,
    provisional,
    results,
    resultById,
    history,
    pairCounted,
    pairExcess,
    lastSnapshot: last?.snap ?? null,
    previousSnapshot: prev?.snap ?? null,
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
