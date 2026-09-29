import { tournamentLabel } from './format'
import { compareMatches, pairKey } from './rules'
import { BYE, type AppData, type Match, type MatchStage, type Tournament, type TournamentFormat, type TournamentGroup } from './types'

// Struttura dei tornei: gironi all'italiana e tabellone a eliminazione diretta.
// Il torneo salva solo gironi, formato e accoppiamenti del primo turno: chi avanza nel tabellone,
// le classifiche dei gironi e il podio sono ricalcolati ogni volta dalle partite.

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  free: 'Formato libero',
  group: 'Girone unico',
  'group-bracket': 'Girone unico + tabellone',
  'groups-bracket': 'Più gironi + tabellone'
}

const ROUND_LABELS = ['', 'Finale', 'Semifinali', 'Quarti di finale', 'Ottavi di finale', 'Sedicesimi di finale']
const ROUND_SINGULAR = ['', 'Finale', 'Semifinale', 'Quarto di finale', 'Ottavo di finale', 'Sedicesimo di finale']
export const MAX_BRACKET_ROUNDS = 5

export function formatOf(t: Pick<Tournament, 'format'>): TournamentFormat {
  return t.format ?? 'free'
}

export function hasGroups(t: Pick<Tournament, 'format'>): boolean {
  return formatOf(t) !== 'free'
}

export function hasBracket(t: Pick<Tournament, 'format'>): boolean {
  const f = formatOf(t)
  return f === 'group-bracket' || f === 'groups-bracket'
}

export function roundLabel(round: number, singular = false): string {
  return (singular ? ROUND_SINGULAR : ROUND_LABELS)[round] ?? `Turno ${round}`
}

function roundsOf(t: Tournament): number {
  return Math.min(MAX_BRACKET_ROUNDS, Math.max(1, t.bracketRounds ?? 1))
}

// ---------- Fasi ----------

/** Fase del torneo senza la posizione nel tabellone: è quella che si sceglie nell'inserimento. */
export type Phase = { type: 'group'; group: string } | { type: 'bracket'; round: number } | { type: 'third' }

export function samePhase(a: Phase | MatchStage | undefined, b: Phase | MatchStage | undefined): boolean {
  if (!a || !b) return !a && !b
  if (a.type !== b.type) return false
  if (a.type === 'group' && b.type === 'group') return a.group === b.group
  if (a.type === 'bracket' && b.type === 'bracket') return a.round === b.round
  return true
}

/** Fasi in cui si possono inserire partite, nell'ordine in cui si giocano. */
export function phasesOf(t: Tournament): Phase[] {
  const out: Phase[] = (hasGroups(t) ? (t.groups ?? []) : []).map((g) => ({ type: 'group', group: g.id }))
  if (hasBracket(t)) {
    for (let r = roundsOf(t); r >= 1; r--) {
      if (r === 1 && t.thirdPlace) out.push({ type: 'third' })
      out.push({ type: 'bracket', round: r })
    }
  }
  return out
}

export function stageLabel(t: Tournament | undefined, stage: Phase | MatchStage | undefined): string {
  if (!stage) return ''
  if (stage.type === 'group') {
    const g = t?.groups?.find((x) => x.id === stage.group)
    return g ? `Girone ${g.name}` : 'Girone'
  }
  if (stage.type === 'third') return 'Finale 3º posto'
  return roundLabel(stage.round, true)
}

/** Nomi dei gironi: A, B, C… */
export function groupName(i: number): string {
  return String.fromCharCode(65 + i)
}

export function tournamentMatches(data: AppData, id: string): Match[] {
  const players = new Set(data.players.filter((p) => !p.deleted).map((p) => p.id))
  return data.matches
    .filter((m) => !m.deleted && m.tournamentId === id && players.has(m.playerA) && players.has(m.playerB))
    .sort(compareMatches)
}

/** Giocatori del torneo: quelli dei gironi (nei tornei liberi, chi ha giocato). */
export function participantsOf(data: AppData, t: Tournament): string[] {
  if (hasGroups(t)) return [...new Set((t.groups ?? []).flatMap((g) => g.players))]
  const ids = new Set<string>()
  for (const m of tournamentMatches(data, t.id)) {
    ids.add(m.playerA)
    ids.add(m.playerB)
  }
  return [...ids]
}

