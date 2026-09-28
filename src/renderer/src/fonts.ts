// Font inclusi nell'app come data URL: funzionano senza rete (in palestra potrebbe non esserci)
// e si possono passare così come sono all'immagine e al PDF esportati.
import barlow600 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2?inline'
import barlow700 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?inline'
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?inline'
import plex500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?inline'
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?inline'
import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?inline'

const FONTS: { family: string; weight: number; url: string }[] = [
  { family: 'Barlow Condensed', weight: 600, url: barlow600 },
  { family: 'Barlow Condensed', weight: 700, url: barlow700 },
  { family: 'IBM Plex Sans', weight: 400, url: plex400 },
  { family: 'IBM Plex Sans', weight: 500, url: plex500 },
  { family: 'IBM Plex Sans', weight: 600, url: plex600 },
  { family: 'IBM Plex Mono', weight: 500, url: mono500 }
]

/** Regole @font-face con i font incorporati. */
export const FONT_FACE_CSS = FONTS.map(
  (f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(${f.url}) format('woff2')}`
).join('\n')

export function installFonts() {
  const style = document.createElement('style')
  style.textContent = FONT_FACE_CSS
  document.head.appendChild(style)
}

/** Aspetta che i font siano pronti (prima di disegnare l'immagine da esportare). */
export async function fontsReady() {
  await Promise.all(FONTS.map((f) => document.fonts.load(`${f.weight} 16px '${f.family}'`)))
}
