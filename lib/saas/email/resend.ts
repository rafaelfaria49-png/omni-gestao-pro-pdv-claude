import type { AdaptadorEmail, MensagemEmail, ResultadoEnvio } from "@/lib/saas/email/tipos"

/**
 * Adaptador Resend (provedor escolhido — D-11). REST direto (`POST /emails`), sem SDK novo.
 * Usa o cabeçalho `Idempotency-Key` (janela de 24 h do provedor) para que uma repetição após
 * resultado desconhecido não gere segundo email.
 *
 * Nunca registra a chave da API, o corpo da mensagem nem o destino.
 * SAAS-001A: só é instanciado por `resolverAdaptadorEmail` com `SAAS_EMAIL_ENVIO=on` e
 * configuração completa — e mesmo assim restrito aos destinos de teste.
 */

export const RESEND_ENDPOINT = "https://api.resend.com/emails"

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number
  json(): Promise<unknown>
}>

export function classificarRespostaResend(status: number): ResultadoEnvio | null {
  if (status >= 200 && status < 300) return null
  if (status === 429 || status >= 500) return { ok: false, tipo: "transitorio", codigo: `http_${status}` }
  // Credencial recusada é problema de configuração: corrigível sem perder a mensagem.
  if (status === 401 || status === 403) return { ok: false, tipo: "transitorio", codigo: `credencial_${status}` }
  // 409 = mesma chave de idempotência ainda em processamento no provedor.
  if (status === 409) return { ok: false, tipo: "transitorio", codigo: "idempotencia_em_andamento" }
  return { ok: false, tipo: "permanente", codigo: `http_${status}` }
}

export function criarAdaptadorResend(cfg: {
  apiKey: string
  remetente: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}): AdaptadorEmail {
  const fetchImpl: FetchLike = cfg.fetchImpl ?? ((url, init) => fetch(url, init))
  const timeoutMs = cfg.timeoutMs ?? 10_000
  return {
    nome: "resend",
    async enviar(m: MensagemEmail): Promise<ResultadoEnvio> {
      let resposta: Awaited<ReturnType<FetchLike>>
      try {
        resposta = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": m.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({ from: cfg.remetente, to: [m.para], subject: m.assunto, text: m.texto, ...(m.html ? { html: m.html } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        // Timeout ou conexão: o provedor pode ter recebido. Repetir só com a mesma chave.
        return { ok: false, tipo: "desconhecido", codigo: "sem_resposta" }
      }
      const falha = classificarRespostaResend(resposta.status)
      if (falha) return falha
      let id = ""
      try {
        const corpo = (await resposta.json()) as { id?: unknown }
        id = typeof corpo?.id === "string" ? corpo.id : ""
      } catch {
        id = ""
      }
      // 2xx sem id: aceito pelo provedor, mas sem comprovante — não reenviar (evita duplicata).
      return { ok: true, provedor: "resend", mensagemId: id || "resend:sem-id", enviadoDeVerdade: true }
    },
  }
}
