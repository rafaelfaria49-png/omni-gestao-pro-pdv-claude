/** Conversões textuais: valores sensíveis não passam por aritmética float. */
export function decimalInput(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (!/^(0|[1-9]\d{0,15})([.,]\d{1,2})?$/.test(value)) throw new Error("DECIMAL_INVALIDO")
  const [integer, fraction = ""] = value.replace(",", ".").split(".")
  return integer + "." + fraction.padEnd(2, "0")
}
export function civilDisplay(value: string | null | undefined): string {
  if (!value) return "Não informado"
  const [year, month, day] = value.split("-")
  return day + "/" + month + "/" + year
}
export function moneyDisplay(value: string | null | undefined, hidden: boolean): string {
  if (hidden) return "Remuneração restrita"
  if (value == null) return "Não informado"
  const [whole, cents] = value.split(".")
  return "R$ " + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + cents
}
export const conflictCodes = ["VERSION_CONFLICT", "SUPERSESSAO_INVALIDA", "VIGENCIA_SOBREPOSTA"]
export const accessCodes = ["NAO_AUTENTICADO", "ESCOPO_NEGADO", "BOOTSTRAP_NEGADO", "LOJA_AUSENTE", "PESSOAS_DESABILITADO"]
const messages: Record<string, string> = {
  PESSOAS_DESABILITADO: "Pessoas está desativado neste ambiente.",
  NAO_AUTENTICADO: "Sua sessão terminou. Entre novamente.",
  ESCOPO_NEGADO: "Você não tem acesso a este cadastro nesta loja.",
  LOJA_AUSENTE: "Selecione uma loja autorizada para continuar.",
  BOOTSTRAP_NEGADO: "A configuração inicial exige um administrador autorizado.",
  VERSION_CONFLICT: "O cadastro mudou em outra sessão. Releia e revise antes de salvar.",
  SUPERSESSAO_INVALIDA: "Há uma versão mais recente do contrato. Releia e revise.",
  VIGENCIA_SOBREPOSTA: "A vigência conflita com o histórico. Releia e revise a data.",
  IDEMPOTENCIA_CONFLITO: "Este comando já foi usado com outros dados. Releia antes de iniciar outra alteração.",
  DUPLICIDADE: "Este cadastro já existe. Confira os dados informados.",
  DOCUMENTO_INDISPONIVEL: "O arquivo não está disponível. Solicite um novo envio ao responsável.",
  NAO_ENCONTRADO: "Registro não encontrado neste contexto.",
  STORAGE_INDISPONIVEL: "O armazenamento privado está indisponível.",
  PESSOAS_CHAVE_INDISPONIVEL: "A configuração privada de Pessoas está indisponível.",
  FALHA_INTERNA: "Não foi possível concluir. Tente novamente.",
  REDE: "Resposta não confirmada. Você pode repetir o mesmo comando.",
  DECIMAL_INVALIDO: "Informe um decimal sem separador de milhar, com até duas casas.",
  JORNADA_INVALIDA: "Informe jornada entre 0,00 e 168,00.",
  CPF_INVALIDO: "Confira o CPF informado.",
  INTENT_EXPIRADO: "A autorização de envio expirou. Confira a lista antes de enviar novamente.",
  PUT_FALHOU: "O envio ao armazenamento falhou. Confira conexão e headers autorizados.",
}
export function errorMessage(code: string) { return messages[code] ?? "Operação recusada (" + code + "). Confira os campos e suas permissões." }
