/**
 * Contador HUB · Pacote do Contador — geração de CSV segura (puro, sem IO).
 *
 * GOAL 008. Convenção alinhada ao exportador financeiro do projeto:
 * - separador `;` (padrão de planilha pt-BR);
 * - aspas duplas escapadas por duplicação;
 * - BOM UTF-8 para o Excel reconhecer acentos;
 * - fim de linha CRLF.
 *
 * Números são gerados por nós (fonte confiável) e NÃO passam pela neutralização de
 * fórmula — assim negativos legítimos (ex.: diferença de caixa) são preservados.
 * Células textuais passam por `neutralizarFormula` (defesa contra injeção em planilha).
 */
import { neutralizarFormula } from "./seguranca"

export const BOM_UTF8 = "﻿"
const SEP = ";"
const EOL = "\r\n"

/** Célula textual ou numérica de uma linha de CSV. */
export type CelulaCsv =
  | { readonly tipo: "texto"; readonly valor: string }
  | { readonly tipo: "numero"; readonly valor: number | null }

export function texto(valor: string): CelulaCsv {
  return { tipo: "texto", valor }
}

export function numero(valor: number | null): CelulaCsv {
  return { tipo: "numero", valor }
}

/** Escapa uma célula já renderizada como string (aspas/;/quebra de linha). */
function escapar(bruto: string): string {
  if (bruto.includes('"') || bruto.includes(SEP) || bruto.includes("\n") || bruto.includes("\r")) {
    return `"${bruto.replace(/"/g, '""')}"`
  }
  return bruto
}

function renderCelula(celula: CelulaCsv): string {
  if (celula.tipo === "numero") {
    // Ponto decimal (machine-friendly); nulo → vazio, jamais 0 silencioso.
    return celula.valor === null ? "" : escapar(String(celula.valor))
  }
  return escapar(neutralizarFormula(celula.valor))
}

/**
 * Monta um CSV completo (com BOM) a partir de um cabeçalho textual e linhas tipadas.
 * O cabeçalho é sempre textual.
 */
export function montarCsv(cabecalho: readonly string[], linhas: readonly CelulaCsv[][]): string {
  const linhaCabecalho = cabecalho.map((c) => escapar(neutralizarFormula(c))).join(SEP)
  const corpo = linhas.map((linha) => linha.map(renderCelula).join(SEP))
  return BOM_UTF8 + [linhaCabecalho, ...corpo].join(EOL) + EOL
}
