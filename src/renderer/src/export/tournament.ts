import { formatLongDate } from '@core/format'
import { FORMAT_LABELS, formatOf, type BracketNode, type TournamentSummary } from '@core/tournament'
import { BYE, type AppData, type Match } from '@core/types'
import { CARD_WIDTH, INK, INK_2, INK_3, PAPER, RED, RULE, RULE_STRONG, esc } from './palette'

// Riepilogo di un torneo per il gruppo WhatsApp: stessa carta, stessi caratteri e colori della classifica.
// Nomi grandi: su WhatsApp l'immagine si guarda dal telefono.

const COND = "'Barlow Condensed',sans-serif"
const MONO = "'IBM Plex Mono',monospace"

export const TOURNAMENT_CSS = `
.amt-card{width:${CARD_WIDTH}px;min-height:1350px;box-sizing:border-box;padding:72px 80px 64px;display:flex;flex-direction:column;gap:52px;
  background:${PAPER};color:${INK};font-family:'IBM Plex Sans',sans-serif;text-align:left}
.amt-card *{box-sizing:border-box}
.amt-mono{font-family:${MONO}}
.amt-head{display:flex;flex-direction:column;gap:18px;padding-bottom:32px;border-bottom:6px solid ${INK}}
.amt-top{display:flex;justify-content:space-between;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:${INK_2}}
.amt-title{margin:0;font-family:${COND};line-height:.85;font-weight:700;text-transform:uppercase;letter-spacing:-.005em}
.amt-title span{color:${RED}}
.amt-date{font-size:26px;color:${INK_2}}
.amt-podium{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:16px}
.amt-pod{display:flex;align-items:center;gap:18px;padding:20px;border-top:4px solid ${INK};background:#FFFFFF}
.amt-pod b{font-family:${COND};font-size:80px;line-height:.9;font-weight:700;min-width:52px;text-align:center}
.amt-pod.first{border-top-color:${RED}}
.amt-pod.first b{color:${RED}}
.amt-pod div{display:flex;flex-direction:column;gap:6px;min-width:0}
.amt-pod span{font-weight:600;font-size:38px;line-height:1.12}
.amt-pod small{font-family:${MONO};font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3}}
.amt-sec{display:flex;flex-direction:column;gap:20px}
.amt-sec-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid ${INK};padding-bottom:8px}
.amt-sec-head h2{margin:0;font-family:${COND};font-size:52px;line-height:1;font-weight:700;text-transform:uppercase}
.amt-sec-head span{font-family:${MONO};font-size:18px;letter-spacing:.04em;text-transform:uppercase;color:${INK_3}}
.amt-people{font-size:36px;line-height:1.5;color:${INK_3}}
.amt-people b{color:${INK};font-weight:600;white-space:nowrap}
.amt-table{width:100%;border-collapse:collapse}
.amt-table th{font-family:${MONO};font-size:16px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:${INK_3};
  text-align:center;padding:0 0 8px;border-bottom:2px solid ${RULE_STRONG}}
.amt-table th.l,.amt-table td.l{text-align:left}
.amt-table td{padding:14px 0;border-bottom:2px solid ${RULE};text-align:center;font-family:${MONO};font-size:30px;color:${INK_2}}
.amt-table td.pos{font-family:${COND};font-size:54px;font-weight:700;color:${INK};width:76px;line-height:1}
.amt-table td.name{font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:40px;color:${INK}}
.amt-results{display:flex;flex-direction:column}
.amt-res{display:grid;grid-template-columns:minmax(0,1fr) 110px minmax(0,1fr);align-items:center;padding:14px 0;border-bottom:2px solid ${RULE}}
.amt-res .p{font-size:37px;line-height:1.2;color:${INK_3};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.amt-res .p.a{text-align:right}
.amt-res .p.w{color:${INK};font-weight:600}
.amt-res .s{font-family:${COND};font-size:48px;font-weight:700;text-align:center;line-height:1}
.amt-res .sets{grid-column:1 / -1;text-align:center;font-family:${MONO};font-size:23px;color:${INK_3};margin-top:6px}
.amt-bracket{display:flex;gap:24px}
.amt-col{flex:1;min-width:0;display:flex;flex-direction:column}
.amt-col-head{font-family:${MONO};font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3};padding-bottom:10px;
  border-bottom:2px solid ${RULE_STRONG};margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.amt-slots{flex:none;display:flex;flex-direction:column;justify-content:space-around;gap:12px}
.amt-box{background:#FFFFFF;border-left:5px solid ${RULE_STRONG};padding:10px 14px}
.amt-box.final{border-left-color:${RED}}
.amt-line{display:flex;justify-content:space-between;align-items:center;gap:8px;line-height:1.3;color:${INK_3}}
.amt-line span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.amt-line b{font-family:${COND};font-weight:700}
.amt-line.w{color:${INK};font-weight:600}
.amt-line.tbd{color:${RULE_STRONG}}
.amt-line.bye span{font-family:${MONO};color:${INK_3}}
.amt-box .sets{font-family:${MONO};color:${INK_3};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.amt-third{margin-top:18px}
.amt-third small{display:block;font-family:${MONO};font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3};margin-bottom:6px}
.amt-foot{margin-top:auto;display:flex;justify-content:space-between;gap:24px;font-family:${MONO};font-size:18px;color:${INK_3};line-height:1.5}
.amt-foot span:last-child{text-align:right}
`

