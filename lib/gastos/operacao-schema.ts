import { createHash } from "node:crypto"
import { z } from "zod"
import { LIMITE_CENTAVOS } from "./financeiro-scope"

export class OperacaoGastoError extends Error {
  constructor(public readonly code: string, public readonly status = 422,
    message = "Não foi possível aplicar esta operação financeira. Confira os dados e a revisão.") {
    super(message)
    this.name = "OperacaoGastoError"
  }
}

export const identificadorOperacao = z.string().trim().min(1).max(191).regex(/^[^\u0000-\u001f\u007f]+$/)
export const chaveOperacao = identificadorOperacao.max(160)
const positivo = z.union([z.string().regex(/^\d{1,16}$/), z.number().finite().int().min(1).max(Number(LIMITE_CENTAVOS))])
  .refine(v => { try { return BigInt(v) > BigInt(0) && BigInt(v) <= LIMITE_CENTAVOS } catch { return false } })
  .transform(v => BigInt(v).toString())
export const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + "T00:00:00.000Z")
  return v.slice(0, 4) !== "0000" && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
})
export const instante = z.string().datetime({ offset: true }).transform(v => new Date(v).toISOString())
export const competencia = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
const moeda = z.literal("BRL").default("BRL")
export const MEIOS_PAGAMENTO_GASTO = ["pix", "dinheiro", "debito", "transferencia", "boleto"] as const
const meio = z.enum(MEIOS_PAGAMENTO_GASTO)
/** Ausência legada é explícita na compensação; não inventar um meio de pagamento. */
export function meioCompensacaoGasto(original: string | null | undefined): string {
  return MEIOS_PAGAMENTO_GASTO.some(meio => meio === original) ? original! : "nao_informado"
}
const texto = z.string().trim().min(1).max(500)
const fato = {
  descricao: texto, valorCentavos: positivo, moeda, dataGasto: dataCivil,
  competencia: competencia.optional(), categoriaId: identificadorOperacao.optional(),
  fornecedorId: identificadorOperacao.optional(), fornecedorNome: texto.optional(),
  fornecedorDocumento: z.string().trim().max(40).optional(), contraparteTexto: texto.optional(),
  documentoId: identificadorOperacao.optional(),
}
const estorno = { valorCentavos: positivo, moeda, dataPagamento: instante, motivo: z.string().trim().min(1).max(2000) }
const alocacao = z.object({ tituloId: identificadorOperacao, valorCentavos: positivo }).strict()
const parcela = z.object({ cicloId: identificadorOperacao, valorCentavos: positivo,
  numero: z.number().int().min(1).max(120), total: z.number().int().min(1).max(120) }).strict()

const propostaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("GASTO_PAGO"), ...fato, carteiraId: identificadorOperacao,
    formaPagamento: meio, dataPagamento: instante }).strict(),
  z.object({ tipo: z.literal("CONTA_PAGAR"), ...fato, vencimento: dataCivil,
    carteiraId: identificadorOperacao.optional() }).strict(),
  z.object({ tipo: z.literal("PAGAR_TITULO"), tituloId: identificadorOperacao,
    valorCentavos: positivo.optional(), quitar: z.boolean().default(false), moeda,
    carteiraId: identificadorOperacao, formaPagamento: meio, dataPagamento: instante,
    documentoId: identificadorOperacao.optional() }).strict(),
  z.object({ tipo: z.literal("COMPRA_CREDITO"), ...fato, cicloId: identificadorOperacao.optional(),
    parcelas: z.array(parcela).min(1).max(120).optional() }).strict(),
  z.object({ tipo: z.literal("PAGAR_FATURA"), cicloId: identificadorOperacao,
    alocacoes: z.array(alocacao).min(1).max(120), moeda,
    carteiraId: identificadorOperacao, formaPagamento: meio, dataPagamento: instante }).strict(),
  z.object({ tipo: z.literal("ESTORNAR_PAGAMENTO"), ...estorno, pagamentoId: identificadorOperacao,
    pedidoHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    alocacoes: z.array(z.object({ alocacaoId: identificadorOperacao, valorCentavos: positivo }).strict()).min(1).max(120).optional() }).strict(),
  // Transferência entre contas do MESMO perfil (PESSOAL ou EMPRESA): uma saída e uma entrada, sem fato,
  // sem pagamento e fora de receita/despesa. `dataPagamento` é o instante bancário (mesmo papel nos demais tipos).
  z.object({ tipo: z.literal("TRANSFERENCIA_INTERNA"), valorCentavos: positivo, moeda,
    carteiraOrigemId: identificadorOperacao, carteiraDestinoId: identificadorOperacao,
    dataPagamento: instante, descricao: texto.optional() }).strict(),
  // Adaptador interno do HUB para recibos M1 existentes; não cria pagamento antigo.
  z.object({ tipo: z.literal("ESTORNAR_LEGADO"), ...estorno,
    tituloId: identificadorOperacao, movimentoOriginalId: identificadorOperacao,
    pedidoHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
])

