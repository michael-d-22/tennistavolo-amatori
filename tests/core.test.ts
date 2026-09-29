import { describe, expect, it } from 'vitest'
import { eloDelta } from '../src/core/elo'
import { evaluateMatches, previewInactive } from '../src/core/rules'
import { compute, previewMatch } from '../src/core/standings'
import { mergeData, parseDataFile, toExportFile } from '../src/core/sync'
import { emptyData, type AppData, type Match, type MatchStage, type Player } from '../src/core/types'
import {
  addMatch,
  addTournament,
  deleteMatch,
  deletePlayer,
  deleteTournament,
  publishSnapshot,
  restoreMatch,
  updatePlayer,
  setMatchOverride,
  updateMatch,
  updateTournament,
  type TournamentDraft
} from '../src/core/mutations'
import {
  buildBracket,
  pendingNodes,
  remainingPairs,
  seedOrder,
  setScoresError,
  stageOfNode,
  tournamentMatches,
  tournamentSummary
} from '../src/core/tournament'
import { tournamentText, whatsappText } from '../src/core/format'

let seq = 0
function player(id: string, status: Player['status'] = 'active'): Player {
  return { id, name: id.toUpperCase(), joinedAt: '2026-09-28', status, createdAt: 'x', updatedAt: 'x' }
}
function match(a: string, b: string, setsA: number, setsB: number, date = '2026-10-01'): Match {
  const t = `2026-01-01T00:00:${String(seq++).padStart(5, '0')}`
  return { id: `m${seq}`, date, playerA: a, playerB: b, setsA, setsB, createdAt: t, updatedAt: t }
}
function data(players: Player[], matches: Match[]): AppData {
  return { ...emptyData(new Date('2026-09-28')), players, matches }
}
const rating = (d: AppData, id: string) => compute(d).standings.find((s) => s.player.id === id)!.rating

describe('Elo K32', () => {
  it('due giocatori a 1200: chi vince prende 16 punti', () => {
    expect(eloDelta(1200, 1200, true, 32)).toBe(16)
    const d = data([player('a'), player('b')], [match('a', 'b', 3, 1)])
    expect(rating(d, 'a')).toBe(1216)
    expect(rating(d, 'b')).toBe(1184)
  })

  it('vincere contro un giocatore più forte vale di più', () => {
    expect(eloDelta(1100, 1300, true, 32)).toBeGreaterThan(16)
    expect(eloDelta(1300, 1100, true, 32)).toBeLessThan(16)
  })

  it('la somma dei punti resta costante', () => {
    const d = data(
      [player('a'), player('b'), player('c')],
      [match('a', 'b', 3, 0), match('b', 'c', 3, 2), match('c', 'a', 3, 1), match('a', 'b', 2, 3)]
    )
    const total = compute(d).standings.reduce((s, x) => s + x.rating, 0)
    expect(total).toBeCloseTo(3600, 8)
  })
})

describe('tetto 8 partite per coppia', () => {
  it('dalla 9ª partita con lo stesso avversario non conta', () => {
    const ms = Array.from({ length: 10 }, (_, i) => match('a', 'b', 3, 0, `2026-10-${String(i + 1).padStart(2, '0')}`))
    const d = data([player('a'), player('b')], ms)
    const ev = evaluateMatches(d)
    expect(ms.filter((m) => ev.get(m.id)!.counted)).toHaveLength(8)
    expect(ev.get(ms[8].id)!.kind).toBe('cap')
    expect(ev.get(ms[9].id)!.kind).toBe('cap')
    expect(compute(d).standings.find((s) => s.player.id === 'a')!.played).toBe(8)
  })

  it('una partita esclusa a mano non occupa un posto', () => {
    const ms = Array.from({ length: 9 }, (_, i) => match('a', 'b', 3, 0, `2026-10-${String(i + 1).padStart(2, '0')}`))
    ms[0].override = { mode: 'exclude' }
    const ev = evaluateMatches(data([player('a'), player('b')], ms))
    expect(ev.get(ms[0].id)!.kind).toBe('manual')
    expect(ev.get(ms[8].id)!.counted).toBe(true)
  })

  it('una partita forzata a mano conta anche oltre il tetto', () => {
    const ms = Array.from({ length: 9 }, (_, i) => match('a', 'b', 3, 0, `2026-10-${String(i + 1).padStart(2, '0')}`))
    ms[8].override = { mode: 'include' }
    const ev = evaluateMatches(data([player('a'), player('b')], ms))
    expect(ev.get(ms[8].id)!.counted).toBe(true)
  })
})

