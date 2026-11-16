/**
 * Contrato da linha de venda de aparelho individualizado (cliente ↔ servidor).
 * Só tipo/constantes — seguro para o bundle do navegador.
 */
export type DeviceSaleLineV1 = {
  version: 1
  aparelhoId: string
  /** Prazo contratual ADICIONAL escolhido (dias). A legal (90) é sempre aplicada pelo servidor. */
  contratualDias: number
  /** YYYY-MM-DD da entrega efetiva (default: data da venda). */
  dataEntrega?: string
  /** Token da reserva feita por este atendimento (aceita unidade `reservado` com o mesmo token). */
  reservaToken?: string
  acessoriosEntregues?: Record<string, boolean>
  observacoes?: string
}
