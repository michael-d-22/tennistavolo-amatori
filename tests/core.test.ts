import { describe, expect, it } from 'vitest'
import { eloDelta } from '../src/core/elo'
import { evaluateMatches, previewInactive } from '../src/core/rules'
import { compute, previewMatch } from '../src/core/standings'
import { mergeData, parseDataFile, toExportFile } from '../src/core/sync'
import { emptyData, type AppData, type Match, type Player } from '../src/core/types'
import { addMatch, addTournament, publishSnapshot, updatePlayer, setMatchOverride, updateMatch, updateTournament } from '../src/core/mutations'
import { whatsappText } from '../src/core/format'

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