describe('giocatori inattivi', () => {
  it('tutte le partite di un inattivo sono in pausa e non contano per nessuno', () => {
    const ms = [match('x', 'b', 3, 0), match('x', 'c', 3, 0), match('b', 'c', 3, 0)]
    const d = data([player('x', 'retired'), player('b'), player('c')], ms)
    const ev = evaluateMatches(d)
    expect(ev.get(ms[0].id)!.kind).toBe('inactive')
    expect(ev.get(ms[1].id)!.kind).toBe('inactive')
    expect(ev.get(ms[2].id)!.counted).toBe(true)
    // I punti degli altri sono come se le partite con X non esistessero.
    expect(rating(d, 'b')).toBe(1216)
    expect(rating(d, 'c')).toBe(1184)
    expect(d.matches).toHaveLength(3)
  })

  it('riattivare il giocatore fa tornare a contare tutte le partite', () => {
    const ms = [match('x', 'b', 3, 0), match('x', 'c', 3, 0), match('x', 'c', 3, 0)]
    let d = data([player('x', 'retired'), player('b'), player('c')], ms)
    expect(ms.filter((m) => evaluateMatches(d).get(m.id)!.counted)).toHaveLength(0)
    d = updatePlayer(d, 'x', { status: 'active' })
    expect(ms.filter((m) => evaluateMatches(d).get(m.id)!.counted)).toHaveLength(3)
  })

  it("l'override manuale ha la precedenza", () => {
    const ms = [match('x', 'b', 3, 0), match('x', 'c', 3, 0)]
    let d = data([player('x', 'retired'), player('b'), player('c')], ms)
    d = setMatchOverride(d, ms[1].id, { mode: 'include', reason: 'decisione del responsabile' })
    expect(evaluateMatches(d).get(ms[1].id)!.counted).toBe(true)
  })

  it('anteprima delle partite che andranno in pausa', () => {
    const ms = [match('x', 'b', 3, 0), match('x', 'c', 3, 0), match('b', 'c', 3, 0)]
    const p = previewInactive(data([player('x'), player('b'), player('c')], ms), 'x')
    expect(p.map((m) => m.id)).toEqual([ms[0].id, ms[1].id])
  })
})

describe('partite in esubero', () => {
  it('restano registrate e vengono contate a parte per coppia', () => {
    const ms = Array.from({ length: 10 }, (_, i) => match('a', 'b', 3, 0, `2026-10-${String(i + 1).padStart(2, '0')}`))
    const c = compute(data([player('a'), player('b')], ms))
    expect(c.pairCounted.get('a|b')).toBe(8)
    expect(c.pairExcess.get('a|b')).toBe(2)
    expect(c.results).toHaveLength(10)
  })
})

describe('tornei', () => {
  function withTournament(k = 48) {
    let d = data([player('a'), player('b'), player('c')], [])
    const r = addTournament(d, { date: '2026-12-20', name: '  Torneo di Natale ', k })
    return { d: r.data, tid: r.id }
  }

  it('le partite di torneo usano il K del torneo e la sua data', () => {
    const { d: d0, tid } = withTournament()
    const d = addMatch(d0, { date: '2026-01-01', playerA: 'a', playerB: 'b', setsA: 2, setsB: 1, tournamentId: tid }).data
    expect(d.tournaments[0].name).toBe('Torneo di Natale')
    expect(d.matches[0].date).toBe('2026-12-20')
    expect(rating(d, 'a')).toBe(1224)
    expect(compute(d).results[0].k).toBe(48)
  })

  it('sono fuori dal limite per coppia e dal minimo per la qualificazione', () => {
    const { d: d0, tid } = withTournament()
    let d = d0
    for (let i = 0; i < 8; i++) d = addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0 }).data
    d = addMatch(d, { date: '', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0, tournamentId: tid }).data
    d = addMatch(d, { date: '', playerA: 'a', playerB: 'c', setsA: 3, setsB: 0, tournamentId: tid }).data
    d = addMatch(d, { date: '', playerA: 'a', playerB: 'c', setsA: 3, setsB: 0, tournamentId: tid }).data
    const c = compute(d)
    expect(c.results.every((r) => r.eval.counted)).toBe(true)
    expect(c.pairCounted.get('a|b')).toBe(8)
    expect(c.pairCounted.get('a|c') ?? 0).toBe(0)
    expect(c.standings.find((s) => s.player.id === 'a')!.qualified).toBe(false)
    // La 9ª partita normale va comunque in esubero.
    const p = previewMatch(d, { date: '2026-12-21', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0 })!
    expect(p.eval.kind).toBe('cap')
  })

  it('al meglio dei 3 solo nei tornei', () => {
    const { d, tid } = withTournament()
    expect(() => addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 2, setsB: 0 })).toThrow()
    expect(() => addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 2, setsB: 0, tournamentId: tid })).not.toThrow()
    expect(() => addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 2, setsB: 2, tournamentId: tid })).toThrow()
  })

  it('cambiare data e K del torneo aggiorna tutte le sue partite', () => {
    const { d: d0, tid } = withTournament()
    let d = addMatch(d0, { date: '', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0, tournamentId: tid }).data
    d = updateTournament(d, tid, { date: '2026-12-22', k: 64 })
    expect(d.matches[0].date).toBe('2026-12-22')
    expect(d.tournaments[0].name).toBeUndefined()
    expect(rating(d, 'a')).toBe(1232)
  })

  it("l'anteprima usa il K di un torneo non ancora salvato", () => {
    const d = data([player('a'), player('b')], [])
    const t = { id: '~t', date: '2026-10-01', k: 40, createdAt: '', updatedAt: '' }
    const p = previewMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0, tournamentId: '~t' }, t)!
    expect(p.deltaA).toBe(20)
  })

  it('i tornei si uniscono in sincronizzazione', () => {
    const { d: base } = withTournament()
    const other = addTournament(base, { date: '2027-01-06', k: 48 }).data
    const { data: merged, report } = mergeData(base, other)
    expect(report.tournaments).toEqual({ added: 1, updated: 0 })
    expect(merged.tournaments).toHaveLength(2)
  })
})