/** "Matteo Bianchi" → "M. Bianchi" quando lo spazio è poco (tabelloni larghi). */
function short(name: string): string {
  const parts = name.split(' ')
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name
}

const setsText = (scores: [number, number][] | undefined) => (scores?.length ? scores.map(([a, b]) => `${a}-${b}`).join('  ') : '')

export function tournamentHtml(data: AppData, s: TournamentSummary): string {
  const t = s.tournament
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? '?'

  // Titolo su due righe: la prima parola in blu, il resto in rosso.
  const words = s.label.split(' ')
  const [l1, l2] = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [s.label, '']
  const longest = Math.max(l1.length, l2.length)
  const titleSize = longest <= 10 ? 128 : longest <= 16 ? 104 : longest <= 22 ? 84 : 68

  const info = [
    formatLongDate(t.date, new Date(0)),
    `${s.participants.length} partecipanti`,
    `${s.matchCount} ${s.matchCount === 1 ? 'partita' : 'partite'}`,
    FORMAT_LABELS[formatOf(t)]
  ].join(' · ')

  const result = (m: Match) => {
    const aWon = m.setsA > m.setsB
    const st = setsText(m.setScores)
    return `<div class="amt-res">
      <span class="p a ${aWon ? 'w' : ''}">${esc(name(m.playerA))}</span>
      <span class="s">${m.setsA}–${m.setsB}</span>
      <span class="p ${aWon ? '' : 'w'}">${esc(name(m.playerB))}</span>
      ${st ? `<span class="sets">${st}</span>` : ''}
    </div>`
  }
  const results = (list: Match[]) => (list.length ? `<div class="amt-results">${list.map(result).join('')}</div>` : '')

  const parts: string[] = []

  if (s.podium.first) {
    const pod = (pos: number, label: string, names: string[], cls = '') =>
      `<div class="amt-pod ${cls}"><b>${pos}</b><div><small>${label}</small><span>${names.map((p) => esc(name(p))).join('<br>')}</span></div></div>`
    parts.push(`<div class="amt-podium">
      ${pod(1, 'Vincitore', [s.podium.first], 'first')}
      ${s.podium.second ? pod(2, 'Finalista', [s.podium.second]) : '<div></div>'}
      ${s.podium.third.length ? pod(3, s.podium.third.length > 1 ? 'Terzi a pari merito' : 'Terzo posto', s.podium.third) : '<div></div>'}
    </div>`)
  }

  parts.push(`<section class="amt-sec">
    <div class="amt-sec-head"><h2>Partecipanti</h2><span>${s.participants.length}</span></div>
    <div class="amt-people">${s.participants.map((p) => `<b>${esc(name(p))}</b>`).join(' · ')}</div>
  </section>`)

  for (const g of s.groups) {
    const title = s.groups.length > 1 ? `Girone ${esc(g.group.name)}` : 'Girone'
    const rows = g.standings
      .map(
        (r) => `<tr>
          <td class="pos">${r.position}</td>
          <td class="l name">${esc(name(r.playerId))}</td>
          <td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td>
          <td>${r.setsWon}–${r.setsLost}</td>
        </tr>`
      )
      .join('')
    parts.push(`<section class="amt-sec">
      <div class="amt-sec-head"><h2>${title}</h2><span>${g.matches.length} ${g.matches.length === 1 ? 'partita' : 'partite'}</span></div>
      <table class="amt-table">
        <thead><tr><th>#</th><th class="l">Giocatore</th><th>G</th><th>V</th><th>P</th><th>Set</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${results(g.matches)}
    </section>`)
  }

  if (s.bracket.length) {
    // Più turni ci sono, più le colonne sono strette: nomi abbreviati e caratteri un po' più piccoli.
    const cols = s.bracket.length
    const nameSize = cols <= 2 ? 36 : cols === 3 ? 30 : 25
    const scoreSize = nameSize + 6
    const setSize = cols <= 2 ? 20 : cols === 3 ? 17 : 15
    const who = (id: string) => esc(cols >= 3 ? short(name(id)) : name(id))
    const line = (p: string | null, score: number | null, win: boolean) => {
      if (p === BYE) return `<div class="amt-line bye" style="font-size:${nameSize}px"><span>X</span></div>`
      if (!p) return `<div class="amt-line tbd" style="font-size:${nameSize}px"><span>—</span></div>`
      const b = score != null ? `<b style="font-size:${scoreSize}px">${score}</b>` : ''
      return `<div class="amt-line ${win ? 'w' : ''}" style="font-size:${nameSize}px"><span>${who(p)}</span>${b}</div>`
    }
    const box = (n: BracketNode, final = false) => {
      const m = n.match
      // Il box mostra i giocatori nell'ordine del tabellone: punteggi girati se la partita è stata inserita al contrario.
      const flip = !!m && m.playerA !== n.a
      const sa = m ? (flip ? m.setsB : m.setsA) : null
      const sb = m ? (flip ? m.setsA : m.setsB) : null
      const st = m ? setsText(flip ? m.setScores?.map(([x, y]) => [y, x] as [number, number]) : m.setScores) : ''
      const bye = n.a === BYE || n.b === BYE
      return `<div class="amt-box ${final ? 'final' : ''}">
        ${line(n.a, sa, bye ? n.a !== BYE : !!m && n.winner === n.a)}
        ${line(n.b, sb, bye ? n.b !== BYE : !!m && n.winner === n.b)}
        ${st ? `<div class="sets" style="font-size:${setSize}px">${st}</div>` : ''}
      </div>`
    }
    const slotH = cols <= 2 ? 176 : cols === 3 ? 150 : 128
    const height = s.bracket[0].nodes.length * slotH
    const html = s.bracket
      .map(
        (r) => `<div class="amt-col">
          <div class="amt-col-head">${r.label}</div>
          <div class="amt-slots" style="height:${height}px">${r.nodes.map((n) => box(n, r.round === 1)).join('')}</div>
          ${r.round === 1 && s.third ? `<div class="amt-third"><small>Finale 3º posto</small>${box(s.third)}</div>` : ''}
        </div>`
      )
      .join('')
    parts.push(`<section class="amt-sec">
      <div class="amt-sec-head"><h2>Tabellone</h2><span>X = passa il turno</span></div>
      <div class="amt-bracket">${html}</div>
    </section>`)
  }

  if (s.others.length) {
    parts.push(`<section class="amt-sec">
      <div class="amt-sec-head"><h2>${s.groups.length || s.bracket.length ? 'Altri risultati' : 'Risultati'}</h2><span>${s.others.length}</span></div>
      ${results(s.others)}
    </section>`)
  }

  return `<div class="amt-card">
    <header class="amt-head">
      <div class="amt-top amt-mono"><span>Tornei e partite interne tennistavolo</span><span>Torneo</span></div>
      <h1 class="amt-title" style="font-size:${titleSize}px">${esc(l1)}${l2 ? `<br><span>${esc(l2)}</span>` : ''}</h1>
      <div class="amt-date">${esc(info)}</div>
    </header>
    ${parts.join('')}
    <footer class="amt-foot">
      <span>Punteggi dei set dal punto di vista<br>del giocatore scritto per primo</span>
      <span>Le partite del torneo valgono per la<br>classifica Amatori con K ${t.k}</span>
    </footer>
  </div>`
}
