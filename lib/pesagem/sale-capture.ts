/**
 * Proposta de peso para venda a partir de uma leitura da WeightSession (#294).
 *
 * PREPARAÇÃO — não está ligada a nenhuma tela nem ao writer de vendas. O servidor continua
 * aceitando somente `weightSource: "manual"` (peso digitado e confirmado pelo operador).
 *
 * Regra de protocolo: nenhum perfil físico está homologado para captura de venda. A Toledo
 * Prix 3 Fit NÃO tem parser aqui: o protocolo real precisa ser comprovado na loja (ver
 * docs/padaria/pesagem/TOLEDO_PRIX3_FIT_PROTOCOLO.md). Não inventar frames nem comandos.
 */
import { compareDecimal } from "./mass"
import type { WeightSnapshot } from "./session"

export type ScaleCaptureProfileId = "simulated-v1" | "explicit-unit-ascii-v1" | "and-hvg-stream" | "toledo-prix3-fit"
export type ScaleCaptureProfile = Readonly<{
  id: ScaleCaptureProfileId
  /** Protocolo efetivamente implementado no código (parser existente). */
  parserAvailable: boolean
  /** Homologação física concluída e autorizada para propor peso de venda. */
  saleCaptureHomologated: boolean
  status: "SIMULATED_ONLY" | "VISOR_READONLY" | "UNVERIFIED" | "PENDING_PHYSICAL_HOMOLOGATION"
}>

export const SCALE_CAPTURE_PROFILES: Readonly<Record<ScaleCaptureProfileId, ScaleCaptureProfile>> = Object.freeze({
  "simulated-v1": Object.freeze({ id: "simulated-v1", parserAvailable: true, saleCaptureHomologated: false, status: "SIMULATED_ONLY" }),
  "explicit-unit-ascii-v1": Object.freeze({ id: "explicit-unit-ascii-v1", parserAvailable: true, saleCaptureHomologated: false, status: "UNVERIFIED" }),
  "and-hvg-stream": Object.freeze({ id: "and-hvg-stream", parserAvailable: true, saleCaptureHomologated: false, status: "VISOR_READONLY" }),
  "toledo-prix3-fit": Object.freeze({ id: "toledo-prix3-fit", parserAvailable: false, saleCaptureHomologated: false, status: "PENDING_PHYSICAL_HOMOLOGATION" }),
})

export type SaleWeightRejection =
  | "unknown_profile" | "protocol_not_implemented" | "protocol_not_homologated"
  | "product_not_kg" | "context_mismatch" | "no_reading" | "not_ready" | "unstable" | "stale"
  | "not_net_weight" | "zero" | "negative" | "precision_exceeded" | "above_limit"

export type SaleWeightProposal =
  | { ok: true; grams: number; kg: number; kilograms: string; simulated: boolean; reading: { sessionId: string; sequence: number; receivedAt: number; protocolId: string } }
  | { ok: false; reason: SaleWeightRejection; message: string }

const MESSAGES: Record<SaleWeightRejection, string> = {
  unknown_profile: "Perfil de balança desconhecido.",
  protocol_not_implemented: "Protocolo desta balança ainda não implementado. Digite o peso manualmente.",
  protocol_not_homologated: "Captura da balança não homologada para venda. Digite o peso manualmente.",
  product_not_kg: "Produto não é vendido por KG.",
  context_mismatch: "Leitura de outra sessão de pesagem.",
  no_reading: "Sem leitura da balança.",
  not_ready: "Balança sem leitura válida.",
  unstable: "Peso instável. Aguarde estabilizar.",
  stale: "Leitura vencida. Pese novamente.",
  not_net_weight: "Leitura não é peso líquido.",
  zero: "Peso zero.",
  negative: "Peso negativo.",
  precision_exceeded: "Peso com mais de 3 casas decimais.",
  above_limit: "Peso acima do limite permitido.",
}
const reject = (reason: SaleWeightRejection): SaleWeightProposal => ({ ok: false, reason, message: MESSAGES[reason] })

/** Mesmo teto de saleQuantityGrams (manual-kg-contract). */
const MAX_GRAMS = 2_000_000_000_000