export type PropostaGasto = z.infer<typeof propostaSchema>
export type TipoOperacaoGasto = PropostaGasto["tipo"]
export type ResultadoOperacaoGasto = {
  operacaoId: string
  revisaoId: string
  gastoId: string | null
  tituloIds: string[]
  pagamentoId: string | null
  movimentoIds: string[]
  valorCentavos: string
  estado: "APLICADA"
}

export function normalizarPropostaGasto(input: unknown): PropostaGasto {
  const parsed = propostaSchema.safeParse(input)
  if (!parsed.success) throw new OperacaoGastoError("proposta_invalida")
  const p = parsed.data
  if (p.tipo === "PAGAR_TITULO" && (p.quitar === (p.valorCentavos !== undefined))) {
    throw new OperacaoGastoError("valor_ou_quitacao_obrigatorio")
  }
  if (p.tipo === "TRANSFERENCIA_INTERNA" && p.carteiraOrigemId === p.carteiraDestinoId) {
    throw new OperacaoGastoError("transferencia_mesma_conta")
  }
  if (p.tipo === "PAGAR_FATURA") {
    if (new Set(p.alocacoes.map(a => a.tituloId)).size !== p.alocacoes.length
      || p.alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0)) > LIMITE_CENTAVOS) {
      throw new OperacaoGastoError("alocacao_invalida")
    }
    p.alocacoes.sort((a, b) => ordemBinaria(a.tituloId, b.tituloId))
  }
  if (p.tipo === "COMPRA_CREDITO") {
    if (Boolean(p.cicloId) === Boolean(p.parcelas)) throw new OperacaoGastoError("ciclo_ou_parcelas_obrigatorio")
    if (p.parcelas) {
      const parcelas = p.parcelas
      parcelas.sort((a, b) => a.numero - b.numero)
      if (parcelas.some((a, i) => a.total !== parcelas.length || a.numero !== i + 1)
        || parcelas.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0)) !== BigInt(p.valorCentavos)) {
        throw new OperacaoGastoError("parcelamento_incompleto")
      }
    }
  }
  if (p.tipo === "ESTORNAR_PAGAMENTO" && p.alocacoes) {
    if (new Set(p.alocacoes.map(a => a.alocacaoId)).size !== p.alocacoes.length
      || p.alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0)) !== BigInt(p.valorCentavos)) {
      throw new OperacaoGastoError("alocacao_invalida")
    }
    p.alocacoes.sort((a, b) => ordemBinaria(a.alocacaoId, b.alocacaoId))
  }
  return p
}

export function ordemBinaria(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0 }

function ordenarJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenarJson)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => ordemBinaria(a, b))
    .map(([k, v]) => [k, ordenarJson(v)]))
  return value
}

export function hashOperacaoGasto(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(ordenarJson(value))).digest("hex")
}

/** A data bancária é explícita e não muda com o relógio de um retry. */
export function diaSaoPaulo(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(d.getTime())) throw new OperacaoGastoError("data_invalida")
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)
  const campo = (type: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === type)?.value
  return `${campo("year")}-${campo("month")}-${campo("day")}`
}

export function valorPropostaGasto(p: PropostaGasto): bigint | null {
  if (p.tipo === "PAGAR_FATURA") return p.alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0))
  return p.valorCentavos === undefined ? null : BigInt(p.valorCentavos)
}
