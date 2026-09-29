import type { Computed, Standing } from './standings'
import type { AppData, Tournament } from './types'

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
  const played = c.results.filter((r) => r.eval.counted).length
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
