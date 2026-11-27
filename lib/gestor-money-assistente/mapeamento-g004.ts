/**
 * Rascunho conversacional → PropostaGasto (contrato G004 `operacao-schema.ts`).
 *
 * Não existe aqui nenhum caminho de escrita: a proposta é entregue à PortaExecucao,
 * que a revalida com `normalizarPropostaGasto` dentro de `prepararRevisaoGasto`.
 * Receita, recebimento e transferência NÃO têm contrato G004 — retornam erro explícito.
 */
import type { PropostaGasto } from "@/lib/gastos/operacao-schema"
import { meioDiaSaoPaulo } from "./datas"
import type { Rascunho } from "./tipos"

const MEIOS_G004 = ["pix", "dinheiro", "debito", "transferencia", "boleto"] as const

export type MapeamentoResultado = { ok: true; proposta: PropostaGasto } | { ok: false; codigo: string }

/** Divide em centavos exatos; o resto vai para a primeira parcela (soma sempre igual ao total). */
export function dividirParcelas(totalCentavos: string, n: number): string[] {
  const total = BigInt(totalCentavos), qtd = BigInt(n)
  const base = total / qtd, resto = total % qtd
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base).toString())
}

function descricao(r: Rascunho): string {
  const d = r.dados
  const texto = d.descricao ?? d.categoria ?? (d.contraparte ? `${rotuloIntencao(r)} — ${d.contraparte}` : rotuloIntencao(r))
  return texto.slice(0, 500)
}

export function rotuloIntencao(r: Pick<Rascunho, "intencao">): string {
  switch (r.intencao) {
    case "DESPESA": return "Despesa"
    case "DIVIDA": return "Conta a pagar"
    case "PAGAMENTO": return "Pagamento de conta"
    case "COMPRA_CREDITO": return "Compra no crédito"
    case "PARCELAMENTO": return "Compra parcelada"
    case "RECEITA": return "Receita"
    case "RECEBIMENTO": return "Recebimento"
    case "TRANSFERENCIA": return "Transferência"
    case "PAGAMENTO_FATURA": return "Pagamento de fatura"
  }
}

export function propostaDoRascunho(r: Rascunho, agora: Date, hoje: string): MapeamentoResultado {
  const d = r.dados
  if (!d.valorCentavos && !(r.intencao === "PAGAMENTO" && d.quitar)) return { ok: false, codigo: "valor_ausente" }
  const dataGasto = d.dataEconomica ?? hoje
  const dataPagamento = dataGasto === hoje ? agora.toISOString() : meioDiaSaoPaulo(dataGasto)
  const fato = {
    descricao: descricao(r), valorCentavos: d.valorCentavos!, moeda: "BRL" as const, dataGasto,
    ...(d.categoriaId ? { categoriaId: d.categoriaId } : {}),
    ...(d.contraparte ? { contraparteTexto: d.contraparte.slice(0, 500) } : {}),
    ...(d.documentoId ? { documentoId: d.documentoId } : {}),
  }
  const meio = MEIOS_G004.find(m => m === d.formaPagamento)
  switch (r.intencao) {
    case "DESPESA":
      if (!d.carteiraId) return { ok: false, codigo: "conta_ausente" }
      if (!meio) return { ok: false, codigo: "forma_pagamento_ausente" }
      return { ok: true, proposta: { tipo: "GASTO_PAGO", ...fato, carteiraId: d.carteiraId, formaPagamento: meio, dataPagamento } }
    case "DIVIDA":
      if (!d.vencimento) return { ok: false, codigo: "vencimento_ausente" }
      return { ok: true, proposta: { tipo: "CONTA_PAGAR", ...fato, vencimento: d.vencimento } }
    case "COMPRA_CREDITO":
    case "PARCELAMENTO": {
      const n = d.parcelas ?? 1
      if (!d.cicloIds || d.cicloIds.length !== n) return { ok: false, codigo: "ciclos_ausentes" }
      const valores = dividirParcelas(d.valorCentavos!, n)
      return { ok: true, proposta: { tipo: "COMPRA_CREDITO", ...fato, parcelas: d.cicloIds.map((cicloId, i) => ({
        cicloId, valorCentavos: valores[i], numero: i + 1, total: n })) } }
    }
    case "PAGAMENTO":
      if (!d.tituloId) return { ok: false, codigo: "titulo_ausente" }
      if (!d.carteiraId) return { ok: false, codigo: "conta_ausente" }
      if (!meio) return { ok: false, codigo: "forma_pagamento_ausente" }
      return { ok: true, proposta: { tipo: "PAGAR_TITULO", tituloId: d.tituloId, moeda: "BRL",
        ...(d.quitar ? { quitar: true } : { valorCentavos: d.valorCentavos!, quitar: false }),
        carteiraId: d.carteiraId, formaPagamento: meio, dataPagamento,
        ...(d.documentoId ? { documentoId: d.documentoId } : {}) } }
    case "TRANSFERENCIA":
      // #405: TRANSFERENCIA_INTERNA — mesmo perfil, sem fato/pagamento, fora de receita/despesa.
      if (!d.carteiraId || !d.carteiraDestinoId) return { ok: false, codigo: "conta_ausente" }
      if (d.carteiraId === d.carteiraDestinoId) return { ok: false, codigo: "transferencia_mesma_conta" }
      return { ok: true, proposta: { tipo: "TRANSFERENCIA_INTERNA", valorCentavos: d.valorCentavos!, moeda: "BRL",
        carteiraOrigemId: d.carteiraId, carteiraDestinoId: d.carteiraDestinoId, dataPagamento,
        descricao: `Transferência ${d.carteiraNome ?? ""} → ${d.carteiraDestinoNome ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 500) } }
    case "PAGAMENTO_FATURA":
      // #405: PAGAR_FATURA — alocação explícita por título do MESMO ciclo; o G004 revalida cada restante no COMMIT.
      if (!d.cicloId || !d.alocacoesFatura?.length) return { ok: false, codigo: "fatura_ausente" }
      if (!d.carteiraId) return { ok: false, codigo: "conta_ausente" }
      if (!meio) return { ok: false, codigo: "forma_pagamento_ausente" }
      return { ok: true, proposta: { tipo: "PAGAR_FATURA", cicloId: d.cicloId, alocacoes: d.alocacoesFatura.map(a => ({ ...a })),
        moeda: "BRL", carteiraId: d.carteiraId, formaPagamento: meio, dataPagamento } }
    case "RECEITA":
    case "RECEBIMENTO":
      return { ok: false, codigo: "sem_contrato_g004" }
  }
}
