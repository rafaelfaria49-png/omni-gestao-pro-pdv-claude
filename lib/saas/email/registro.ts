import type { AdaptadorEmail, MensagemEmail, ResultadoEnvio } from "@/lib/saas/email/tipos"

/**
 * Modo REGISTRO: não envia nada. A notificação termina com status `registrado` na outbox
 * (nunca `enviado`), para que ninguém confunda registro com entrega.
 * É o padrão enquanto domínio, DNS e credenciais não estiverem aprovados.
 */
export function criarAdaptadorRegistro(log: (linha: string) => void = (l) => console.info(l)): AdaptadorEmail {
  return {
    nome: "registro",
    async enviar(m: MensagemEmail): Promise<ResultadoEnvio> {
      log(`[saas] email_registrado_sem_envio chave=${m.idempotencyKey}`)
      return { ok: true, provedor: "registro", mensagemId: `registro:${m.idempotencyKey}`, enviadoDeVerdade: false }
    },
  }
}

/** Adaptador de teste: captura as mensagens e permite roteirizar falhas. Nunca envia. */
export function criarAdaptadorTeste(roteiro: ResultadoEnvio[] = []) {
  const enviados: MensagemEmail[] = []
  const fila = [...roteiro]
  const adaptador: AdaptadorEmail = {
    nome: "teste",
    async enviar(m) {
      enviados.push(m)
      const proximo = fila.shift()
      if (proximo) return proximo
      return { ok: true, provedor: "teste", mensagemId: `teste:${enviados.length}`, enviadoDeVerdade: false }
    },
  }
  return { adaptador, enviados }
}
