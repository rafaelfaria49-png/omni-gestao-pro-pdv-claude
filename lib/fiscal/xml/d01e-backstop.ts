/**
 * Backstop D01e — regra SEFAZ-SP contra caracteres de edição (GOAL-023).
 *
 * A regra oficial D01e rejeita (cStat 588) mensagem com caracteres de edição no
 * início/fim ou entre tags. Este módulo é o detector puro e fail-closed usado no
 * boundary final antes de qualquer transporte: ele APENAS recusa, nunca limpa
 * bytes já assinados.
 *
 * O que é proibido (formatação):
 *  - whitespace antes da raiz (`\n<NFe/>`, ` <NFe/>`);
 *  - whitespace depois da raiz (`<NFe/>\n`, `<NFe/> `);
 *  - whitespace de formatação ENTRE tags: espaço, TAB, CR ou LF entre `>` e `<`,
 *    ex.: `</tag>\n<tag>` ou `</tag>   <tag>`.
 *
 * O que permanece válido (legítimo):
 *  - espaços DENTRO de valores de texto e atributos,
 *    ex.: `<xProd>CABO USB C</xProd>` — os espaços estão entre letras, não entre `><`.
 *
 * Puro, sem rede, sem segredo, sem parser: a detecção é léxica sobre `><`.
 * Boa-formação continua sendo autoridade do parser/XSD a jusante.
 */

/** Violações D01e. Nenhuma carrega conteúdo do documento. */
export type D01eViolationCode =
  | "d01e_espaco_antes_da_raiz"
  | "d01e_espaco_depois_da_raiz"
  | "d01e_espaco_formatacao_entre_tags"

/** Erro estável e sanitizado da recusa D01e — lançado/recusado sem conteúdo fiscal. */
export class D01eBackstopError extends Error {
  readonly code: D01eViolationCode
  constructor(code: D01eViolationCode, message: string) {
    super(message)
    this.name = "D01eBackstopError"
    this.code = code
  }
}

const INTERTAG_FORMATTING_WS = />([ \t\r\n]+)</

/**
 * Conta ocorrências de whitespace de formatação entre tags.
 * `0` = compacto; `>0` = causa mecânica do 588 presente.
 */
export function countIntertagFormattingWhitespace(xml: string): number {
  if (typeof xml !== "string" || xml.length === 0) return 0
  const hits = xml.match(/>([ \t\r\n]+)</g)
  return hits ? hits.length : 0
}

/**
 * Devolve a violação D01e ou `null` quando a área de dados é D01e-segura.
 * Ordem: bordas primeiro (antes/depois da raiz), depois o miolo entre tags.
 */
export function d01eViolation(xml: string): D01eViolationCode | null {
  if (typeof xml !== "string" || xml.length === 0) return "d01e_espaco_antes_da_raiz"
  const first = xml[0]!
  const last = xml[xml.length - 1]!
  if (first === " " || first === "\t" || first === "\n" || first === "\r") {
    return "d01e_espaco_antes_da_raiz"
  }
  if (last === " " || last === "\t" || last === "\n" || last === "\r") {
    return "d01e_espaco_depois_da_raiz"
  }
  if (INTERTAG_FORMATTING_WS.test(xml)) return "d01e_espaco_formatacao_entre_tags"
  return null
}

/** `true` quando a área de dados pode seguir para transporte sem violar a D01e. */
export function isD01eSafe(xml: string): boolean {
  return d01eViolation(xml) === null
}

/** Igual a `d01eViolation`, mas falha fechada. Nunca altera os bytes recebidos. */
export function assertD01eSafe(xml: string): void {
  const violacao = d01eViolation(xml)
  if (violacao) {
    throw new D01eBackstopError(
      violacao,
      `Área de dados recusada pela regra D01e (${violacao}); transporte bloqueado sem transformação.`,
    )
  }
}