describe('qualificazione', () => {
  it('servono 2 partite contro ciascun avversario attivo', () => {
    const ms = [match('a', 'b', 3, 0), match('a', 'b', 3, 0), match('a', 'c', 3, 0)]
    const c = compute(data([player('a'), player('b'), player('c')], ms))
    const a = c.standings.find((s) => s.player.id === 'a')!
    expect(a.qualified).toBe(false)
    expect(a.missing).toEqual([{ playerId: 'c', name: 'C', missing: 1 }])
  })

  it('gli inattivi non contano come avversari richiesti', () => {
    const ms = [match('a', 'b', 3, 0), match('a', 'b', 3, 0)]
    const c = compute(data([player('a'), player('b'), player('r', 'retired')], ms))
    expect(c.standings.find((s) => s.player.id === 'a')!.qualified).toBe(true)
    expect(c.standings.find((s) => s.player.id === 'r')!.position).toBeNull()
  })
})

describe('ricalcolo e anteprima', () => {
  it('modificare una partita vecchia ricalcola tutto', () => {
    const ms = [match('a', 'b', 3, 0, '2026-10-01'), match('a', 'b', 3, 0, '2026-10-02')]
    let d = data([player('a'), player('b')], ms)
    const before = rating(d, 'a')
    d = updateMatch(d, ms[0].id, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 0, setsB: 3 })
    expect(rating(d, 'a')).toBeLessThan(before)
    expect(rating(d, 'a') + rating(d, 'b')).toBeCloseTo(2400, 8)
  })

  it('l\'anteprima segnala che la 9ª partita non conterà', () => {
    let d = data([player('a'), player('b')], [])
    for (let i = 0; i < 8; i++) d = addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0 }).data
    const p = previewMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0 })!
    expect(p.eval.counted).toBe(false)
    expect(p.eval.kind).toBe('cap')
  })

  it('risultati non validi vengono rifiutati', () => {
    const d = data([player('a'), player('b')], [])
    expect(() => addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'b', setsA: 2, setsB: 1 })).toThrow()
    expect(() => addMatch(d, { date: '2026-10-01', playerA: 'a', playerB: 'a', setsA: 3, setsB: 1 })).toThrow()
  })
})

describe('pubblicazione e sync', () => {
  it('le variazioni sono rispetto all\'ultima pubblicazione', () => {
    let d = data([player('a'), player('b')], [match('a', 'b', 3, 0)])
    d = publishSnapshot(d, compute(d), '2026-10-01')
    d = { ...d, matches: [...d.matches, match('b', 'a', 3, 0, '2026-10-05')] }
    const c = compute(d)
    const b = c.standings.find((s) => s.player.id === 'b')!
    expect(b.deltaSincePublish).toBeGreaterThan(0)
    expect(whatsappText(d, c, '2026-10-10')).toContain('CLASSIFICA AMATORI')
  })

  it('export/import e merge: vince la modifica più recente, le cancellazioni si propagano', () => {
    const base = data([player('a'), player('b')], [match('a', 'b', 3, 0)])
    const round = parseDataFile(JSON.parse(JSON.stringify(toExportFile(base))))
    expect(round).toEqual(base)

    const phone: AppData = {
      ...base,
      matches: [
        { ...base.matches[0], deleted: true, updatedAt: '2027-01-01T00:00:00.000Z' },
        match('b', 'a', 3, 2)
      ]
    }
    const { data: merged, report } = mergeData(base, phone)
    expect(report.matches).toEqual({ added: 1, updated: 1 })
    expect(merged.matches.find((m) => m.id === base.matches[0].id)!.deleted).toBe(true)
    expect(compute(merged).results.filter((r) => r.eval.counted)).toHaveLength(1)
  })
})

