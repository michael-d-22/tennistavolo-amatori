import type { AppData, Match } from './types'

// Le esclusioni non vengono mai salvate: sono ricalcolate da zero a ogni modifica,
// così una correzione (o un giocatore riattivato) si riflette ovunque.

export type ExclusionKind = 'manual' | 'cap' | 'abandon'

export interface MatchEval {
  counted: boolean
  /** Presente se la partita è esclusa. */
  kind?: ExclusionKind
  reason?: string
  /** Contata perché forzata a mano dal responsabile. */
  forced?: boolean
  /** Numero progressivo della partita per questa coppia (1-based, escluse le manuali). */
  pairIndex?: number
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function isValidScore(setsA: number, setsB: number): boolean {
  const w = Math.max(setsA, setsB)
  const l = Math.min(setsA, setsB)
  return w === 3 && l >= 0 && l <= 2 && Number.isInteger(setsA) && Number.isInteger(setsB)
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
  const nameOf = new Map(data.players.map((p) => [p.id, p.name]))

  // 1) Override manuali "escludi" e tetto di partite per coppia.
  const pairCount = new Map<string, number>()
  for (const m of matches) {
    if (m.override?.mode === 'exclude') {
      result.set(m.id, { counted: false, kind: 'manual', reason: m.override.reason || 'Esclusa manualmente' })
      continue
    }
    const key = pairKey(m.playerA, m.playerB)
    const n = (pairCount.get(key) ?? 0) + 1
    pairCount.set(key, n)
    if (m.override?.mode === 'include') {
      result.set(m.id, { counted: true, forced: true, pairIndex: n })
    } else if (n > maxMatchesPerPair) {
      result.set(m.id, {
        counted: false,
        kind: 'cap',
        reason: `Oltre il limite di ${maxMatchesPerPair} partite con lo stesso avversario`,
        pairIndex: n
      })
    } else {
      result.set(m.id, { counted: true, pairIndex: n })
    }
  }

  // 2) Regola abbandoni: per ogni giocatore ritirato si tengono, con ciascun avversario,
  //    solo le prime N partite, dove N è il minimo di partite giocate con gli avversari affrontati.
  const retired = data.players
    .filter((p) => !p.deleted && p.status === 'retired')
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const x of retired) {
    const byOpponent = new Map<string, Match[]>()
    for (const m of matches) {
      if (!result.get(m.id)?.counted) continue
      const opp = m.playerA === x.id ? m.playerB : m.playerB === x.id ? m.playerA : null
      if (!opp) continue
      const list = byOpponent.get(opp) ?? []
      list.push(m)
      byOpponent.set(opp, list)
    }
    if (byOpponent.size === 0) continue
    const n = Math.min(...[...byOpponent.values()].map((l) => l.length))
    for (const list of byOpponent.values()) {
      list.slice(n).forEach((m) => {
        const ev = result.get(m.id)!
        if (ev.forced) return
        result.set(m.id, {
          ...ev,
          counted: false,
          kind: 'abandon',
          reason: `Abbandono di ${nameOf.get(x.id) ?? '?'}: contano solo le prime ${n} partite con ciascun avversario`
        })
      })
    }
  }

  return result
}

/** Partite che la regola abbandoni escluderebbe se il giocatore venisse segnato come ritirato. */
export function previewRetirement(data: AppData, playerId: string): { keepPerOpponent: number; excluded: Match[] } {
  const sim: AppData = {
    ...data,
    players: data.players.map((p) => (p.id === playerId ? { ...p, status: 'retired' } : p))
  }
  const ev = evaluateMatches(sim)
  const excluded = liveMatches(sim).filter((m) => ev.get(m.id)?.kind === 'abandon' && (m.playerA === playerId || m.playerB === playerId))
  const counts = new Map<string, number>()
  for (const m of liveMatches(sim)) {
    if (!ev.get(m.id)?.counted) continue
    if (m.playerA !== playerId && m.playerB !== playerId) continue
    const opp = m.playerA === playerId ? m.playerB : m.playerA
    counts.set(opp, (counts.get(opp) ?? 0) + 1)
  }
  return { keepPerOpponent: counts.size ? Math.min(...counts.values()) : 0, excluded }
}
