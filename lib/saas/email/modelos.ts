/**
 * Modelos de email da plataforma. SAAS-001A traz só o modelo técnico de verificação da
 * infraestrutura; a régua (verificação de cadastro, boas-vindas, vencimento…) é do 001B/005.
 */

export type EmailRenderizado = { assunto: string; texto: string }

const MODELOS: Record<string, (dados: Record<string, unknown>) => EmailRenderizado> = {
  "saas.teste_infra": (dados) => ({
    assunto: "OmniGestão Pro — teste da infraestrutura de email",
    texto: `Mensagem técnica de verificação da infraestrutura de email da plataforma.${typeof dados.referencia === "string" ? `\nReferência: ${dados.referencia.slice(0, 64)}` : ""}`,
  }),
}

export function modeloExiste(modelo: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODELOS, modelo)
}

export function renderizarModelo(modelo: string, dados: unknown): EmailRenderizado | null {
  if (!modeloExiste(modelo)) return null
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : {}
  return MODELOS[modelo](d)
}
