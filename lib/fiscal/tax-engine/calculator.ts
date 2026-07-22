/**
 * Calculador do Motor Tributário (Tax Engine) — Fase F2 · ponto de orquestração PURO.
 *
 * `calculateTax(input)` recebe uma venda fiscal e devolve o cálculo tributário completo,
 * determinístico e sem efeitos colaterais. NÃO acessa banco/rede/estado; é função de input→output.
 *
 * Pipeline:
 *   1. Resolve arredondamento.                 2. Valida (erros bloqueiam → ok:false).
 *   3. Rateia acessórios (frete/seguro/outras/desconto) por item.
 *   4. Calcula base/valor tributável + ICMS/PIS/COFINS por item (via rules.ts).
 *   5. Agrega os totais da nota.                6. Monta o resultado tipado.
 *
 * Baseline (Simples Nacional / consumidor final / interna / sem ST): nenhum imposto é destacado
 * (valores 0) — comportamento fiscal CORRETO, não um mock. O motor já carrega as estruturas
 * (base, alíquota, situação, crédito do Simples, Lei da Transparência) para a expansão futura.
 */
import type {
  TaxEngineInput,
  TaxEngineItemResult,
  TaxEngineResult,
  TaxEngineTotais,
} from "./types"
import { TAX_ENGINE_VERSION } from "./types"
import { applyAliquota, num, resolverAcessorioPorItem, sumBy } from "./helpers"
import { resolveRounding, roundMoney } from "./rounding"
import { resolveCofins, resolveIcms, resolvePis } from "./rules"
import { validateInput } from "./validators"

