import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

export type CaixaOperacaoTipo = "sangria" | "suprimento"

export type RegistrarOperacaoResult =
  | { ok: true; deduped: boolean }
  | { ok: false; reason: "client_error" | "network" }

/**
 * Registra sangria/suprimento no servidor com **retry exponencial** + **idempotência
 * por `localId`**. Mesmo contrato usado pelo PDV Clássico: o endpoint
 * `/api/ops/caixa/operacao` deduplica por `localId` (gravado no `payload` JSONB),
 * então o retry NUNCA duplica a operação (Sprint 1.2).
 *
 * Helper compartilhado para que todos os PDVs (via `CaixaStatusBar`) usem o mesmo
 * fluxo seguro, sem reescrever a lógica de retry.
 */
export async function registrarOperacaoCaixaServer(params: {
  lojaId: string
  sessaoId: string
  tipo: CaixaOperacaoTipo
  valor: number
  motivo: string
  localId: string
  operador?: string
  maxAttempts?: number
}): Promise<RegistrarOperacaoResult> {
  const { lojaId, sessaoId, tipo, valor, motivo, localId, operador = "", maxAttempts = 4 } = params
  const body = JSON.stringify({ sessaoId, tipo, valor, motivo, operador, localId })

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch("/api/ops/caixa/operacao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: lojaId },
        body,
      })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { deduped?: boolean }
        return { ok: true, deduped: data.deduped === true }
      }
      // 4xx (período fechado, sessão inválida, permissão): não adianta retentar.
      if (res.status >= 400 && res.status < 500) {
        console.error("[caixa/operacao] HTTP", res.status, tipo, valor)
        return { ok: false, reason: "client_error" }
      }
      console.warn("[caixa/operacao] HTTP", res.status, "tentativa", attempt)
    } catch (err) {
      console.warn("[caixa/operacao] rede — tentativa", attempt, err)
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)))
    }
  }
  return { ok: false, reason: "network" }
}
