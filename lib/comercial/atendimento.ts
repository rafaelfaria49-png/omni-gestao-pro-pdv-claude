/**
 * Atendimento comercial da página `/gestao-lojas` (caixa de pedidos da plataforma).
 * Funções puras: montam o link de contato com o interessado e o texto de instruções
 * de entrada. A senha temporária NUNCA entra no texto — ela vai em mensagem separada.
 */

/**
 * WhatsApp do interessado como link `wa.me`. O formulário grava só dígitos (10 a 13).
 * Número nacional (10–11 dígitos, com DDD) ganha o 55; com 12–13 dígitos precisa já
 * começar com 55. Qualquer outra coisa devolve `null` (sem link quebrado na tela).
 */
export function linkWhatsappInteressado(whatsapp: string): string | null {
  const d = whatsapp.replace(/\D/g, "")
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `https://wa.me/${d}`
  return null
}

/** Texto para o cliente entrar pela primeira vez. Não inclui a senha. */
export function instrucoesDeAcesso(args: { loginUrl: string; email: string; nomeLoja: string }): string {
  return [
    `Olá! O acesso da loja ${args.nomeLoja} ao OmniGestão Pro está liberado.`,
    "",
    `1. Entre em ${args.loginUrl}`,
    `2. Use o email ${args.email} e a senha temporária que enviaremos em outra mensagem.`,
    "3. No primeiro acesso o sistema pede uma senha nova, só sua.",
    "",
    "Use no Chrome ou no Edge do computador da loja. Qualquer dúvida, responda esta mensagem.",
  ].join("\n")
}
