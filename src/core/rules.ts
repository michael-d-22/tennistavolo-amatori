import type { AppData, Match } from './types'

// Le esclusioni non vengono mai salvate: sono ricalcolate da zero a ogni modifica,
// così una correzione (o un giocatore riattivato) si riflette ovunque.

export type ExclusionKind = 'manual' | 'cap' | 'inactive'

export interface MatchEval {
  counted: boolean
  /** Presente se la partita è esclusa. */
  kind?: ExclusionKind
  reason?: string
  /** Contata perché forzata a mano dal responsabile. */
  forced?: boolean
  /** Numero progressivo della partita per questa coppia (1-based, escluse manuali e tornei). */
  pairIndex?: number
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Al meglio dei 5 set (3-0, 3-1, 3-2); nei tornei anche al meglio dei 3 (2-0, 2-1). */
export function isValidScore(setsA: number, setsB: number, allowBestOf3 = false): boolean {
  if (!Number.isInteger(setsA) || !Number.isInteger(setsB)) return false
  const w = Math.max(setsA, setsB)
  const l = Math.min(setsA, setsB)
  if (w === 3) return l >= 0 && l <= 2
  return allowBestOf3 && w === 2 && l >= 0 && l <= 1
}

export function compareMatches(x: Match, y: Match): number {
  if (x.date !== y.date) return x.date < y.date ? -1 : 1
  if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? -1 : 1
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
}

/** Partite valide (non cancellate, giocatori esistenti) in ordine cronologico. */
export function liveMatches(data: AppData): Match[] {
  const players = new Set(data.players.filter((p) => !p.deleted).map((p) => p.id))
  return data.matches
    .filter((m) => !m.deleted && players.has(m.playerA) && players.has(m.playerB) && m.playerA !== m.playerB)
    .sort(compareMatches)
}

export function evaluateMatches(data: AppData): Map<string, MatchEval> {
  const { maxMatchesPerPair } = data.settings
  const matches = liveMatches(data)
  const result = new Map<string, MatchEval>()
  const inactive = new Map(data.players.filter((p) => !p.deleted && p.status === 'retired').map((p) => [p.id, p.name]))

  // Le partite di torneo non occupano posti del tetto per coppia.
  const pairCount = new Map<string, number>()
  for (const m of matches) {
    if (m.override?.mode === 'exclude') {
      result.set(m.id, { counted: false, kind: 'manual', reason: m.override.reason || 'Esclusa manualmente' })
      continue
    }
    let pairIndex: number | undefined
    if (!m.tournamentId) {
      const key = pairKey(m.playerA, m.playerB)
      pairIndex = (pairCount.get(key) ?? 0) + 1
      pairCount.set(key, pairIndex)
    }
    if (m.override?.mode === 'include') {
      result.set(m.id, { counted: true, forced: true, pairIndex })
      continue
    }
    // Giocatore inattivo: la partita resta salvata ma è in pausa finché non torna attivo.
    const paused = inactive.get(m.playerA) ?? inactive.get(m.playerB)
    if (paused !== undefined) {
      result.set(m.id, { counted: false, kind: 'inactive', reason: `In pausa: ${paused} è inattivo`, pairIndex })
    } else if (pairIndex !== undefined && pairIndex > maxMatchesPerPair) {
      result.set(m.id, {
        counted: false,
        kind: 'cap',
        reason: `Oltre il limite di ${maxMatchesPerPair} partite con lo stesso avversario`,
        pairIndex
      })
    } else {
      result.set(m.id, { counted: true, pairIndex })
    }
  }

  return result
}

/** Partite che verrebbero messe in pausa se il giocatore diventasse inattivo. */
export function previewInactive(data: AppData, playerId: string): Match[] {
  const ev = evaluateMatches(data)
  return liveMatches(data).filter((m) => (m.playerA === playerId || m.playerB === playerId) && ev.get(m.id)?.counted && !ev.get(m.id)?.forced)
}