/**
 * Controlla i punteggi dei set (a 11, con 2 punti di scarto ai vantaggi)
 * e che siano coerenti con il risultato. Restituisce un messaggio d'errore o null.
 */
export function setScoresError(setsA: number, setsB: number, scores: [number, number][]): string | null {
  if (scores.length !== setsA + setsB) return `Servono i punteggi di ${setsA + setsB} set`
  let wa = 0
  let wb = 0
  for (const [i, [a, b]] of scores.entries()) {
    const n = i + 1
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return `Set ${n}: punteggio non valido`
    const w = Math.max(a, b)
    const l = Math.min(a, b)
    if (w < 11 || w - l < 2 || (w > 11 && w - l !== 2)) return `Set ${n}: ${a}-${b} non è un punteggio possibile`
    if (a > b) wa++
    else wb++
  }
  if (wa !== setsA || wb !== setsB) return `I set inseriti danno ${wa}-${wb}, ma il risultato è ${setsA}-${setsB}`
  return null
}

// ---------- Gironi ----------

export interface GroupRow {
  playerId: string
  position: number
  played: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  pointsWon: number
  pointsLost: number
}

function tally(ids: string[], matches: Match[]): Map<string, GroupRow> {
  const rows = new Map<string, GroupRow>(
    ids.map((id) => [id, { playerId: id, position: 0, played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0 }])
  )
  for (const m of matches) {
    const a = rows.get(m.playerA)
    const b = rows.get(m.playerB)
    if (!a || !b) continue
    const aWon = m.setsA > m.setsB
    a.played++
    b.played++
    ;(aWon ? a : b).wins++
    ;(aWon ? b : a).losses++
    a.setsWon += m.setsA
    a.setsLost += m.setsB
    b.setsWon += m.setsB
    b.setsLost += m.setsA
    for (const [pa, pb] of m.setScores ?? []) {
      a.pointsWon += pa
      a.pointsLost += pb
      b.pointsWon += pb
      b.pointsLost += pa
    }
  }
  return rows
}

/**
 * Ordine del girone: vittorie; a parità, classifica avulsa tra i pari merito
 * (vittorie, differenza set, differenza punti negli scontri tra loro), poi differenza set e punti totali.
 */
export function groupStandings(group: TournamentGroup, matches: Match[], nameOf: (id: string) => string): GroupRow[] {
  const all = tally(group.players, matches)
  const byWins = new Map<number, GroupRow[]>()
  for (const r of all.values()) byWins.set(r.wins, [...(byWins.get(r.wins) ?? []), r])
  const out: GroupRow[] = []
  for (const w of [...byWins.keys()].sort((x, y) => y - x)) {
    const tied = byWins.get(w)!
    const ids = new Set(tied.map((r) => r.playerId))
    const mini = tally(
      [...ids],
      matches.filter((m) => ids.has(m.playerA) && ids.has(m.playerB))
    )
    tied.sort((x, y) => {
      const mx = mini.get(x.playerId)!
      const my = mini.get(y.playerId)!
      return (
        my.wins - mx.wins ||
        my.setsWon - my.setsLost - (mx.setsWon - mx.setsLost) ||
        my.pointsWon - my.pointsLost - (mx.pointsWon - mx.pointsLost) ||
        y.setsWon - y.setsLost - (x.setsWon - x.setsLost) ||
        y.pointsWon - y.pointsLost - (x.pointsWon - x.pointsLost) ||
        nameOf(x.playerId).localeCompare(nameOf(y.playerId), 'it')
      )
    })
    out.push(...tied)
  }
  out.forEach((r, i) => (r.position = i + 1))
  return out
}

function groupMatches(matches: Match[], groupId: string): Match[] {
  return matches.filter((m) => m.stage?.type === 'group' && m.stage.group === groupId)
}

/** Coppie del girone che non si sono ancora affrontate. */
export function remainingPairs(group: TournamentGroup, matches: Match[]): [string, string][] {
  const played = new Set(groupMatches(matches, group.id).map((m) => pairKey(m.playerA, m.playerB)))
  const out: [string, string][] = []
  const ps = group.players
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) if (!played.has(pairKey(ps[i], ps[j]))) out.push([ps[i], ps[j]])
  return out
}

// ---------- Tabellone ----------