export function proposeSaleWeight(input: {
  profileId: string
  snapshot: WeightSnapshot
  /** Contexto da venda atual (terminal/produto) — leitura de outro contexto é recusada. */
  contextId: string
  productUnit: string
  now: number
  validForMs: number
  /** Somente bancada sintética: permite o perfil simulado e marca o resultado como simulado. */
  bench?: boolean
}): SaleWeightProposal {
  const profile = (SCALE_CAPTURE_PROFILES as Record<string, ScaleCaptureProfile | undefined>)[input.profileId]
  if (!profile) return reject("unknown_profile")
  if (!profile.parserAvailable) return reject("protocol_not_implemented")
  const benchSimulated = input.bench === true && profile.id === "simulated-v1"
  if (!profile.saleCaptureHomologated && !benchSimulated) return reject("protocol_not_homologated")
  if (input.productUnit !== "KG") return reject("product_not_kg")
  const { snapshot } = input
  if (snapshot.contextId !== input.contextId) return reject("context_mismatch")
  const reading = snapshot.reading
  if (snapshot.status === "unstable") return reject("unstable")
  if (snapshot.status === "stale") return reject("stale")
  if (snapshot.status === "zero") return reject("zero")
  if (snapshot.status === "negative") return reject("negative")
  if (snapshot.status === "gross_weight" || snapshot.status === "unknown_weight_basis") return reject("not_net_weight")
  if (!reading) return reject("no_reading")
  if (!snapshot.usable || snapshot.status !== "ready") return reject("not_ready")
  if (reading.sessionId !== snapshot.sessionId || reading.contextId !== input.contextId) return reject("context_mismatch")
  if (reading.simulated !== benchSimulated) return reject("protocol_not_homologated")
  if (!Number.isFinite(input.now) || !(input.validForMs > 0) || input.now - reading.receivedAt >= input.validForMs || input.now < reading.receivedAt) return reject("stale")
  if (reading.basis !== "net") return reject("not_net_weight")
  if (!reading.stability.stable) return reject("unstable")
  const kilograms = reading.mass.kilograms
  const sign = compareDecimal(kilograms, "0")
  if (sign === 0) return reject("zero")
  if (sign < 0) return reject("negative")
  const [whole, fraction = ""] = kilograms.split(".")
  if (/[1-9]/.test(fraction.slice(3))) return reject("precision_exceeded")
  const gramsBig = BigInt(whole) * BigInt(1000) + BigInt((fraction.slice(0, 3)).padEnd(3, "0"))
  if (gramsBig <= BigInt(0)) return reject("zero")
  if (gramsBig > BigInt(MAX_GRAMS)) return reject("above_limit")
  const grams = Number(gramsBig)
  return {
    ok: true,
    grams,
    kg: grams / 1000,
    kilograms,
    simulated: benchSimulated,
    reading: { sessionId: reading.sessionId, sequence: reading.sequence, receivedAt: reading.receivedAt, protocolId: reading.protocolId },
  }
}

/**
 * Diagnóstico passivo de porta: resume bytes recebidos SEM interpretar marca/protocolo.
 * Serve para coletar evidência do protocolo real da Toledo (nada é transmitido à balança).
 */
export function summarizeRawCapture(chunks: ReadonlyArray<{ at: number; bytes: Uint8Array }>, maxHexBytes = 512) {
  const all: number[] = []
  for (const chunk of chunks) for (const byte of chunk.bytes) all.push(byte)
  const terminators = { lf: 0, cr: 0, crlf: 0, etx: 0, stx: 0 }
  for (let i = 0; i < all.length; i++) {
    if (all[i] === 0x0a) terminators.lf++
    if (all[i] === 0x0d) { terminators.cr++; if (all[i + 1] === 0x0a) terminators.crlf++ }
    if (all[i] === 0x03) terminators.etx++
    if (all[i] === 0x02) terminators.stx++
  }
  const printable = all.filter((b) => b >= 0x20 && b <= 0x7e).length
  const gaps = chunks.slice(1).map((c, i) => c.at - chunks[i].at)
  return {
    totalBytes: all.length,
    chunks: chunks.length,
    printableRatio: all.length ? printable / all.length : 0,
    terminators,
    hasNonAscii: all.some((b) => b > 0x7e),
    medianGapMs: gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
    hexPreview: all.slice(0, maxHexBytes).map((b) => b.toString(16).padStart(2, "0")).join(" "),
    asciiPreview: all.slice(0, maxHexBytes).map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".")).join(""),
    protocolClaim: null,
  }
}
