// Colori e utilità comuni alle grafiche esportate (sempre chiare, qualunque sia il tema dell'app).

export const CARD_WIDTH = 1080

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export const PAPER = '#F5F2EB'
export const INK = '#131A45'
export const INK_2 = '#454B6B'
export const INK_3 = '#6B6F86'
export const RED = '#C8231A'
export const RED_INK = '#B8201A'
export const RULE = '#DDD8CC'
export const RULE_STRONG = '#C2BCAD'
