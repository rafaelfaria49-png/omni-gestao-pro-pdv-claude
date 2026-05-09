/**
 * Tempo confiável para checagem de vencimento.
 * Usa o relógio do servidor — em ambiente serverless o cliente não tem acesso ao SO.
 * Não chama APIs externas de horário (ex.: worldtimeapi, ipapi); evita latência e dependência de terceiros.
 */
export async function getTrustedTimeMs(): Promise<number> {
  return Date.now()
}
