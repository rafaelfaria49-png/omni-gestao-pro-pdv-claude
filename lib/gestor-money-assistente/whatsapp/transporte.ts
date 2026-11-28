/**
 * Transportes de saída do canal de GESTÃO.
 *
 * - `transporteSimulado`: grava em memória (testes/demonstração). Nenhum byte sai da máquina.
 * - `transporteMetaGestao`: reutiliza o cliente Graph existente (`sendTextMessage`, credencial por canal via
 *   `credencialRef`). DESLIGADO: só constrói com `GESTOR_MONEY_WHATSAPP_ENVIO_REAL=habilitado`, que nenhum
 *   ambiente desta entrega define. Mesmo construído, o worker G006 só aceita transporte SIMULADO para o
 *   resultado financeiro (`processarClaim`), então nada real sai sem um gate próprio de ativação.
 * - `transporteResultadoG006`: adapta a mensagem RESULTADO_PERSISTIDO da outbox G006 para texto no mesmo chat.
 */
import { sendTextMessage } from "@/lib/whatsapp"
import type { MensagemResultado, TransporteSimulado as TransporteResultadoSimulado } from "@/lib/gastos/outbox"
import { formatarCentavos } from "../texto"
import type { MensagemConversa, ResultadoTransporte, TransporteConversa } from "./respostas"

export type EnvioRegistrado = { para: string; texto: string; externalMessageId: string; canalId: string }

export function transporteSimulado(opts: { falhas?: Array<ResultadoTransporte | "EXCECAO"> } = {}) {
  const enviados: EnvioRegistrado[] = []
  const falhas = [...(opts.falhas ?? [])]
  let n = 0
  const t: TransporteConversa & { enviados: EnvioRegistrado[]; falharProxima(r: ResultadoTransporte | "EXCECAO"): void } = {
    modo: "SIMULADO", enviados,
    falharProxima(r) { falhas.push(r) },
    async enviar(m: MensagemConversa) {
      const f = falhas.shift()
      if (f === "EXCECAO") throw new Error("falha simulada após cruzar a fronteira")
      if (f) return f
      const externalMessageId = `wamid.SIMULADO.${++n}.${m.respostaRef.slice(0, 8)}`
      enviados.push({ para: m.destinatarioE164, texto: m.texto, externalMessageId, canalId: m.canalId })
      return { tipo: "ACEITO", externalMessageId }
    },
  }
  return t
}

export const ENVIO_REAL_HABILITADO = () => process.env.GESTOR_MONEY_WHATSAPP_ENVIO_REAL === "habilitado"

/** Meta Cloud API real — bloqueado por padrão (ver cabeçalho). */
export function transporteMetaGestao(): TransporteConversa {
  if (!ENVIO_REAL_HABILITADO()) throw new Error("ENVIO_REAL_DESABILITADO")
  return {
    modo: "META",
    async enviar(m) {
      try {
        const r = await sendTextMessage(m.credenciais, m.destinatarioE164.replace(/\D/g, ""), m.texto) as { messages?: Array<{ id?: string }> }
        const id = r?.messages?.[0]?.id
        return id ? { tipo: "ACEITO", externalMessageId: id } : { tipo: "FALHA", falha: { tipo: "DESCONHECIDA" } }
      } catch (e) {
        const status = Number(/\((\d{3})\)/.exec(String((e as Error)?.message ?? ""))?.[1])
        return { tipo: "FALHA", falha: Number.isFinite(status) ? { tipo: "HTTP", status } : { tipo: "DESCONHECIDA" } }
      }
    },
  }
}

export function textoResultado(m: MensagemResultado): string {
  const valor = typeof m.payload.resultado.valorCentavos === "string" ? formatarCentavos(m.payload.resultado.valorCentavos) : null
  return `Registrado ✅${valor ? ` ${valor}` : ""} · operação ${m.payload.operacaoId.slice(0, 8)}. Consulte o detalhe no Gestor Money.`
}

/** Saída do job G006 ENVIAR_RESULTADO pelo mesmo número de gestão (somente modo SIMULADO, exigência do G006). */
export function transporteResultadoG006(conversa: ReturnType<typeof transporteSimulado>): TransporteResultadoSimulado {
  return {
    modo: "SIMULADO",
    async enviar(m) {
      const r = await conversa.enviar({ canalId: m.canalId, phoneNumberId: m.phoneNumberId, destinatarioE164: m.destinatarioE164,
        texto: textoResultado(m), credenciais: m.credenciais, respostaRef: m.payload.operacaoId })
      return r
    },
  }
}