export interface BracketNode {
  round: number
  slot: number
  /** Giocatore, BYE (passa il turno) oppure null se non ancora noto. */
  a: string | null
  b: string | null
  match: Match | null
  winner: string | null
  loser: string | null
}

export interface Bracket {
  /** Dal primo turno alla finale. */
  rounds: BracketNode[][]
  /** Finale per il 3º posto: null se non prevista o impossibile (una semifinale vinta con la X). */
  third: BracketNode | null
}

const winnerOf = (m: Match) => (m.setsA > m.setsB ? m.playerA : m.playerB)
const loserOf = (m: Match) => (m.setsA > m.setsB ? m.playerB : m.playerA)
const samePlayers = (m: Match, a: string, b: string) => (m.playerA === a && m.playerB === b) || (m.playerA === b && m.playerB === a)

export function isBye(n: BracketNode): boolean {
  return n.a === BYE || n.b === BYE
}

/** Partita effettivamente da giocare: due giocatori noti, nessuna X. */
export function isPlayable(n: BracketNode): boolean {
  return !!n.a && !!n.b && !isBye(n)
}

export function drawOf(t: Tournament): (string | null)[] {
  return Array.from({ length: 2 ** roundsOf(t) }, (_, i) => t.draw?.[i] ?? null)
}

export function buildBracket(t: Tournament, matches: Match[]): Bracket {
  const R = roundsOf(t)
  const draw = drawOf(t)
  const bm = matches.filter((m) => m.stage?.type === 'bracket')

  const resolve = (n: BracketNode) => {
    if (isBye(n)) {
      const p = n.a === BYE ? n.b : n.a
      n.winner = p && p !== BYE ? p : null
      return
    }
    if (!n.a || !n.b) return
    const m = bm.find((x) => x.stage?.type === 'bracket' && x.stage.round === n.round && x.stage.slot === n.slot && samePlayers(x, n.a!, n.b!))
    if (m) {
      n.match = m
      n.winner = winnerOf(m)
      n.loser = loserOf(m)
    }
  }

  const rounds: BracketNode[][] = []
  let prev: BracketNode[] | null = null
  for (let r = R; r >= 1; r--) {
    const nodes: BracketNode[] = Array.from({ length: 2 ** (r - 1) }, (_, slot) => {
      const n: BracketNode = {
        round: r,
        slot,
        a: prev ? prev[2 * slot].winner : draw[2 * slot],
        b: prev ? prev[2 * slot + 1].winner : draw[2 * slot + 1],
        match: null,
        winner: null,
        loser: null
      }
      resolve(n)
      return n
    })
    rounds.push(nodes)
    prev = nodes
  }

  let third: BracketNode | null = null
  const semis = rounds.find((r) => r[0]?.round === 2)
  if (t.thirdPlace && semis && !semis.some(isBye)) {
    third = { round: 0, slot: 0, a: semis[0].loser, b: semis[1].loser, match: null, winner: null, loser: null }
    if (third.a && third.b) {
      const m = matches.find((x) => x.stage?.type === 'third' && samePlayers(x, third!.a!, third!.b!))
      if (m) {
        third.match = m
        third.winner = winnerOf(m)
        third.loser = loserOf(m)
      }
    }
  }
  return { rounds, third }
}

/** Nodo del tabellone corrispondente a una fase (con posto per i turni ad eliminazione). */
function nodeFor(b: Bracket, stage: MatchStage): BracketNode | null {
  if (stage.type === 'third') return b.third
  if (stage.type !== 'bracket') return null
  return b.rounds.find((r) => r[0]?.round === stage.round)?.[stage.slot] ?? null
}

/** Partite del tabellone da giocare adesso in una fase. */
export function pendingNodes(b: Bracket, phase: Phase): BracketNode[] {
  if (phase.type === 'third') return b.third && isPlayable(b.third) && !b.third.match ? [b.third] : []
  if (phase.type !== 'bracket') return []
  return (b.rounds.find((r) => r[0]?.round === phase.round) ?? []).filter((n) => isPlayable(n) && !n.match)
}

export function stageOfNode(n: BracketNode): MatchStage {
  return n.round === 0 ? { type: 'third' } : { type: 'bracket', round: n.round, slot: n.slot }
}

// ---------- Composizione automatica del tabellone ----------

