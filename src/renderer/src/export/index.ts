import { toPng } from 'html-to-image'
import { fmtDelta, formatDate, formatLongDate, matchesCsv, standingsCsv, tournamentLabel, tournamentText, whatsappText } from '@core/format'
import type { TournamentSummary } from '@core/tournament'
import type { Computed } from '@core/standings'
import type { AppData } from '@core/types'
import { FONT_FACE_CSS, fontsReady } from '../fonts'
import { CARD_WIDTH, INK, INK_2, INK_3, PAPER, RED, RED_INK, esc } from './palette'
import { TOURNAMENT_CSS, tournamentHtml } from './tournament'

export { CARD_WIDTH }

// Un'unica grafica della classifica (quella vista da tutti nel gruppo), usata per PNG, PDF e anteprima.
// Nome pubblico "Tornei e partite interne tennistavolo", niente logo: è sempre chiara, qualunque sia il tema dell'app.

const CARD_CSS = `
.amr-card{width:${CARD_WIDTH}px;min-height:1350px;box-sizing:border-box;padding:72px 80px 64px;display:flex;flex-direction:column;
  background:#F5F2EB;color:${INK};font-family:'IBM Plex Sans',sans-serif;text-align:left}
.amr-card *{box-sizing:border-box}
.amr-mono{font-family:'IBM Plex Mono',monospace}
.amr-head{display:flex;flex-direction:column;gap:18px;padding-bottom:32px;border-bottom:6px solid ${INK}}
.amr-top{display:flex;justify-content:space-between;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:${INK_2}}
.amr-title{margin:0;font-family:'Barlow Condensed',sans-serif;font-size:128px;line-height:.85;font-weight:700;text-transform:uppercase;letter-spacing:-.005em}
.amr-title span{color:${RED}}
.amr-date{font-size:24px;color:${INK_2}}
.amr-cols,.amr-row{display:grid;grid-template-columns:72px 72px minmax(0,1fr) 124px 88px 128px 136px;align-items:center}
.amr-cols{padding:22px 0 12px;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:${INK_3};border-bottom:2px solid #C2BCAD}
.amr-cols span{text-align:center}
.amr-cols span.l{text-align:left}
.amr-row{border-bottom:2px solid #DDD8CC}
.amr-pos{font-family:'Barlow Condensed',sans-serif;font-weight:700;line-height:1;text-align:center}
.amr-mv{font-family:'IBM Plex Mono',monospace;font-size:22px;text-align:center}
.amr-name{font-weight:600;line-height:1.15}
.amr-pts{font-family:'Barlow Condensed',sans-serif;font-weight:700;text-align:center}
.amr-var{font-family:'IBM Plex Mono',monospace;font-size:24px;text-align:center}
.amr-wl{font-family:'IBM Plex Mono',monospace;font-size:22px;text-align:center;color:${INK_2}}
.amr-down{color:${RED_INK}}
.amr-flat{color:${INK_3}}
.amr-new{display:inline-block;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3}}
.amr-foot{margin-top:auto;padding-top:40px;display:flex;justify-content:space-between;gap:24px;font-size:18px;color:${INK_3};line-height:1.5}
.amr-foot span:last-child{text-align:right}
`

