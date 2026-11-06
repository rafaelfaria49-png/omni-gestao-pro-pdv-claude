/** Preferência visual; não é uma capability nem habilita venda por peso. */
export function resolvePdvScaleVisorVisible(
  explicit: unknown,
  primaryBranch: unknown,
  ready: boolean,
): boolean {
  if (!ready) return false
  return typeof explicit === "boolean" ? explicit : primaryBranch === "padaria"
}