/** Tutti i gironi hanno giocato tutte le partite. */
export function groupsComplete(t: Tournament, matches: Match[]): boolean {
  const groups = hasGroups(t) ? (t.groups ?? []) : []
  return groups.length > 0 && groups.every((g) => remainingPairs(g, matches).length === 0)
}

/** Ordine delle teste di serie nei posti del tabellone: 1-8, 4-5, 2-7, 3-6… (le prime due si incontrano solo in finale). */
export function seedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order.slice(0, size)
}

/**
 * Accoppiamenti del primo turno composti dai gironi: prima tutti i primi classificati, poi i secondi e così via
 * (a parità di posizione conta chi ha fatto meglio: vittorie, set e punti in proporzione alle partite giocate).
 * Entrano nel tabellone i migliori fino a riempirlo; se i posti avanzano, la X va alle teste di serie più alte.
 * Dove possibile, al primo turno non si affrontano due giocatori dello stesso girone.
 */
export function autoDraw(data: AppData, t: Tournament): (string | null)[] {
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const matches = tournamentMatches(data, t.id)
  const size = 2 ** roundsOf(t)
  type Seed = { id: string; group: string; pos: number; score: number[] }
  const all: Seed[] = []
  for (const g of t.groups ?? []) {
    for (const r of groupStandings(g, groupMatches(matches, g.id), nameOf)) {
      const n = Math.max(1, r.played)
      all.push({
        id: r.playerId,
        group: g.id,
        pos: r.position,
        score: [r.wins / n, (r.setsWon - r.setsLost) / n, (r.pointsWon - r.pointsLost) / n]
      })
    }
  }
  all.sort(
    (x, y) =>
      x.pos - y.pos ||
      y.score[0] - x.score[0] ||
      y.score[1] - x.score[1] ||
      y.score[2] - x.score[2] ||
      nameOf(x.id).localeCompare(nameOf(y.id), 'it')
  )
  const seeds = all.slice(0, size)
  const order = seedOrder(size)
  const slots: (Seed | null)[] = order.map((s) => seeds[s - 1] ?? null)

  // Evita gli scontri tra compagni di girone al primo turno scambiando giocatori con la stessa posizione.
  const clash = (i: number) => {
    const x = slots[2 * i]
    const y = slots[2 * i + 1]
    return !!x && !!y && x.group === y.group
  }
  const pairs = size / 2
  for (let i = 0; i < pairs; i++) {
    if (!clash(i)) continue
    for (let j = 0; j < pairs && clash(i); j++) {
      if (j === i) continue
      for (const side of [1, 0]) {
        const a = 2 * i + 1
        const b = 2 * j + side
        const sa = slots[a]
        const sb = slots[b]
        if (!sa || !sb || sa.pos !== sb.pos) continue
        ;[slots[a], slots[b]] = [sb, sa]
        if (!clash(i) && !clash(j)) break
        ;[slots[a], slots[b]] = [sa, sb]
      }
    }
  }
  return slots.map((s) => (s ? s.id : BYE))
}

/**
 * Tiene aggiornato il tabellone composto dall'app: a gironi completati lo compone, se i risultati dei gironi
 * cambiano lo ricompone, se un girone torna incompleto lo svuota. Non tocca accoppiamenti scelti a mano
 * né un tabellone già iniziato.
 */
export function syncAutoDraw(data: AppData, t: Tournament): Tournament {
  if (!hasBracket(t)) return t
  const matches = tournamentMatches(data, t.id)
  if (matches.some((m) => m.stage?.type === 'bracket' || m.stage?.type === 'third')) return t
  const empty = drawOf(t).every((p) => p === null)
  if (!t.drawAuto && !empty) return t
  if (groupsComplete(t, matches)) {
    const draw = autoDraw(data, t)
    if (t.drawAuto && JSON.stringify(draw) === JSON.stringify(t.draw)) return t
    return { ...t, draw, drawAuto: true }
  }
  if (t.drawAuto) return { ...t, draw: drawOf(t).map(() => null), drawAuto: false }
  return t
}

// ---------- Controlli ----------

/**
 * Controlla che una partita possa stare nel torneo: nel girone ogni coppia gioca una volta sola,
 * nel tabellone solo le partite previste, una volta sola e mai per chi passa il turno con la X.
 * `excludeId`: la partita che si sta modificando. Restituisce un messaggio d'errore o null.
 */
