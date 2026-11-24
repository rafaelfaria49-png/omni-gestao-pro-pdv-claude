/**
 * Contrato de envio de email da plataforma (OMNI-SAAS-001A · arquitetura §8).
 * Os chamadores só conhecem esta interface; trocar Resend por SES não mexe neles.
 */

export type MensagemEmail = {
  para: string
  assunto: string
  texto: string
  html?: string
  /** Estável entre tentativas da MESMA notificação — o provedor descarta a repetição. */
  idempotencyKey: string
}

/**
 * - `transitorio`: pode tentar de novo (429, 5xx, credencial recusada, conflito de idempotência);
 * - `permanente`: tentar de novo não ajuda (destino inválido, payload recusado);
 * - `desconhecido`: o pedido pode ter chegado ao provedor (timeout, conexão caiu). Só é seguro
 *   repetir com a MESMA chave de idempotência, dentro da janela do provedor.
 */
export type TipoFalhaEnvio = "transitorio" | "permanente" | "desconhecido"

export type ResultadoEnvio =
  | { ok: true; provedor: string; mensagemId: string; enviadoDeVerdade: boolean }
  | { ok: false; tipo: TipoFalhaEnvio; codigo: string }

export interface AdaptadorEmail {
  readonly nome: string
  enviar(mensagem: MensagemEmail): Promise<ResultadoEnvio>
}