describe('struttura dei tornei', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
  const people = () => data(ids.map((i) => player(i)), [])
  const two = [
    { id: 'gA', name: 'A', players: ['a', 'b', 'c'] },
    { id: 'gB', name: 'B', players: ['d', 'e', 'f'] }
  ]
  const G = (group: string): MatchStage => ({ type: 'group', group })
  const K = (round: number, slot: number): MatchStage => ({ type: 'bracket', round, slot })
  const THIRD: MatchStage = { type: 'third' }

  function create(d: AppData, extra: Partial<TournamentDraft>) {
    const r = addTournament(d, { date: '2026-11-01', k: 48, format: 'groups-bracket', groups: two, bracketRounds: 2, ...extra })
    return { d: r.data, tid: r.id }
  }
  const play = (d: AppData, tid: string, a: string, b: string, sa: number, sb: number, stage: MatchStage, setScores?: [number, number][]) =>
    addMatch(d, { date: '', playerA: a, playerB: b, setsA: sa, setsB: sb, tournamentId: tid, stage, setScores }).data
  const tour = (d: AppData, tid: string) => d.tournaments.find((t) => t.id === tid)!
  const summary = (d: AppData, tid: string) => tournamentSummary(d, tour(d, tid))

  it('controlla i punteggi dei set', () => {
    expect(setScoresError(3, 1, [[11, 7], [9, 11], [11, 5], [13, 11]])).toBeNull()
    expect(setScoresError(3, 1, [[11, 7], [9, 11], [11, 5]])).toContain('4 set')
    expect(setScoresError(3, 0, [[11, 7], [11, 10], [11, 5]])).toContain('non è un punteggio')
    expect(setScoresError(3, 0, [[11, 7], [14, 11], [11, 5]])).toContain('non è un punteggio')
    expect(setScoresError(2, 1, [[7, 11], [11, 9], [11, 5]])).toBeNull()
    expect(setScoresError(3, 0, [[7, 11], [11, 9], [11, 5]])).toContain('danno 2-1')
  })

  describe('gironi', () => {
    it('ogni coppia gioca una sola volta, in qualsiasi ordine', () => {
      const { d: t, tid } = create(people(), {})
      const d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      expect(() => play(d, tid, 'a', 'b', 3, 1, G('gA'))).toThrow('già affrontati')
      expect(() => play(d, tid, 'b', 'a', 3, 1, G('gA'))).toThrow('già affrontati')
      expect(() => play(d, tid, 'a', 'c', 3, 1, G('gA'))).not.toThrow()
    })

    it('solo giocatori del girone, e la fase è obbligatoria', () => {
      const { d, tid } = create(people(), {})
      expect(() => play(d, tid, 'a', 'd', 3, 0, G('gA'))).toThrow('non fa parte del girone')
      expect(() => play(d, tid, 'a', 'j', 3, 0, G('gA'))).toThrow('non fa parte del girone')
      expect(() => play(d, tid, 'a', 'b', 3, 0, undefined as unknown as MatchStage)).toThrow('fase')
      expect(() => play(d, tid, 'a', 'b', 3, 0, G('zzz'))).toThrow('fase')
    })

    it('coppie ancora da giocare e girone completo', () => {
      const { d: t, tid } = create(people(), {})
      let d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      expect(summary(d, tid).groups[0].complete).toBe(false)
      d = play(d, tid, 'c', 'a', 3, 0, G('gA'))
      d = play(d, tid, 'b', 'c', 3, 0, G('gA'))
      const s = summary(d, tid)
      expect(s.groups[0].complete).toBe(true)
      expect(s.groups[1].complete).toBe(false)
    })

    it('classifica con classifica avulsa tra pari merito', () => {
      const r = addTournament(people(), { date: '2026-11-01', k: 48, format: 'group', groups: [{ id: 'g', name: 'A', players: ['a', 'b', 'c', 'd'] }] })
      let d = r.data
      d = play(d, r.id, 'a', 'b', 3, 0, G('g'), [[11, 1], [11, 1], [11, 1]])
      d = play(d, r.id, 'b', 'c', 3, 0, G('g'))
      d = play(d, r.id, 'c', 'a', 3, 2, G('g'))
      d = play(d, r.id, 'a', 'd', 3, 0, G('g'))
      d = play(d, r.id, 'b', 'd', 3, 0, G('g'))
      d = play(d, r.id, 'c', 'd', 3, 0, G('g'))
      const s = summary(d, r.id)
      expect(s.groups[0].standings.map((x) => x.playerId)).toEqual(['a', 'b', 'c', 'd'])
      expect(s.podium).toEqual({ first: 'a', second: 'b', third: ['c'] })
    })

    it('una partita eliminata non si ripristina se la coppia ha già rigiocato', () => {
      const { d: t, tid } = create(people(), {})
      let d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      d = play(d, tid, 'd', 'e', 3, 0, G('gB'))
      const first = d.matches[0].id
      d = deleteMatch(d, first)
      d = play(d, tid, 'a', 'b', 0, 3, G('gA'))
      expect(() => restoreMatch(d, first)).toThrow('Non si può ripristinare')
    })
  })

  describe('impostazione del tabellone', () => {
    it('può essere più largo dei partecipanti: i posti vuoti sono X', () => {
      // 10 giocatori in due gironi, tutti al tabellone: si parte dagli ottavi (16 posti) con 6 X.
      const groups = [
        { id: 'g1', name: 'A', players: ['a', 'b', 'c', 'd', 'e'] },
        { id: 'g2', name: 'B', players: ['f', 'g', 'h', 'i', 'j'] }
      ]
      const draw = ['a', 'X', 'b', 'j', 'c', 'X', 'd', 'i', 'e', 'X', 'f', 'h', 'g', 'X', 'X', null]
      expect(() => create(people(), { groups, bracketRounds: 4, draw })).not.toThrow()
      expect(() => create(people(), { groups, bracketRounds: 5 })).toThrow('almeno 17')
    })

    it('rifiuta accoppiamenti impossibili', () => {
      const d = people()
      expect(() => create(d, { draw: ['a', 'X', 'X', 'X'] })).toThrow('due X')
      expect(() => create(d, { draw: ['a', 'b', 'a', 'c'] })).toThrow('due volte')
      expect(() => create(d, { draw: ['a', 'b', 'j', 'c'] })).toThrow('non partecipa')
      expect(() => create(d, { bracketRounds: 1, draw: ['a', 'X'] })).toThrow('finale')
      expect(() => create(d, { bracketRounds: 4 })).toThrow('almeno 9')
    })

    it('valida gironi e formato', () => {
      const d = people()
      expect(() => addTournament(d, { date: '2026-11-01', k: 48, format: 'groups-bracket', groups: [two[0]] })).toThrow('due gironi')
      expect(() =>
        addTournament(d, { date: '2026-11-01', k: 48, format: 'groups-bracket', groups: [two[0], { id: 'x', name: 'B', players: ['c', 'd'] }] })
      ).toThrow('un solo girone')
    })
  })

  describe('turni ad eliminazione diretta', () => {
    // 5 giocatori ai quarti: 3 passano il turno con la X.
    const draw = ['a', 'X', 'b', 'c', 'd', 'X', 'e', 'X']
    const setupQ = () => create(people(), { bracketRounds: 3, draw, thirdPlace: true })

    it('chi ha la X non gioca e passa direttamente al turno dopo', () => {
      const { d, tid } = setupQ()
      expect(() => play(d, tid, 'a', 'b', 3, 0, K(3, 0))).toThrow('passa il turno')
      const b = summary(d, tid).bracket
      expect(b[1].nodes[1]).toMatchObject({ a: 'd', b: 'e' })
      // In semifinale d–e si può già giocare, a aspetta il vincitore di b–c.
      expect(b[1].nodes[0]).toMatchObject({ a: 'a', b: null })
      expect(() => play(d, tid, 'd', 'e', 3, 0, K(2, 1))).not.toThrow()
      expect(() => play(d, tid, 'a', 'b', 3, 0, K(2, 0))).toThrow('non è ancora definita')
    })

    it('solo le partite previste, una volta sola, con i giocatori giusti', () => {
      const { d: t, tid } = setupQ()
      let d = play(t, tid, 'c', 'b', 3, 1, K(3, 1))
      expect(() => play(d, tid, 'b', 'c', 3, 0, K(3, 1))).toThrow('già inserita')
      expect(() => play(d, tid, 'b', 'c', 3, 0, K(3, 2))).toThrow('passa il turno')
      expect(() => play(d, tid, 'a', 'b', 3, 0, K(2, 0))).toThrow('contro')
      expect(() => play(d, tid, 'a', 'c', 3, 0, K(2, 7))).toThrow('non è prevista')
      expect(() => play(d, tid, 'a', 'c', 3, 0, { type: 'bracket', round: 2 } as MatchStage)).toThrow('quale partita')
      expect(() => play(d, tid, 'a', 'c', 3, 0, K(1, 0))).toThrow('non è ancora definita')
      d = play(d, tid, 'a', 'c', 3, 0, K(2, 0))
      d = play(d, tid, 'e', 'd', 3, 2, K(2, 1))
      expect(() => play(d, tid, 'a', 'd', 3, 0, K(1, 0))).toThrow('contro')
      expect(() => play(d, tid, 'a', 'd', 3, 0, THIRD)).toThrow('contro')
      d = play(d, tid, 'd', 'c', 3, 0, THIRD)
      expect(() => play(d, tid, 'c', 'd', 3, 0, THIRD)).toThrow('già inserita')
      d = play(d, tid, 'a', 'e', 2, 3, K(1, 0))
      expect(() => play(d, tid, 'a', 'e', 3, 0, K(1, 0))).toThrow('già inserita')
      const s = summary(d, tid)
      expect(s.podium).toEqual({ first: 'e', second: 'a', third: ['d'] })
      expect(s.others).toHaveLength(0)
      const text = tournamentText(d, s)
      expect(text).toContain('A passa il turno (X)')
      expect(text).toContain('_Finale 3º posto_')
    })

    it('non si cambia il vincitore né si elimina una partita se il turno dopo è già giocato', () => {
      const { d: t, tid } = setupQ()
      let d = play(t, tid, 'b', 'c', 3, 1, K(3, 1))
      const qf = d.matches.find((m) => m.stage?.type === 'bracket')!.id
      d = play(d, tid, 'a', 'b', 3, 0, K(2, 0))
      expect(() => updateMatch(d, qf, { date: '', playerA: 'b', playerB: 'c', setsA: 1, setsB: 3 })).toThrow('turno successivo')
      expect(() => deleteMatch(d, qf)).toThrow('turno successivo')
      // Il punteggio si può correggere se il vincitore resta lo stesso.
      d = updateMatch(d, qf, { date: '', playerA: 'b', playerB: 'c', setsA: 3, setsB: 2 })
      expect(d.matches.find((m) => m.id === qf)!.setsB).toBe(2)
    })

    it('le semifinali non si toccano se la finale per il 3º posto è già giocata', () => {
      const { d: t, tid } = create(people(), { draw: ['a', 'b', 'd', 'e'], thirdPlace: true })
      let d = play(t, tid, 'a', 'b', 3, 0, K(2, 0))
      d = play(d, tid, 'd', 'e', 3, 0, K(2, 1))
      const semi = d.matches[0].id
      d = play(d, tid, 'b', 'e', 3, 0, THIRD)
      expect(() => deleteMatch(d, semi)).toThrow('turno successivo')
    })

    it('in una modifica giocatori e fase restano quelli della partita', () => {
      const { d: t, tid } = setupQ()
      let d = play(t, tid, 'b', 'c', 3, 1, K(3, 1))
      const id = d.matches[0].id
      d = updateMatch(d, id, { date: '', playerA: 'e', playerB: 'f', setsA: 3, setsB: 0 })
      expect(d.matches[0]).toMatchObject({ playerA: 'b', playerB: 'c', setsB: 0, stage: K(3, 1) })
    })

    it('niente finale per il 3º posto se una semifinale è vinta con la X', () => {
      // 3 giocatori in semifinale: uno passa il turno.
      const { d: t, tid } = create(people(), { draw: ['a', 'X', 'b', 'c'], thirdPlace: true })
      let d = play(t, tid, 'b', 'c', 3, 0, K(2, 1))
      expect(() => play(d, tid, 'c', 'a', 3, 0, THIRD)).toThrow('vinta con la X')
      d = play(d, tid, 'a', 'b', 3, 0, K(1, 0))
      expect(summary(d, tid).podium).toEqual({ first: 'a', second: 'b', third: ['c'] })
    })

    it('senza finale per il 3º posto i semifinalisti sconfitti sono terzi a pari merito', () => {
      const { d: t, tid } = create(people(), { draw: ['a', 'b', 'c', 'd'] })
      let d = play(t, tid, 'a', 'b', 3, 0, K(2, 0))
      d = play(d, tid, 'c', 'd', 3, 0, K(2, 1))
      expect(() => play(d, tid, 'b', 'd', 3, 0, THIRD)).toThrow('fase')
      d = play(d, tid, 'c', 'a', 3, 1, K(1, 0))
      const p = summary(d, tid).podium
      expect({ ...p, third: [...p.third].sort() }).toEqual({ first: 'c', second: 'a', third: ['b', 'd'] })
    })
  })

  describe('modifiche al torneo già iniziato', () => {
    it('chi ha giocato nel girone non si sposta, il girone non si toglie', () => {
      const { d: t, tid } = create(people(), {})
      const d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      const base = { date: '2026-11-01', k: 48, format: 'groups-bracket' as const, bracketRounds: 2 }
      expect(() =>
        updateTournament(d, tid, { ...base, groups: [{ ...two[0], players: ['b', 'c'] }, { ...two[1], players: ['a', 'd', 'e', 'f'] }] })
      ).toThrow('ha già giocato')
      expect(() => updateTournament(d, tid, { ...base, format: 'group', groups: [two[1]] })).toThrow('già partite')
      expect(() => updateTournament(d, tid, { ...base, format: 'free' })).toThrow('formato libero')
      // Aggiungere un giocatore che non ha giocato va bene.
      expect(() => updateTournament(d, tid, { ...base, groups: [{ ...two[0], players: ['a', 'b', 'c', 'g'] }, two[1]] })).not.toThrow()
    })

    it('il tabellone iniziato non si cambia', () => {
      const { d: t, tid } = create(people(), { draw: ['a', 'b', 'd', 'e'] })
      const d = play(t, tid, 'a', 'b', 3, 0, K(2, 0))
      const base = { date: '2026-11-01', k: 48, format: 'groups-bracket' as const, groups: two, bracketRounds: 2 }
      expect(() => updateTournament(d, tid, { ...base, draw: ['a', 'c', 'd', 'e'] })).toThrow('già iniziato')
      expect(() => updateTournament(d, tid, { ...base, bracketRounds: 1, draw: ['a', 'b'] })).toThrow('già iniziato')
      expect(() => updateTournament(d, tid, { ...base, draw: ['a', 'b', 'd', 'e'], name: 'Coppa' })).not.toThrow()
    })

    it('eliminare un torneo manda nel cestino anche tutte le sue partite; i suoi iscritti non si cancellano', () => {
      const { d: t, tid } = create(people(), {})
      let d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      d = play(d, tid, 'd', 'e', 3, 0, G('gB'))
      const before = rating(d, 'a')
      d = deleteTournament(d, tid)
      expect(d.tournaments[0].deleted).toBe(true)
      expect(d.matches.every((m) => m.deleted)).toBe(true)
      expect(rating(d, 'a')).toBe(1200)
      expect(before).toBeGreaterThan(1200)
      expect(() => deletePlayer(t, 'c')).toThrow('iscritto a un torneo')
      // Ripristinando una sua partita torna anche il torneo.
      d = restoreMatch(d, d.matches[0].id)
      expect(d.tournaments[0].deleted).toBe(false)
    })

    it("eliminata l'ultima partita, si elimina anche il torneo", () => {
      const { d: t, tid } = create(people(), {})
      let d = play(t, tid, 'a', 'b', 3, 0, G('gA'))
      d = play(d, tid, 'd', 'e', 3, 0, G('gB'))
      d = deleteMatch(d, d.matches[0].id)
      expect(d.tournaments[0].deleted).toBeFalsy()
      d = deleteMatch(d, d.matches[1].id)
      expect(d.tournaments[0].deleted).toBe(true)
    })
  })

  describe('tabellone composto dai gironi', () => {
    const finishGroups = (d: AppData, tid: string) => {
      // A: a > b > c ; B: d > e > f (tutte 3-0 del primo nominato).
      for (const [x, y, g] of [['a', 'b', 'gA'], ['a', 'c', 'gA'], ['b', 'c', 'gA'], ['d', 'e', 'gB'], ['d', 'f', 'gB'], ['e', 'f', 'gB']])
        d = play(d, tid, x, y, 3, 0, G(g))
      return d
    }

    it('ordine delle teste di serie', () => {
      expect(seedOrder(2)).toEqual([1, 2])
      expect(seedOrder(4)).toEqual([1, 4, 2, 3])
      expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    })

    it('a gironi finiti le semifinali si compongono incrociando i gironi', () => {
      const { d: t, tid } = create(people(), { bracketRounds: 2 })
      let d = finishGroups(t, tid)
      const tr = tour(d, tid)
      expect(tr.drawAuto).toBe(true)
      // 1º A contro 2º B, 1º B contro 2º A.
      const pairs = [tr.draw!.slice(0, 2).sort(), tr.draw!.slice(2, 4).sort()]
      expect(pairs).toContainEqual(['a', 'e'])
      expect(pairs).toContainEqual(['b', 'd'])
      // E si può subito giocare.
      const s = summary(d, tid)
      expect(s.bracket[0].nodes.every((n) => n.a && n.b)).toBe(true)
    })

    it('se i posti avanzano, la X va alle teste di serie; nessuno scontro tra compagni di girone', () => {
      // 6 giocatori nei quarti (8 posti): passano con la X i due primi dei gironi.
      const { d: t, tid } = create(people(), { bracketRounds: 3 })
      const d = finishGroups(t, tid)
      const draw = tour(d, tid).draw!
      expect(draw.filter((p) => p === 'X')).toHaveLength(2)
      for (let i = 0; i < 8; i += 2) {
        const pair = [draw[i], draw[i + 1]]
        if (pair.includes('X')) expect(pair.some((p) => p === 'a' || p === 'd')).toBe(true)
        const inA = pair.filter((p) => ['a', 'b', 'c'].includes(p!)).length
        expect(inA === 2).toBe(false)
      }
    })

    it('segue i risultati finché non si tocca a mano o non inizia il tabellone', () => {
      const { d: t, tid } = create(people(), { bracketRounds: 2 })
      let d = finishGroups(t, tid)
      const ab = d.matches.find((m) => m.playerA === 'a' && m.playerB === 'b')!.id
      const bc = d.matches.find((m) => m.playerA === 'b' && m.playerB === 'c')!.id
      // Il girone A cambia: ora vince b.
      d = updateMatch(d, ab, { date: '', playerA: 'a', playerB: 'b', setsA: 0, setsB: 3 })
      d = updateMatch(d, d.matches.find((m) => m.playerA === 'a' && m.playerB === 'c')!.id, { date: '', playerA: 'a', playerB: 'c', setsA: 0, setsB: 3 })
      let draw = tour(d, tid).draw!
      expect([draw.slice(0, 2).sort(), draw.slice(2, 4).sort()]).toContainEqual(['b', 'e'])
      // Un girone torna incompleto: il tabellone automatico si svuota.
      d = deleteMatch(d, bc)
      expect(tour(d, tid).draw!.every((p) => p === null)).toBe(true)
      d = restoreMatch(d, bc)
      expect(tour(d, tid).draw!.every((p) => p !== null)).toBe(true)
      // Ritoccato a mano: non si aggiorna più da solo.
      const base = { date: '2026-11-01', k: 48, format: 'groups-bracket' as const, groups: two, bracketRounds: 2 }
      d = updateTournament(d, tid, { ...base, draw: ['a', 'd', 'b', 'e'], drawAuto: false })
      d = updateMatch(d, ab, { date: '', playerA: 'a', playerB: 'b', setsA: 3, setsB: 0 })
      expect(tour(d, tid).draw).toEqual(['a', 'd', 'b', 'e'])
      // Iniziato il tabellone, niente più cambi automatici.
      d = updateTournament(d, tid, { ...base, draw: tour(d, tid).draw, drawAuto: true })
      draw = tour(d, tid).draw!
      d = play(d, tid, draw[0]!, draw[1]!, 3, 0, K(2, 0))
      d = updateMatch(d, ab, { date: '', playerA: 'a', playerB: 'b', setsA: 0, setsB: 3 })
      expect(tour(d, tid).draw).toEqual(draw)
    })
  })
})