export function tournamentMatchError(
  data: AppData,
  t: Tournament,
  d: { playerA: string; playerB: string; stage?: MatchStage },
  excludeId?: string
): string | null {
  if (!hasGroups(t)) return null
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const matches = tournamentMatches(data, t.id).filter((m) => m.id !== excludeId)
  const stage = d.stage
  if (!stage || !phasesOf(t).some((p) => samePhase(p, stage))) return 'Scegli la fase del torneo (girone o turno del tabellone)'

  if (stage.type === 'group') {
    const g = t.groups!.find((x) => x.id === stage.group)!
    for (const p of [d.playerA, d.playerB]) if (!g.players.includes(p)) return `${name(p)} non fa parte del girone ${g.name}`
    if (groupMatches(matches, g.id).some((m) => samePlayers(m, d.playerA, d.playerB))) {
      return `${name(d.playerA)} e ${name(d.playerB)} si sono già affrontati nel girone ${g.name}`
    }
    return null
  }

  const bracket = buildBracket(t, matches)
  if (stage.type === 'third' && !bracket.third) return 'La finale per il 3º posto non si gioca: una semifinale è stata vinta con la X'
  if (stage.type === 'bracket' && !Number.isInteger(stage.slot)) return 'Scegli quale partita del turno stai inserendo'
  const node = nodeFor(bracket, stage)
  if (!node) return 'Questa partita non è prevista nel tabellone'
  if (isBye(node)) {
    const p = node.a === BYE ? node.b : node.a
    return `${p && p !== BYE ? name(p) : 'Il giocatore'} passa il turno con la X: non ci sono risultati da inserire`
  }
  if (!node.a || !node.b) return 'Questa partita non è ancora definita: mancano i risultati del turno precedente o gli accoppiamenti'
  if (node.match) return `${stageLabel(t, stage)} tra ${name(node.a)} e ${name(node.b)} già inserita`
  if (!samePlayers({ playerA: d.playerA, playerB: d.playerB } as Match, node.a, node.b)) {
    return `Nel tabellone questa partita è ${name(node.a)} contro ${name(node.b)}`
  }
  return null
}

/**
 * Partita del tabellone che dipende dal risultato di `m` (quella del turno successivo, o la finale
 * per il 3º posto per le semifinali), se già giocata. Cambiarne il vincitore o eliminarla la renderebbe incoerente.
 */
export function dependentMatch(data: AppData, t: Tournament, m: Match): Match | null {
  if (!hasBracket(t) || m.stage?.type !== 'bracket') return null
  const bracket = buildBracket(t, tournamentMatches(data, t.id))
  const { round, slot } = m.stage
  const next = round > 1 ? bracket.rounds.find((r) => r[0]?.round === round - 1)?.[Math.floor(slot / 2)] : null
  if (next?.match) return next.match
  if (round === 2 && bracket.third?.match) return bracket.third.match
  return null
}

/**
 * Controlla la struttura del torneo: accoppiamenti validi e, se ci sono già partite,
 * che la nuova struttura non le renda impossibili. Restituisce un messaggio d'errore o null.
 */