export function calculateTax(input: TaxEngineInput): TaxEngineResult {
  const cfg = resolveRounding(input.rounding)
  const regime = input.regime
  const ambito = input.ambito ?? "interna"
  const destino = input.destino ?? "consumidor_final"

  const { errors, warnings } = validateInput(input)
  if (errors.length > 0) {
    return {
      ok: false,
      regime,
      ambito,
      destino,
      itens: [],
      totais: zeroTotais(),
      warnings,
      errors,
      meta: { engineVersion: TAX_ENGINE_VERSION, rounding: cfg, semDestaque: true },
    }
  }

  const itensInput = input.itens
  const n = itensInput.length

  // 1) Bruto por item (vProd) e pesos do rateio.
  const brutos = itensInput.map((it) => roundMoney(num(it.quantidade) * num(it.valorUnitario), cfg))

  // 2) Acessórios efetivos por item: item-level tem precedência; senão rateia o total da nota.
  const descontos = resolverAcessorioPorItem(
    itensInput.map((it) => it.descontoValor),
    input.descontoTotal,
    brutos,
    cfg,
  )
  const fretes = resolverAcessorioPorItem(
    itensInput.map((it) => it.freteValor),
    input.freteTotal,
    brutos,
    cfg,
  )
  const seguros = resolverAcessorioPorItem(
    itensInput.map((it) => it.seguroValor),
    input.seguroTotal,
    brutos,
    cfg,
  )
  const outras = resolverAcessorioPorItem(
    itensInput.map((it) => it.outrasDespesasValor),
    input.outrasDespesasTotal,
    brutos,
    cfg,
  )

  // 3) Cálculo por item.
  const itens: TaxEngineItemResult[] = itensInput.map((it, i) => {
    const valorBruto = brutos[i]
    const desconto = descontos[i]
    const frete = fretes[i]
    const seguro = seguros[i]
    const outrasDespesas = outras[i]

    const valorLiquido = roundMoney(valorBruto - desconto, cfg)
    const valorTributavel = roundMoney(valorBruto - desconto + frete + seguro + outrasDespesas, cfg)

    const icms = resolveIcms({
      regime,
      csosn: it.csosn,
      valorTributavel,
      pCredSN: it.pCredSN,
      // ST retida (CSOSN 500) — repassada crua; rules.ts normaliza/ecoa (nunca inventa base).
      st: {
        vBCSTRet: it.vBCSTRet,
        pST: it.pST,
        vICMSSubstituto: it.vICMSSubstituto,
        vICMSSTRet: it.vICMSSTRet,
        vBCFCPSTRet: it.vBCFCPSTRet,
        pFCPSTRet: it.pFCPSTRet,
        vFCPSTRet: it.vFCPSTRet,
        pRedBCEfet: it.pRedBCEfet,
        vBCEfet: it.vBCEfet,
        pICMSEfet: it.pICMSEfet,
        vICMSEfet: it.vICMSEfet,
      },
      cfg,
    })
    const pis = resolvePis({ regime, valorTributavel, cfg })
    const cofins = resolveCofins({ regime, valorTributavel, cfg })

    const valorAproximadoTributos = roundMoney(applyAliquota(valorTributavel, num(it.aproximadoTributosPercent)), cfg)
    const tributosDestacados = roundMoney(icms.valor + pis.valor + cofins.valor, cfg)

    const itemWarnings: string[] = []
    if (icms.situacao === "nao_destacado") {
      itemWarnings.push("ICMS não destacado (Simples Nacional — recolhido no DAS).")
    }
    if (icms.situacao === "st") {
      itemWarnings.push("ICMS já retido por Substituição Tributária (CSOSN 500 — substituído).")
    }

    return {
      index: i + 1,
      id: it.id ?? null,
      quantidade: num(it.quantidade),
      valorUnitario: num(it.valorUnitario),
      valorBruto,
      desconto,
      frete,
      seguro,
      outrasDespesas,
      valorLiquido,
      valorTributavel,
      icms,
      pis,
      cofins,
      valorAproximadoTributos,
      tributosDestacados,
      warnings: itemWarnings,
    }
  })

  // 4) Agregação dos totais.
  const valorProdutos = roundMoney(sumBy(itens, (i) => i.valorBruto), cfg)
  const valorDesconto = roundMoney(sumBy(itens, (i) => i.desconto), cfg)
  const valorFrete = roundMoney(sumBy(itens, (i) => i.frete), cfg)
  const valorSeguro = roundMoney(sumBy(itens, (i) => i.seguro), cfg)
  const valorOutrasDespesas = roundMoney(sumBy(itens, (i) => i.outrasDespesas), cfg)
  const baseCalculoIcms = roundMoney(sumBy(itens, (i) => i.icms.baseCalculo), cfg)
  const valorIcms = roundMoney(sumBy(itens, (i) => i.icms.valor), cfg)
  const valorPis = roundMoney(sumBy(itens, (i) => i.pis.valor), cfg)
  const valorCofins = roundMoney(sumBy(itens, (i) => i.cofins.valor), cfg)
  const valorTotalTributos = roundMoney(valorIcms + valorPis + valorCofins, cfg)
  const valorAproximadoTributos = roundMoney(sumBy(itens, (i) => i.valorAproximadoTributos), cfg)
  const valorTotalNota = roundMoney(
    valorProdutos - valorDesconto + valorFrete + valorSeguro + valorOutrasDespesas,
    cfg,
  )

  const totais: TaxEngineTotais = {
    valorProdutos,
    valorDesconto,
    valorFrete,
    valorSeguro,
    valorOutrasDespesas,
    baseCalculoIcms,
    valorIcms,
    valorPis,
    valorCofins,
    valorTotalTributos,
    valorAproximadoTributos,
    valorTotalNota,
  }

  const semDestaque = valorTotalTributos === 0

  return {
    ok: true,
    regime,
    ambito,
    destino,
    itens,
    totais,
    warnings,
    errors: [],
    meta: { engineVersion: TAX_ENGINE_VERSION, rounding: cfg, semDestaque },
  }
}

function zeroTotais(): TaxEngineTotais {
  return {
    valorProdutos: 0,
    valorDesconto: 0,
    valorFrete: 0,
    valorSeguro: 0,
    valorOutrasDespesas: 0,
    baseCalculoIcms: 0,
    valorIcms: 0,
    valorPis: 0,
    valorCofins: 0,
    valorTotalTributos: 0,
    valorAproximadoTributos: 0,
    valorTotalNota: 0,
  }
}
