/** Probabilità attesa di vittoria di A contro B (formula Elo standard). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

/** Variazione di punti per A. B riceve lo stesso valore con segno opposto. */
export function eloDelta(ratingA: number, ratingB: number, aWon: boolean, k: number): number {
  return k * ((aWon ? 1 : 0) - expectedScore(ratingA, ratingB))
}
