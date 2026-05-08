/**
 * Tempo confiável para checagem de vencimento.
 * Usa o relógio do servidor — em ambiente serverless o cliente não tem acesso ao SO.
 */
export async function getTrustedTimeMs(): Promise<number> {
  return Date.now()
}
