/**
 * Padrão global de nomes de cadastro (OMNI-CADASTROS-PADRAO-GLOBAL-UX-001).
 *
 * Funções PURAS (sem I/O) usadas no cliente e no servidor por todos os cadastros
 * do HUB: produtos, categorias, marcas, fornecedores, clientes, técnicos, serviços
 * e modelos de equipamento. Mesma regra que o catálogo de vestuário já aplica
 * (`lib/vestuario/catalog-normalize.ts` → `cleanLabel`/`labelKey`).
 *
 * Princípios:
 * - Espaços são sempre limpos (pontas, repetidos, NBSP, caracteres invisíveis).
 * - Capitalização só é sugerida quando o texto veio TODO em minúsculas ou TODO em
 *   maiúsculas e o campo é de pessoa/rótulo. Grafia mista ("iPhone", "McDonald",
 *   "LG K62") é intenção do usuário e é preservada.
 * - Marcas, modelos, produtos, SKU, EAN, IMEI e identificadores NUNCA passam por
 *   capitalização — só por limpeza de espaços.
 * - Duplicidade compara sem caixa, sem acento e sem espaço extra.
 */

const INVISIVEIS = /[​-‍⁠﻿­]/g
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** NFC, sem invisíveis/controle, espaços (inclusive NBSP e quebras) colapsados e aparados. */
export function limparTextoCadastro(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
    .normalize("NFC")
    .replace(INVISIVEIS, "")
    .replace(CONTROLE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Chave de comparação: sem caixa, sem acento, espaços colapsados. "  Película  3D " ≡ "pelicula 3d". */
export function chaveNomeCadastro(value: unknown): string {
  return limparTextoCadastro(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
}

/**
 * - `pessoa`: nomes de clientes, técnicos e contatos ("JOÃO DA SILVA" → "João da Silva").
 * - `rotulo`: categorias, tipos e serviços — só a primeira letra quando tudo veio em minúsculas
 *   ("capinhas" → "Capinhas"; "CAPINHAS" e "Capas iPhone" ficam como vieram).
 * - `preservar`: produtos, marcas, modelos, fornecedores, códigos — apenas limpeza de espaços.
 */
export type EstiloNomeCadastro = "pessoa" | "rotulo" | "preservar"

const CONECTORES_PESSOA = new Set(["de", "da", "do", "das", "dos", "e"])
const ROMANO = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x{1,3}|xi{1,3}|xiv|xv)$/i

function temLetra(s: string): boolean {
  return /\p{L}/u.test(s)
}

function caixaUniforme(s: string): "minuscula" | "maiuscula" | "mista" {
  const letras = s.replace(/[^\p{L}]/gu, "")
  if (!letras) return "mista"
  if (letras === letras.toLocaleLowerCase("pt-BR")) return "minuscula"
  if (letras === letras.toLocaleUpperCase("pt-BR")) return "maiuscula"
  return "mista"
}

function primeiraMaiuscula(parte: string): string {
  if (!parte) return parte
  const lower = parte.toLocaleLowerCase("pt-BR")
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1)
}

/** Siglas usuais em nome de cliente/contato que nunca viram "Ltda"/"Me". */
const SIGLAS_PESSOA = new Set(["ltda", "me", "epp", "eireli", "mei", "sa", "s/a", "s.a.", "cia", "ti"])

/** Palavra só de consoantes ("PJ", "JR", "CNPJ", "MG") é sigla — não é nome. */
function pareceSigla(palavra: string): boolean {
  const letras = palavra.replace(/[^\p{L}]/gu, "")
  if (letras.length >= 2 && !/[aeiouyáàâãéêíóôõúü]/i.test(letras)) return true
  return SIGLAS_PESSOA.has(palavra.toLocaleLowerCase("pt-BR"))
}

function capitalizarPalavraPessoa(palavra: string, indice: number, veioMaiuscula: boolean): string {
  const lower = palavra.toLocaleLowerCase("pt-BR")
  if (indice > 0 && CONECTORES_PESSOA.has(lower)) return lower
  if (/\d/.test(palavra)) return palavra
  if (veioMaiuscula && pareceSigla(palavra)) return palavra
  if (indice > 0 && ROMANO.test(palavra)) return palavra.toLocaleUpperCase("pt-BR")
  // Hífen e apóstrofo: "ANA-MARIA" → "Ana-Maria", "D'ÁVILA" → "D'Ávila".
  return lower
    .split(/([-'’])/)
    .map((p) => (p === "-" || p === "'" || p === "’" ? p : primeiraMaiuscula(p)))
    .join("")
}

/** Aplica o padrão do campo. Nunca muda letras de grafia mista nem tokens com dígitos. */
export function padronizarNomeCadastro(value: unknown, estilo: EstiloNomeCadastro): string {
  const limpo = limparTextoCadastro(value)
  if (!limpo || estilo === "preservar" || !temLetra(limpo)) return limpo
  const caixa = caixaUniforme(limpo)
  if (caixa === "mista") return limpo
  if (estilo === "rotulo") {
    if (caixa !== "minuscula") return limpo
    return limpo.charAt(0).toLocaleUpperCase("pt-BR") + limpo.slice(1)
  }
  return limpo
    .split(" ")
    .map((palavra, i) => capitalizarPalavraPessoa(palavra, i, caixa === "maiuscula"))
    .join(" ")
}

/**
 * Valor final a gravar. Na edição (`atual` informado), se o texto enviado é o mesmo já
 * gravado — só espaços de diferença — o valor legado fica intacto: inativar uma
 * categoria ou editar o telefone de um cliente nunca recapitaliza o cadastro.
 * Só o que o usuário realmente alterou passa pelo padrão.
 */
export function nomeCadastroParaGravar(
  digitado: unknown,
  estilo: EstiloNomeCadastro,
  atual?: string | null,
): string {
  const limpo = limparTextoCadastro(digitado)
  if (atual !== undefined && atual !== null && limparTextoCadastro(atual) === limpo) return atual
  return padronizarNomeCadastro(limpo, estilo)
}

const COLLATOR =new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })

/** Ordem alfabética pt-BR: ignora caixa/acento e ordena números naturalmente ("iPhone 9" < "iPhone 11"). */
export function compararNomesPtBR(a: unknown, b: unknown): number {
  return COLLATOR.compare(limparTextoCadastro(a), limparTextoCadastro(b))
}

/** Cópia ordenada por nome (não muta a lista original). */
export function ordenarPorNome<T>(rows: readonly T[], getNome: (row: T) => unknown): T[] {
  return [...rows].sort((a, b) => compararNomesPtBR(getNome(a), getNome(b)))
}

/**
 * Busca local tolerante: sem caixa/acento; todos os termos digitados precisam aparecer
 * em algum dos campos ("pelicula iphone" acha "Película 3D iPhone 13").
 */
export function correspondeBuscaCadastro(campos: readonly unknown[], consulta: string): boolean {
  const termos = chaveNomeCadastro(consulta).split(" ").filter(Boolean)
  if (termos.length === 0) return true
  const alvo = campos.map((c) => chaveNomeCadastro(c)).join(" ")
  return termos.every((t) => alvo.includes(t))
}

/** União sem duplicar por chave; a primeira grafia vence; resultado em ordem pt-BR. */
export function unirNomesCadastro(...listas: ReadonlyArray<readonly unknown[]>): string[] {
  const vistos = new Map<string, string>()
  for (const lista of listas) {
    for (const item of lista) {
      const nome = limparTextoCadastro(item)
      const chave = chaveNomeCadastro(nome)
      if (chave && !vistos.has(chave)) vistos.set(chave, nome)
    }
  }
  return Array.from(vistos.values()).sort(compararNomesPtBR)
}

/**
 * Procura outro registro com o mesmo nome (por chave). `ignorarId` exclui o próprio
 * registro na edição. Retorna o primeiro encontrado ou null.
 */
export function encontrarNomeDuplicado<T extends { id: string }>(
  nome: unknown,
  rows: readonly T[],
  getNome: (row: T) => unknown,
  ignorarId?: string | null,
): T | null {
  const chave = chaveNomeCadastro(nome)
  if (!chave) return null
  return rows.find((r) => r.id !== ignorarId && chaveNomeCadastro(getNome(r)) === chave) ?? null
}

/** Só dígitos — comparação de CNPJ/CPF/telefone. */
export function digitosCadastro(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "")
}

/**
 * Em produção o Next.js troca a mensagem de erro de Server Action por um texto genérico
 * em inglês (só o digest chega). Mostra a mensagem real quando ela existe e o fallback
 * em português quando o erro veio mascarado ou vazio.
 */
export function mensagemErroCadastro(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const msg = limparTextoCadastro(raw)
  if (!msg || msg === "undefined" || msg === "[object Object]") return fallback
  if (/Server Components render|omitted in production|digest/i.test(msg)) return fallback
  return msg
}