describe('tornei: prova a raffica', () => {
  // Migliaia di operazioni a caso (anche assurde): quelle accettate non devono mai rompere il torneo.
  it.each([
    ['accoppiamenti scelti a mano', ['a', 'X', 'b', 'e', 'c', 'f', 'g', 'd']],
    ['tabellone composto dai gironi', undefined]
  ])('nessuna sequenza di operazioni porta a uno stato incoerente (%s)', (_label, initialDraw) => {
    let rnd = 12345
    const rand = (n: number) => ((rnd = (rnd * 16807) % 2147483647) % n + n) % n
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const groups = [
      { id: 'gA', name: 'A', players: ['a', 'b', 'c', 'd'] },
      { id: 'gB', name: 'B', players: ['e', 'f', 'g'] }
    ]
    const r = addTournament(data(ids.map((i) => player(i)), []), {
      date: '2026-11-01',
      k: 48,
      format: 'groups-bracket',
      groups,
      bracketRounds: 3,
      thirdPlace: true,
      draw: initialDraw as (string | null)[] | undefined
    })
    let d = r.data
    const tid = r.id
    const stages: MatchStage[] = [
      { type: 'group', group: 'gA' },
      { type: 'group', group: 'gB' },
      { type: 'third' },
      ...[3, 2, 1].flatMap((round) => Array.from({ length: 5 }, (_, slot) => ({ type: 'bracket' as const, round, slot })))
    ]
    const scores: [number, number][] = [[3, 0], [3, 2], [1, 3], [2, 0], [0, 2], [2, 1]]
    let accepted = 0
    let bracketPlayed = 0
    for (let step = 0; step < 4000; step++) {
      const live = d.matches.filter((m) => !m.deleted)
      const dead = d.matches.filter((m) => m.deleted)
      try {
        const op = rand(12)
        if (op >= 10) {
          // Mossa sensata: una partita davvero in programma (girone o tabellone).
          const t = d.tournaments[0]
          const tm = tournamentMatches(d, t.id)
          const b = buildBracket(t, tm)
          const open = [
            ...remainingPairs(t.groups![0], tm).map((p) => ({ p, stage: stages[0] })),
            ...remainingPairs(t.groups![1], tm).map((p) => ({ p, stage: stages[1] })),
            ...[3, 2, 1, 0].flatMap((round) =>
              pendingNodes(b, round ? { type: 'bracket', round } : { type: 'third' }).map((n) => ({ p: [n.a!, n.b!], stage: stageOfNode(n) }))
            )
          ]
          if (open.length) {
            const o = open[rand(open.length)]
            const [sa, sb] = scores[rand(scores.length)]
            d = addMatch(d, { date: '', playerA: o.p[0], playerB: o.p[1], setsA: sa, setsB: sb, tournamentId: tid, stage: o.stage }).data
            if (o.stage.type !== 'group') bracketPlayed++
          }
        } else if (op < 6) {
          const [sa, sb] = scores[rand(scores.length)]
          d = addMatch(d, { date: '', playerA: ids[rand(7)], playerB: ids[rand(7)], setsA: sa, setsB: sb, tournamentId: tid, stage: stages[rand(stages.length)] }).data
        } else if (op < 8 && live.length) {
          const m = live[rand(live.length)]
          const [sa, sb] = scores[rand(scores.length)]
          d = updateMatch(d, m.id, { date: '', playerA: ids[rand(7)], playerB: ids[rand(7)], setsA: sa, setsB: sb })
        } else if (op < 9 && live.length) {
          d = deleteMatch(d, live[rand(live.length)].id)
        } else if (dead.length) {
          d = restoreMatch(d, dead[rand(dead.length)].id)
        }
        accepted++
      } catch {
        // Operazione rifiutata: va benissimo, basta che i dati restino coerenti.
      }
      const t = d.tournaments[0]
      const s = tournamentSummary(d, t)
      const live2 = d.matches.filter((m) => !m.deleted)
      // Tutte le partite trovano posto nella struttura.
      expect(s.others).toHaveLength(0)
      // Nel girone nessuna coppia due volte.
      for (const g of s.groups) {
        const keys = g.matches.map((m) => [m.playerA, m.playerB].sort().join('|'))
        expect(new Set(keys).size).toBe(keys.length)
      }
      // Nel tabellone: al massimo una partita per posto, nessuna per chi ha la X, e ognuna coi giocatori del suo posto.
      const bracketMatches = live2.filter((m) => m.stage?.type === 'bracket' || m.stage?.type === 'third')
      const placed = [...s.bracket.flatMap((x) => x.nodes), ...(s.third ? [s.third] : [])].filter((n) => n.match)
      expect(placed).toHaveLength(bracketMatches.length)
      for (const n of placed) {
        expect(n.a === 'X' || n.b === 'X').toBe(false)
        expect([n.match!.playerA, n.match!.playerB].sort()).toEqual([n.a, n.b].sort())
      }
      // Ogni turno giocato ha i suoi giocatori già qualificati dal turno prima.
      for (let i = 1; i < s.bracket.length; i++) {
        for (const n of s.bracket[i].nodes) {
          if (!n.match) continue
          const feeders = s.bracket[i - 1].nodes.slice(2 * n.slot, 2 * n.slot + 2)
          expect(feeders.map((f) => f.winner).sort()).toEqual([n.a, n.b].sort())
        }
      }
    }
    // La prova deve aver accettato un bel po' di operazioni, non solo rifiutato tutto.
    expect(accepted).toBeGreaterThan(100)
    expect(bracketPlayed).toBeGreaterThan(20)
  })
})