export function rankingHtml(data: AppData, c: Computed, date: string): string {
  const active = c.standings.filter((s) => s.player.status === 'active')
  const retired = c.standings.filter((s) => s.player.status === 'retired')
  // Con tanti giocatori le righe si stringono, così l'immagine resta leggibile su WhatsApp.
  const n = active.length
  const size = n <= 8 ? { h: 108, name: 38, pos: 64, pts: 60 } : n <= 12 ? { h: 88, name: 33, pos: 52, pts: 50 } : { h: 72, name: 28, pos: 44, pts: 42 }

  const rows = active
    .map((s) => {
      const pos = s.position!
      const mv =
        s.positionChange == null
          ? '<span class="amr-new">nuovo</span>'
          : s.positionChange > 0
            ? `▲${s.positionChange}`
            : s.positionChange < 0
              ? `<span class="amr-down">▼${-s.positionChange}</span>`
              : '<span class="amr-flat">=</span>'
      const d = s.deltaSincePublish == null ? null : Math.round(s.deltaSincePublish)
      const dHtml = d == null ? '<span class="amr-flat">—</span>' : d < 0 ? `<span class="amr-down">${fmtDelta(d)}</span>` : fmtDelta(d)
      return `<div class="amr-row" style="height:${size.h}px">
        <span class="amr-pos" style="font-size:${size.pos}px${pos === 1 ? `;color:${RED}` : ''}">${pos}</span>
        <span class="amr-mv">${mv}</span>
        <div class="amr-name" style="font-size:${size.name}px">${esc(s.player.name)}</div>
        <span class="amr-pts" style="font-size:${size.pts}px">${Math.round(s.rating)}</span>
        <span class="amr-var">${dHtml}</span>
        <span class="amr-wl">${s.wins}–${s.losses}</span>
        <span class="amr-wl">${s.setsWon}–${s.setsLost}</span>
      </div>`
    })
    .join('')

  const valid = c.results.filter((r) => r.eval.counted && !r.pending).length
  const since = c.previousSnapshot ? ` · variazioni dal ${formatLongDate(c.previousSnapshot.date)}` : ''
  const season = data.season.name.replace(/^Stagione\s+/i, '')
  return `<div class="amr-card">
    <header class="amr-head">
      <div class="amr-top amr-mono"><span>Tornei e partite interne tennistavolo</span><span>Stagione ${esc(season)}</span></div>
      <h1 class="amr-title">Classifica<br><span>Amatori</span></h1>
      <div class="amr-date">Aggiornata al ${formatLongDate(date)}${since}</div>
    </header>
    <div class="amr-cols amr-mono"><span>#</span><span></span><span class="l">Giocatore</span><span>Punti</span><span>Var.</span><span>Par. (V–P)</span><span>Set (V–P)</span></div>
    ${rows}
    <footer class="amr-foot amr-mono">
      <span>${valid} partite valide${retired.length ? `<br>Inattivi: ${retired.map((s) => esc(s.player.name)).join(', ')}` : ''}</span>
      <span>In classifica ufficiale chi ha giocato<br>almeno ${data.settings.minMatchesPerPair} partite con ogni avversario</span>
    </footer>
  </div>`
}

export function rankingStyle(): string {
  return CARD_CSS
}

function fileDate(date: string) {
  return date.replace(/-/g, '')
}

/** Disegna fuori schermo una grafica (CSS + HTML della carta) e la restituisce come PNG. */
async function renderCardPng(css: string, html: string): Promise<string> {
  await fontsReady()
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;'
  host.innerHTML = `<style>${css}</style>${html}`
  document.body.appendChild(host)
  try {
    const node = host.lastElementChild as HTMLElement
    // Doppia risoluzione (2160px di larghezza): WhatsApp ricomprime le immagini, partire più nitidi
    // mantiene leggibili i numeri piccoli anche dopo la compressione.
    return await toPng(node, { pixelRatio: 2, backgroundColor: PAPER, fontEmbedCSS: FONT_FACE_CSS })
  } finally {
    host.remove()
  }
}

/** PDF A4: la grafica è larga 1080px e la si rimpicciolisce per farla stare nella pagina. */
function cardPdfHtml(css: string, cardClass: string, html: string): string {
  // Nel PDF la carta diventa un normale blocco (i salti pagina non funzionano dentro flex) e nessuna sezione
  // viene spezzata tra due pagine: se non ci sta, parte dalla pagina successiva.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONT_FACE_CSS}
    body{margin:0;background:${PAPER};-webkit-print-color-adjust:exact;print-color-adjust:exact}
    ${css}
    .${cardClass}{zoom:.66;min-height:0;display:block;padding-top:48px;padding-bottom:48px}
    .${cardClass} > *{break-inside:avoid;page-break-inside:avoid}
    .amt-card > *{margin-bottom:52px}
    .amt-card > footer{margin-bottom:0}
    .amr-row,.amt-res,.amt-table tr,.amt-box{break-inside:avoid;page-break-inside:avoid}
  </style></head><body>${html}</body></html>`
}

export async function renderPng(data: AppData, c: Computed, date: string): Promise<string> {
  return renderCardPng(CARD_CSS, rankingHtml(data, c, date))
}

export async function savePng(data: AppData, c: Computed, date: string) {
  const url = await renderPng(data, c, date)
  return window.api.saveFile({
    defaultName: `classifica-amatori-${fileDate(date)}.png`,
    filters: [{ name: 'Immagine PNG', extensions: ['png'] }],
    content: url.split(',')[1],
    encoding: 'base64'
  })
}

export async function copyPng(data: AppData, c: Computed, date: string) {
  await window.api.copyImage(await renderPng(data, c, date))
}

export async function savePdf(data: AppData, c: Computed, date: string) {
  const html = cardPdfHtml(CARD_CSS, 'amr-card', rankingHtml(data, c, date))
  return window.api.pdfFromHtml({ html, defaultName: `classifica-amatori-${fileDate(date)}.pdf` })
}

// ---------- Riepilogo torneo ----------

function tournamentFileName(s: TournamentSummary, ext: string) {
  const slug = s.label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'torneo'}-${fileDate(s.tournament.date)}.${ext}`
}

