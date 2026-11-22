const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/** Compara versões x.y.z. Lança erro em formato inválido (nunca adivinha). */
export function compareSemver(a: string, b: string): number {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (!ma || !mb) throw new Error(`versão inválida: ${a} / ${b}`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}