export function tournamentStructureError(data: AppData, next: Tournament, old?: Tournament): string | null {
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const participants = new Set((next.groups ?? []).flatMap((g) => g.players))

  if (hasBracket(next)) {
    const R = next.bracketRounds ?? 1
    if (participants.size <= 2 ** (R - 1)) {
      return `Per un tabellone da ${2 ** R} posti (${roundLabel(R).toLowerCase()}) servono almeno ${2 ** (R - 1) + 1} partecipanti`
    }
    const draw = next.draw ?? []
    if (draw.length !== 2 ** R) return 'Accoppiamenti del tabellone non validi'
    const seen = new Set<string>()
    for (const p of draw) {
      if (p === null || p === BYE) continue
      if (!participants.has(p)) return `${name(p)} è nel tabellone ma non partecipa al torneo`
      if (seen.has(p)) return `${name(p)} compare due volte nel tabellone`
      seen.add(p)
    }
    for (let i = 0; i < draw.length; i += 2) {
      if (draw[i] === BYE && draw[i + 1] === BYE) return `Partita ${i / 2 + 1} del primo turno: due X, manca almeno un giocatore`
      if (R === 1 && (draw[i] === BYE || draw[i + 1] === BYE)) return 'In finale non si può passare il turno con la X'
    }
  }

  if (!old) return null
  const matches = tournamentMatches(data, old.id)
  if (!matches.length) return null
  const structured = hasGroups(next)
  if (!structured && matches.some((m) => m.stage)) return 'Il torneo ha già partite di gironi o tabellone: per passare al formato libero eliminale prima'
  if (structured && matches.some((m) => !m.stage)) return 'Il torneo ha partite senza fase (formato libero): per dargli gironi o tabellone eliminale prima'
  for (const m of matches) {
    if (m.stage?.type !== 'group') continue
    const stage = m.stage
    const g = next.groups?.find((x) => x.id === stage.group)
    const oldG = old.groups?.find((x) => x.id === stage.group)
    if (!g) return `Il girone ${oldG?.name ?? ''} ha già partite: non si può togliere`.replace('  ', ' ')
    for (const p of [m.playerA, m.playerB]) {
      if (!g.players.includes(p)) return `${name(p)} ha già giocato nel girone ${g.name}: non si può spostare né togliere`
    }
  }
  const bracketPlayed = matches.some((m) => m.stage?.type === 'bracket' || m.stage?.type === 'third')
  if (bracketPlayed) {
    if (!hasBracket(next)) return 'Il torneo ha già partite del tabellone: per toglierlo eliminale prima'
    const same = next.bracketRounds === old.bracketRounds && JSON.stringify(drawOf(next)) === JSON.stringify(drawOf(old))
    if (!same) return 'Il tabellone è già iniziato: per cambiare turno o accoppiamenti elimina prima le sue partite'
    if (!next.thirdPlace && matches.some((m) => m.stage?.type === 'third')) return 'La finale per il 3º posto è già stata giocata: eliminala prima'
  }
  return null
}

// ---------- Riepilogo completo ----------

export interface BracketRound {
  round: number
  label: string
  nodes: BracketNode[]
}

export interface TournamentSummary {
  tournament: Tournament
  label: string
  participants: string[]
  groups: { group: TournamentGroup; standings: GroupRow[]; matches: Match[]; complete: boolean }[]
  bracket: BracketRound[]
  third: BracketNode | null
  /** Partite senza fase (formato libero) o che non trovano posto nella struttura attuale. */
  others: Match[]
  podium: { first?: string; second?: string; third: string[] }
  matchCount: number
}

export function tournamentSummary(data: AppData, t: Tournament): TournamentSummary {
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const matches = tournamentMatches(data, t.id)
  const used = new Set<string>()

  const groups = (hasGroups(t) ? (t.groups ?? []) : []).map((group) => {
    const list = groupMatches(matches, group.id)
    list.forEach((m) => used.add(m.id))
    return {
      group,
      standings: groupStandings(group, list, nameOf),
      matches: list,
      complete: group.players.length > 1 && remainingPairs(group, list).length === 0
    }
  })

  let bracket: BracketRound[] = []
  let third: BracketNode | null = null
  const podium: TournamentSummary['podium'] = { third: [] }
  if (hasBracket(t)) {
    const b = buildBracket(t, matches)
    bracket = b.rounds.map((nodes) => ({ round: nodes[0].round, label: roundLabel(nodes[0].round), nodes }))
    third = b.third
    for (const n of [...b.rounds.flat(), ...(third ? [third] : [])]) if (n.match) used.add(n.match.id)
    const final = b.rounds[b.rounds.length - 1][0]
    if (final.match) {
      podium.first = final.winner!
      podium.second = final.loser!
      const semis = b.rounds.find((r) => r[0].round === 2) ?? []
      if (third?.match) podium.third = [third.winner!]
      else if (!t.thirdPlace || !third) podium.third = semis.filter((n) => n.match).map((n) => n.loser!)
    }
  } else if (formatOf(t) === 'group' && groups[0]?.complete) {
    const s = groups[0].standings
    podium.first = s[0]?.playerId
    podium.second = s[1]?.playerId
    podium.third = s[2] ? [s[2].playerId] : []
  }

  const participants = participantsOf(data, t).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'it'))
  return {
    tournament: t,
    label: tournamentLabel(t),
    participants,
    groups,
    bracket,
    third,
    others: matches.filter((m) => !used.has(m.id)),
    podium,
    matchCount: matches.length
  }
}