export async function copyTournamentPng(data: AppData, s: TournamentSummary) {
  await window.api.copyImage(await renderCardPng(TOURNAMENT_CSS, tournamentHtml(data, s)))
}

export async function saveTournamentPng(data: AppData, s: TournamentSummary) {
  const url = await renderCardPng(TOURNAMENT_CSS, tournamentHtml(data, s))
  return window.api.saveFile({
    defaultName: tournamentFileName(s, 'png'),
    filters: [{ name: 'Immagine PNG', extensions: ['png'] }],
    content: url.split(',')[1],
    encoding: 'base64'
  })
}

export async function saveTournamentPdf(data: AppData, s: TournamentSummary) {
  const html = cardPdfHtml(TOURNAMENT_CSS, 'amt-card', tournamentHtml(data, s))
  return window.api.pdfFromHtml({ html, defaultName: tournamentFileName(s, 'pdf') })
}

export async function copyTournamentText(data: AppData, s: TournamentSummary) {
  await window.api.copyText(tournamentText(data, s))
}

export { TOURNAMENT_CSS, tournamentHtml }

export async function saveCsv(data: AppData, c: Computed, date: string, kind: 'classifica' | 'partite') {
  return window.api.saveFile({
    defaultName: `${kind}-amatori-${fileDate(date)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    content: kind === 'classifica' ? standingsCsv(c) : matchesCsv(data, c)
  })
}

export async function saveXlsx(data: AppData, c: Computed, date: string) {
  const name = new Map(data.players.map((p) => [p.id, p.name]))
  const tour = new Map(data.tournaments.map((t) => [t.id, `${tournamentLabel(t)} (K ${t.k})`]))
  const standings = c.standings
  return window.api.saveXlsx({
    defaultName: `classifica-amatori-${fileDate(date)}.xlsx`,
    sheets: [
      {
        name: 'Classifica',
        columns: [
          { header: 'Pos', width: 6 },
          { header: 'Giocatore', width: 24 },
          { header: 'Punti', width: 9 },
          { header: 'Variazione', width: 11 },
          { header: 'Giocate', width: 9 },
          { header: 'Vinte', width: 8 },
          { header: 'Perse', width: 8 },
          { header: 'Set vinti', width: 10 },
          { header: 'Set persi', width: 10 },
          { header: 'In classifica ufficiale', width: 22 },
          { header: 'Stato', width: 10 }
        ],
        rows: standings.map((s) => [
          s.position,
          s.player.name,
          Math.round(s.rating),
          s.deltaSincePublish != null ? Math.round(s.deltaSincePublish) : null,
          s.played,
          s.wins,
          s.losses,
          s.setsWon,
          s.setsLost,
          s.qualified ? 'Sì' : 'No',
          s.player.status === 'retired' ? 'Inattivo' : 'Attivo'
        ]),
        highlightRows: standings.map((s, i) => (s.player.status === 'active' && !s.qualified ? i : -1)).filter((i) => i >= 0)
      },
      {
        name: 'Partite',
        columns: [
          { header: 'Data', width: 12 },
          { header: 'Torneo', width: 24 },
          { header: 'Giocatore 1', width: 22 },
          { header: 'Giocatore 2', width: 22 },
          { header: 'Risultato', width: 10 },
          { header: 'Vincitore', width: 22 },
          { header: 'Punti G1', width: 10 },
          { header: 'Punti G2', width: 10 },
          { header: 'Valida', width: 8 },
          { header: 'Motivo esclusione', width: 50 }
        ],
        rows: c.results.map((r) => {
          const m = r.match
          return [
            formatDate(m.date),
            m.tournamentId ? (tour.get(m.tournamentId) ?? 'Torneo') : '',
            name.get(m.playerA) ?? '',
            name.get(m.playerB) ?? '',
            `${m.setsA}-${m.setsB}`,
            name.get(m.setsA > m.setsB ? m.playerA : m.playerB) ?? '',
            r.eval.counted ? Number(r.deltaA.toFixed(1)) : null,
            r.eval.counted ? Number((-r.deltaA).toFixed(1)) : null,
            r.eval.counted ? 'Sì' : 'No',
            r.eval.reason ?? ''
          ]
        }),
        highlightRows: c.results.map((r, i) => (r.eval.counted ? -1 : i)).filter((i) => i >= 0)
      }
    ]
  })
}

export async function copyWhatsapp(data: AppData, c: Computed, date: string) {
  await window.api.copyText(whatsappText(data, c, date))
}
