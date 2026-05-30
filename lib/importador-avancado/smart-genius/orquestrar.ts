// ============================================================
// lib/importador-avancado/smart-genius/orquestrar.ts
// Cola entre a rota /api/import/advanced e o adaptador Smart Genius.
//
// separarSmart()  → identifica quais arquivos são Smart (clientes/contas a
//                   receber) e devolve os DEMAIS para o fluxo genérico intacto.
// persistirSmartSeparado() → persiste só os Smart, devolvendo totais no MESMO
//                   formato do route genérico (totais/porDominio/log).
//
// Server-only (usa parser que importa "xlsx" e persistência Prisma).
// ============================================================

import { parsearArquivoSmart } from "./parser"
import { persistirClientesSmart, persistirContasReceberSmart } from "./persistir"
import type { SmartClientesParse, SmartContasReceberParse, SmartGeniusLayout } from "./tipos"

export type SmartDominio = "clientes" | "contas_receber"

export type SmartArquivoDetectado = {
  arquivo: string
  layout: SmartGeniusLayout
  dominio: SmartDominio
  label: string
  totalLinhas: number
  validos: number
  invalidos: number
  /** Quantidade de títulos que serão materializados (só contas a receber). */
  titulosPrevistos?: number
}

export type SmartSeparacao = {
  detectados: SmartArquivoDetectado[]
  clientes: SmartClientesParse[]
  contas: SmartContasReceberParse[]
  /** Arquivos NÃO-Smart — seguem para `parsearArquivos` genérico sem alteração. */
  restantes: Array<{ buffer: Buffer; nome: string }>
}

const LABEL: Record<SmartDominio, string> = {
  clientes: "Smart Genius — Clientes",
  contas_receber: "Smart Genius — Contas a Receber",
}

/** Conta quantos títulos cada conta gera (atraso>0 + a vencer>0). */
function contarTitulos(p: SmartContasReceberParse): number {
  let n = 0
  for (const c of p.validos) {
    if (c.emAtraso > 0) n++
    if (c.aVencer > 0) n++
  }
  return n
}

/**
 * Particiona os arquivos: Smart (clientes/contas) vs resto.
 * Arquivos que falham na detecção Smart vão para `restantes` (fluxo genérico).
 * ZIPs e demais extensões nunca são Smart aqui — caem direto em `restantes`.
 */
export async function separarSmart(
  arquivos: Array<{ buffer: Buffer; nome: string }>,
): Promise<SmartSeparacao> {
  const sep: SmartSeparacao = { detectados: [], clientes: [], contas: [], restantes: [] }

  for (const arq of arquivos) {
    const ext = arq.nome.toLowerCase().split(".").pop() ?? ""
    // Só tentamos Smart em planilha única (.xls/.xlsx/.ods). ZIP/CSV → genérico.
    if (!["xls", "xlsx", "xlsm", "ods"].includes(ext)) {
      sep.restantes.push(arq)
      continue
    }

    let parse
    try {
      parse = await parsearArquivoSmart(arq.buffer, arq.nome)
    } catch {
      sep.restantes.push(arq)
      continue
    }

    if (!parse.ok) {
      sep.restantes.push(arq)
      continue
    }

    if ("clientes" in parse) {
      sep.clientes.push(parse.clientes)
      sep.detectados.push({
        arquivo: arq.nome,
        layout: "smart_clientes",
        dominio: "clientes",
        label: LABEL.clientes,
        totalLinhas: parse.clientes.totalLinhasLidas,
        validos: parse.clientes.validos.length,
        invalidos: parse.clientes.invalidos.length,
      })
    } else {
      sep.contas.push(parse.contas)
      sep.detectados.push({
        arquivo: arq.nome,
        layout: "smart_contas_receber",
        dominio: "contas_receber",
        label: LABEL.contas_receber,
        totalLinhas: parse.contas.totalLinhasLidas,
        validos: parse.contas.validos.length,
        invalidos: parse.contas.invalidos.length,
        titulosPrevistos: contarTitulos(parse.contas),
      })
    }
  }

  return sep
}

export type SmartPersistAgregado = {
  totais: { criados: number; atualizados: number; ignorados: number; erros: number }
  porDominio: Record<string, { criados: number; atualizados: number; erros: number }>
  errosDetalhados: Array<{ dominio: string; chave: string; detalhe: string }>
}

/** Persiste os arquivos Smart já separados. Clientes ANTES de contas (ordem de dependência lógica). */
export async function persistirSmartSeparado(
  storeId: string,
  sep: SmartSeparacao,
): Promise<SmartPersistAgregado> {
  const agg: SmartPersistAgregado = {
    totais: { criados: 0, atualizados: 0, ignorados: 0, erros: 0 },
    porDominio: {},
    errosDetalhados: [],
  }

  const acumular = (dominio: SmartDominio, r: Awaited<ReturnType<typeof persistirClientesSmart>>) => {
    const slot = (agg.porDominio[dominio] ??= { criados: 0, atualizados: 0, erros: 0 })
    slot.criados += r.criados
    slot.atualizados += r.atualizados
    slot.erros += r.erros
    agg.totais.criados += r.criados
    agg.totais.atualizados += r.atualizados
    agg.totais.ignorados += r.pulados
    agg.totais.erros += r.erros
    for (const l of r.log) {
      if (l.acao === "erro") {
        agg.errosDetalhados.push({ dominio, chave: l.chave, detalhe: l.detalhe ?? "erro" })
      }
    }
  }

  // 1) Clientes primeiro.
  for (const p of sep.clientes) {
    const r = await persistirClientesSmart(storeId, p.validos)
    acumular("clientes", r)
  }
  // 2) Contas a receber (referenciam o cliente por nome — já criado acima).
  for (const p of sep.contas) {
    const r = await persistirContasReceberSmart(storeId, p.validos)
    acumular("contas_receber", r)
  }

  return agg
}
