import { toPng } from 'html-to-image'
import { formatDate, matchesCsv, signed, standingsCsv, whatsappText } from '@core/format'
import type { Computed } from '@core/standings'
import type { AppData } from '@core/types'

// Un'unica grafica della classifica, usata sia per il PNG sia per il PDF.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const CARD_CSS = `
.amr-card{width:760px;box-sizing:border-box;padding:28px 32px 22px;background:#ffffff;color:#0f172a;
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
.amr-card *{box-sizing:border-box}
.amr-head{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:3px solid #1e3a8a;margin-bottom:10px}
.amr-ball{width:46px;height:46px;border-radius:50%;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:26px}
.amr-title{font-size:26px;font-weight:800;letter-spacing:.04em;color:#1e3a8a;line-height:1.1}
.amr-sub{font-size:14px;color:#475569;margin-top:2px}
.amr-t{width:100%;border-collapse:collapse;font-size:15px}
.amr-t th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600;text-align:left;padding:8px 6px;border-bottom:1px solid #e2e8f0}
.amr-t td{padding:7px 6px;border-bottom:1px solid #f1f5f9}
.amr-t .n{text-align:right;font-variant-numeric:tabular-nums}
.amr-t .amr-pos{width:40px;font-weight:700;text-align:center}
.amr-t .name{font-weight:600}
.amr-t .pts{font-weight:800;font-size:17px;color:#1e3a8a}
.amr-t tr.top1 td{background:#fef3c7}.amr-t tr.top2 td{background:#f1f5f9}.amr-t tr.top3 td{background:#ffedd5}
.amr-t tr.unq .name,.amr-t tr.unq .pts{color:#b91c1c}
.amr-t tr.ret td{color:#94a3b8}
.up{color:#15803d;font-weight:600}.down{color:#b91c1c;font-weight:600}.eq{color:#94a3b8}
.amr-badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:9px;background:#fee2e2;color:#b91c1c;margin-left:6px;font-weight:600}
.amr-foot{margin-top:14px;font-size:12px;color:#64748b;display:flex;justify-content:space-between;gap:16px}
`

export function rankingHtml(data: AppData, c: Computed, date: string): string {
  const medals = ['🥇', '🥈', '🥉']
  const rows = c.standings
    .map((s) => {
      const ret = s.player.status === 'retired'
      const pos = s.position
      const cls = ret ? 'ret' : !s.qualified ? 'unq' : pos && pos <= 3 ? `top${pos}` : ''
      const mv =
        ret || s.positionChange == null
          ? '<span class="eq">–</span>'
          : s.positionChange > 0
            ? `<span class="up">▲${s.positionChange}</span>`
            : s.positionChange < 0
              ? `<span class="down">▼${-s.positionChange}</span>`
              : '<span class="eq">=</span>'
      const d = s.deltaSincePublish == null ? '' : Math.round(s.deltaSincePublish)
      const dHtml = d === '' ? '<span class="eq">–</span>' : d > 0 ? `<span class="up">${signed(d)}</span>` : d < 0 ? `<span class="down">${d}</span>` : '<span class="eq">0</span>'
      return `<tr class="${cls}">
        <td class="amr-pos">${ret ? '' : pos && pos <= 3 ? medals[pos - 1] : pos}</td>
        <td class="n">${mv}</td>
        <td class="name">${esc(s.player.name)}${ret ? ' <span class="eq">(ritirato)</span>' : !s.qualified ? '<span class="amr-badge">fuori classifica</span>' : ''}</td>
        <td class="n pts">${Math.round(s.rating)}</td>
        <td class="n">${dHtml}</td>
        <td class="n">${s.played}</td>
        <td class="n">${s.wins}</td>
        <td class="n">${s.losses}</td>
        <td class="n">${s.setsWon}-${s.setsLost}</td>
      </tr>`
    })
    .join('')
  const valid = c.results.filter((r) => r.eval.counted).length
  const since = c.lastSnapshot ? `Variazioni rispetto al ${formatDate(c.lastSnapshot.date)}` : 'Prima pubblicazione'
  return `<div class="amr-card">
    <div class="amr-head">
      <div class="amr-ball">🏓</div>
      <div><div class="amr-title">CLASSIFICA AMATORI</div>
      <div class="amr-sub">${esc(data.season.name)} · aggiornata al ${formatDate(date)}</div></div>
    </div>
    <table class="amr-t">
      <thead><tr><th class="amr-pos">#</th><th></th><th>Giocatore</th><th class="n">Punti</th><th class="n">Var.</th><th class="n">G</th><th class="n">V</th><th class="n">P</th><th class="n">Set</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="amr-foot">
      <span>${since} · ${valid} partite valide</span>
      <span>In rosso: meno di ${data.settings.minMatchesPerPair} partite con qualche avversario</span>
    </div>
  </div>`
}

export function rankingStyle(): string {
  return CARD_CSS
}

function fileDate(date: string) {
  return date.replace(/-/g, '')
}

export async function renderPng(data: AppData, c: Computed, date: string): Promise<string> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;'
  host.innerHTML = `<style>${CARD_CSS}</style>${rankingHtml(data, c, date)}`
  document.body.appendChild(host)
  try {
    const node = host.querySelector('.amr-card') as HTMLElement
    return await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff' })
  } finally {
    host.remove()
  }
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;display:flex;justify-content:center;background:#fff}
    ${CARD_CSS}
    .amr-card{width:100%}
  </style></head><body>${rankingHtml(data, c, date)}</body></html>`
  return window.api.pdfFromHtml({ html, defaultName: `classifica-amatori-${fileDate(date)}.pdf` })
}

export async function saveCsv(data: AppData, c: Computed, date: string, kind: 'classifica' | 'partite') {
  return window.api.saveFile({
    defaultName: `${kind}-amatori-${fileDate(date)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    content: kind === 'classifica' ? standingsCsv(c) : matchesCsv(data, c)
  })
}

export async function saveXlsx(data: AppData, c: Computed, date: string) {
  const name = new Map(data.players.map((p) => [p.id, p.name]))
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
          s.player.status === 'retired' ? 'Ritirato' : 'Attivo'
        ]),
        highlightRows: standings.map((s, i) => (s.player.status === 'active' && !s.qualified ? i : -1)).filter((i) => i >= 0)
      },
      {
        name: 'Partite',
        columns: [
          { header: 'Data', width: 12 },
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
