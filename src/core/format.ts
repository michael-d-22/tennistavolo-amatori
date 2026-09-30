import type { Computed, Standing } from './standings'
import type { TournamentSummary } from './tournament'
import { BYE, type AppData, type Match, type Tournament } from './types'

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Nome da mostrare: quello scelto oppure "Torneo del 12/10/2026". */
export function tournamentLabel(t: Pick<Tournament, 'name' | 'date'>): string {
  return t.name || `Torneo del ${formatDate(t.date)}`
}

export function todayISO(now = new Date()): string {
  const off = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - off).toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000)
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** "15 settembre" (con l'anno solo se diverso da quello corrente). */
export function formatLongDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`
}

/** Numero con segno all'italiana: "+15,2", "−65", "0". */
export function fmtDelta(n: number, digits = 0): string {
  const r = Number(n.toFixed(digits))
  if (r === 0) return digits ? (0).toFixed(digits).replace('.', ',') : '0'
  const v = Math.abs(r).toFixed(digits).replace('.', ',')
  return r > 0 ? `+${v}` : `−${v}`
}

export function signed(n: number, digits = 0): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

const MEDALS = ['🥇', '🥈', '🥉']

function arrow(s: Standing): string {
  if (s.positionChange == null) return '🆕'
  if (s.positionChange > 0) return `⬆️${s.positionChange}`
  if (s.positionChange < 0) return `⬇️${-s.positionChange}`
  return '➖'
}

/** Testo pronto da incollare nel gruppo WhatsApp. */
export function whatsappText(data: AppData, c: Computed, date: string): string {
  const lines: string[] = []
  lines.push(`🏓 *CLASSIFICA AMATORI* 🏓`)
  lines.push(`_Tornei e partite interne tennistavolo · ${data.season.name} – aggiornata al ${formatDate(date)}_`)
  lines.push('')
  const active = c.standings.filter((s) => s.player.status === 'active')
  for (const s of active) {
    const pos = s.position!
    const medal = pos <= 3 ? MEDALS[pos - 1] : `${pos}.`
    const delta = s.deltaSincePublish != null && Math.round(s.deltaSincePublish) !== 0 ? ` (${signed(Math.round(s.deltaSincePublish))})` : ''
    const mark = s.qualified ? '' : ' 🔴'
    lines.push(`${medal} *${s.player.name}* – ${Math.round(s.rating)} pt${delta} ${arrow(s)} · ${s.wins}V ${s.losses}P${mark}`)
  }
  if (active.some((s) => !s.qualified)) {
    lines.push('')
    lines.push(`🔴 = non ancora in classifica ufficiale (servono almeno ${data.settings.minMatchesPerPair} partite con ciascun avversario)`)
  }
  const inactive = c.standings.filter((s) => s.player.status === 'retired')
  if (inactive.length) {
    lines.push('')
    lines.push(`Inattivi: ${inactive.map((s) => s.player.name).join(', ')}`)
  }
  const played = c.results.filter((r) => r.eval.counted && !r.pending).length
  lines.push('')
  lines.push(`Partite valide giocate: ${played}`)
  return lines.join('\n')
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con separatore ";" (Excel italiano lo apre correttamente). */
export function standingsCsv(c: Computed): string {
  const head = ['Pos', 'Giocatore', 'Punti', 'Variazione', 'Giocate', 'Vinte', 'Perse', 'Set vinti', 'Set persi', 'Qualificato', 'Stato']
  const rows = c.standings.map((s) => [
    s.position ?? '',
    s.player.name,
    Math.round(s.rating),
    s.deltaSincePublish != null ? Math.round(s.deltaSincePublish) : '',
    s.played,
    s.wins,
    s.losses,
    s.setsWon,
    s.setsLost,
    s.qualified ? 'Sì' : 'No',
    s.player.status === 'retired' ? 'Inattivo' : 'Attivo'
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function matchesCsv(data: AppData, c: Computed): string {
  const name = new Map(data.players.map((p) => [p.id, p.name]))
  const tour = new Map(data.tournaments.map((t) => [t.id, tournamentLabel(t)]))
  const head = ['Data', 'Torneo', 'Giocatore A', 'Giocatore B', 'Risultato', 'Vincitore', 'Punti A', 'Punti B', 'Valida', 'Motivo esclusione']
  const rows = c.results.map((r) => {
    const m = r.match
    return [
      formatDate(m.date),
      m.tournamentId ? (tour.get(m.tournamentId) ?? 'Torneo') : '',
      name.get(m.playerA) ?? '',
      name.get(m.playerB) ?? '',
      `${m.setsA}-${m.setsB}`,
      name.get(m.setsA > m.setsB ? m.playerA : m.playerB) ?? '',
      r.eval.counted ? r.deltaA.toFixed(1).replace('.', ',') : '',
      r.eval.counted ? (-r.deltaA).toFixed(1).replace('.', ',') : '',
      r.eval.counted ? 'Sì' : 'No',
      r.eval.reason ?? ''
    ]
  })
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

/** "11-7 9-11 11-5" dal punto di vista di A. */
export function setScoresText(m: Match, sep = ' '): string {
  return (m.setScores ?? []).map(([a, b]) => `${a}-${b}`).join(sep)
}

/** Riepilogo del torneo per il gruppo WhatsApp. */
export function tournamentText(data: AppData, s: TournamentSummary): string {
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'
  const t = s.tournament
  const result = (m: Match) => {
    const sets = m.setScores?.length ? ` (${setScoresText(m, ', ')})` : ''
    const aWon = m.setsA > m.setsB
    const a = aWon ? `*${name(m.playerA)}*` : name(m.playerA)
    const b = aWon ? name(m.playerB) : `*${name(m.playerB)}*`
    return `${a} ${m.setsA}-${m.setsB} ${b}${sets}`
  }
  const lines: string[] = []
  lines.push(`🏆 *${s.label.toUpperCase()}* 🏆`)
  lines.push(`_Tornei e partite interne tennistavolo · ${formatDate(t.date)} · ${s.participants.length} partecipanti_`)
  if (s.podium.first) {
    lines.push('')
    lines.push(`🥇 ${name(s.podium.first)}`)
    if (s.podium.second) lines.push(`🥈 ${name(s.podium.second)}`)
    for (const p of s.podium.third) lines.push(`🥉 ${name(p)}`)
  }
  for (const g of s.groups) {
    lines.push('')
    lines.push(`*${s.groups.length > 1 ? `GIRONE ${g.group.name}` : 'GIRONE'}*`)
    for (const r of g.standings) lines.push(`${r.position}. ${name(r.playerId)} – ${r.wins}V ${r.losses}P · set ${r.setsWon}-${r.setsLost}`)
    if (g.matches.length) {
      lines.push('')
      for (const m of g.matches) lines.push(result(m))
    }
  }
  if (s.bracket.length) {
    lines.push('')
    lines.push('*TABELLONE*')
    for (const r of s.bracket) {
      const rows: string[] = []
      for (const n of r.nodes) {
        if (n.match) rows.push(result(n.match))
        else if (n.a === BYE || n.b === BYE) {
          const p = n.a === BYE ? n.b : n.a
          if (p && p !== BYE) rows.push(`${name(p)} passa il turno (X)`)
        }
      }
      if (!rows.length) continue
      lines.push(`_${r.label}_`)
      lines.push(...rows)
    }
    if (s.third?.match) {
      lines.push('_Finale 3º posto_')
      lines.push(result(s.third.match))
    }
  }
  if (s.others.length) {
    lines.push('')
    lines.push('*RISULTATI*')
    for (const m of s.others) lines.push(result(m))
  }
  lines.push('')
  lines.push(`Partite giocate: ${s.matchCount}`)
  return lines.join('\n')
}
