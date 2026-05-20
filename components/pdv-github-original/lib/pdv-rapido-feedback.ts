import { OMNIGESTAO_PDV_RAPIDO_BEEP_KEY } from "@/lib/omnigestao-pdv-modo"

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  return new Ctx()
}

/** Bip curto opcional (localStorage `omnigestao-pdv-rapido-beep` === `"1"`). */
export function playPdvRapidoItemBeepIfEnabled(): void {
  if (typeof window === "undefined") return
  try {
    if (window.localStorage.getItem(OMNIGESTAO_PDV_RAPIDO_BEEP_KEY) !== "1") return
  } catch {
    return
  }
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.075)
    osc.onended = () => {
      ctx.close().catch(() => {})
    }
  } catch {
    /* ignore */
  }
}
