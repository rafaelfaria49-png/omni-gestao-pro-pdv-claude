/**
 * Venda de aparelho serializado DENTRO da transação canônica da venda
 * (`upsertVendaInTransaction`). Não é um segundo escritor: a Venda, os itens, a baixa
 * de estoque (ledger) e o financeiro continuam no motor; aqui só se vincula a unidade
 * EXATA vendida, com lock de linha, e se grava o snapshot imutável da garantia.
 *
 * Qualquer falha lança `DeviceSaleError` (subclasse de `InvalidSaleLinesError`) e a
 * transação inteira reverte — nada de venda sem vínculo, nem vínculo sem venda.
 */
import type { Prisma } from "@/generated/prisma"
// Import estático só NESTE sentido: `ops-upsert-venda` carrega este módulo por import dinâmico.
import { InvalidSaleLinesError } from "@/lib/ops-upsert-venda"
import { calcularGarantia, dateKeyToDb, isDateKey, localDateKey, validateContratualDias, GARANTIA_LEGAL_DIAS } from "./warranty"
import { sanitizeAcessorios } from "./checklist"
import { getPoliticaTx, nextSequenceTx } from "./policy"
import { buildGarantiaSnapshot } from "./snapshot"

export type DeviceSaleLineV1 = {
  version: 1
  aparelhoId: string
  /** Prazo contratual ADICIONAL escolhido (dias). A legal (90) é sempre aplicada pelo servidor. */
  contratualDias: number
  /** YYYY-MM-DD da entrega efetiva (default: data da venda). */
  dataEntrega?: string
  /** Token da reserva feita por este caixa (aceita unidade `reservado` com o mesmo token). */
  reservaToken?: string
  acessoriosEntregues?: Record<string, boolean>
  observacoes?: string
}

export class DeviceSaleError extends InvalidSaleLinesError {
  readonly deviceCode: string
  constructor(deviceCode: string, message: string) {
    super(message)
    this.name = "DeviceSaleError"
    this.deviceCode = deviceCode
  }
}

export { isSerializedDeviceProduct } from "./serialized-product"

export function parseDeviceSaleLine(raw: unknown): DeviceSaleLineV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || typeof r.aparelhoId !== "string" || !r.aparelhoId.trim()) return null
  return {
    version: 1,
    aparelhoId: r.aparelhoId.trim().slice(0, 64),
    contratualDias: typeof r.contratualDias === "number" ? r.contratualDias : Number.NaN,
    ...(typeof r.dataEntrega === "string" ? { dataEntrega: r.dataEntrega } : {}),
    ...(typeof r.reservaToken === "string" && r.reservaToken.trim() ? { reservaToken: r.reservaToken.trim().slice(0, 128) } : {}),
    acessoriosEntregues: sanitizeAcessorios(r.acessoriosEntregues),
    ...(typeof r.observacoes === "string" ? { observacoes: r.observacoes.slice(0, 500) } : {}),
  }
}

export { maskDocumento, sha256Json } from "./sale-hook-shared"
import { sha256Json } from "./sale-hook-shared"

type SaleLineLike = {
  produtoId?: string
  inventoryId?: string
  quantity?: number
  unitPrice?: number
  lineTotal?: number
  name?: string
  deviceSale?: unknown
}

type LockedUnit = {
  id: string
  storeId: string
  produtoId: string
  status: string
  propriedade: string
  restricaoStatus: string
  reservaToken: string | null
  reservadoAte: Date | null
}

/**
 * Pré-validação SEM escrita (chamada antes de `Venda.create`): formato das linhas de
 * aparelho, cliente obrigatório e unicidade da unidade dentro da própria venda.
 */
export function assertDeviceSaleLinesShape(lines: SaleLineLike[], clienteId: string | null): DeviceSaleLineV1[] {
  const parsed: DeviceSaleLineV1[] = []
  const seen = new Set<string>()
  lines.forEach((line, index) => {
    if (line.deviceSale === undefined || line.deviceSale === null) return
    const ds = parseDeviceSaleLine(line.deviceSale)
    if (!ds) throw new DeviceSaleError("APARELHO_LINHA_INVALIDA", `Linha ${index + 1}: identificação do aparelho inválida.`)
    if (line.quantity !== 1) {
      throw new DeviceSaleError("APARELHO_QUANTIDADE", `Linha ${index + 1}: aparelho individualizado é vendido com quantidade 1.`)
    }
    if (!line.produtoId) {
      throw new DeviceSaleError("APARELHO_LINHA_INVALIDA", `Linha ${index + 1}: aparelho sem produto vinculado.`)
    }
    if (seen.has(ds.aparelhoId)) {
      throw new DeviceSaleError("APARELHO_DUPLICADO_NA_VENDA", "O mesmo aparelho aparece duas vezes nesta venda.")
    }
    seen.add(ds.aparelhoId)
    parsed.push(ds)
  })
  if (parsed.length > 0 && !clienteId) {
    throw new DeviceSaleError(
      "APARELHO_CLIENTE_OBRIGATORIO",
      "Venda de aparelho exige cliente identificado. Selecione ou cadastre o cliente antes de finalizar.",
    )
  }
  return parsed
}

export type DeviceSaleContext = {
  storeId: string
  vendaId: string
  pedidoId: string
  at: Date
  clienteId: string | null
  operador: string | null
}

/**
 * Efeito dentro da transação da venda: lock FOR UPDATE da unidade, validação de
 * estado/loja/produto, número de garantia, snapshot e transição para `vendido`.
 */
export async function applyDeviceSaleLinesTx(
  tx: Prisma.TransactionClient,
  ctx: DeviceSaleContext,
  lines: SaleLineLike[],
): Promise<Array<{ aparelhoId: string; aparelhoVendaId: string; numeroGarantia: string }>> {
  const deviceLines = lines.filter((l) => l.deviceSale !== undefined && l.deviceSale !== null)
  if (deviceLines.length === 0) return []
  assertDeviceSaleLinesShape(lines, ctx.clienteId)

  const politica = await getPoliticaTx(tx, ctx.storeId)
  const store = await tx.store.findUnique({ where: { id: ctx.storeId }, select: { name: true, cnpj: true, phone: true, address: true } })
  const settings = await tx.storeSettings.findUnique({ where: { storeId: ctx.storeId }, select: { contactEmail: true, contactWhatsapp: true } })
  const cliente = ctx.clienteId
    ? await tx.cliente.findFirst({ where: { id: ctx.clienteId, storeId: ctx.storeId }, select: { id: true, name: true, document: true, phone: true } })
    : null
  if (!cliente) {
    throw new DeviceSaleError("APARELHO_CLIENTE_OBRIGATORIO", "Venda de aparelho exige cliente cadastrado nesta loja.")
  }
  const dataVendaKey = localDateKey(ctx.at)
  const results: Array<{ aparelhoId: string; aparelhoVendaId: string; numeroGarantia: string }> = []

  for (const line of deviceLines) {
    const ds = parseDeviceSaleLine(line.deviceSale)!
    // Lock da linha: dois caixas vendendo a mesma unidade serializam aqui; o segundo vê `vendido`.
    const locked = (await tx.$queryRaw<LockedUnit[]>`
      SELECT "id", "storeId", "produtoId", "status", "propriedade", "restricaoStatus", "reservaToken", "reservadoAte"
      FROM "aparelhos_fisicos" WHERE "id" = ${ds.aparelhoId} AND "storeId" = ${ctx.storeId} FOR UPDATE`)[0]
    if (!locked) throw new DeviceSaleError("APARELHO_NAO_ENCONTRADO", "Aparelho não encontrado nesta loja.")
    if (locked.produtoId !== line.produtoId) {
      throw new DeviceSaleError("APARELHO_PRODUTO_DIVERGENTE", "O aparelho selecionado não pertence ao produto da linha.")
    }
    if (locked.propriedade !== "loja") {
      throw new DeviceSaleError("APARELHO_ORIGEM_PENDENTE", "Aquisição deste aparelho ainda não foi confirmada.")
    }
    if (locked.restricaoStatus === "restricao_conhecida") {
      throw new DeviceSaleError("APARELHO_BLOQUEADO", "Aparelho com restrição registrada. Venda bloqueada.")
    }
    const reservaValida = locked.status === "reservado" && locked.reservadoAte && locked.reservadoAte.getTime() > Date.now()
    const reservaMinha = reservaValida && !!ds.reservaToken && locked.reservaToken === ds.reservaToken
    if (locked.status === "reservado" && reservaValida && !reservaMinha) {
      throw new DeviceSaleError("APARELHO_RESERVADO", "Aparelho reservado por outro atendimento.")
    }
    if (locked.status !== "disponivel" && locked.status !== "reservado") {
      throw new DeviceSaleError(
        locked.status === "vendido" ? "APARELHO_JA_VENDIDO" : "APARELHO_INDISPONIVEL",
        locked.status === "vendido" ? "Este aparelho já foi vendido." : "Aparelho indisponível para venda.",
      )
    }

    const contratual = validateContratualDias(ds.contratualDias, politica.contratualMaxDias)
    if (!contratual.ok) throw new DeviceSaleError(contratual.code, contratual.message)
    const dataEntrega = ds.dataEntrega ?? dataVendaKey
    if (!isDateKey(dataEntrega) || dataEntrega < dataVendaKey) {
      throw new DeviceSaleError("APARELHO_DATA_ENTREGA", "Data de entrega inválida (não pode ser anterior à venda).")
    }
    const garantia = calcularGarantia(dataEntrega, contratual.dias)

    const unit = await tx.aparelhoFisico.findUniqueOrThrow({ where: { id: locked.id } })
    const ano = Number(dataVendaKey.slice(0, 4))
    const seq = await nextSequenceTx(tx, ctx.storeId, "GAR", ano)
    const numeroGarantia = `GAR-${ano}-${String(seq).padStart(5, "0")}`
    const acessoriosEntregues = sanitizeAcessorios(ds.acessoriosEntregues ?? unit.acessorios)
    const preco = typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) ? line.unitPrice : unit.precoVenda

    const snapshot = buildGarantiaSnapshot({
      numeroGarantia, store, settings, cliente, unit, pedidoId: ctx.pedidoId, dataVendaKey, preco,
      operador: ctx.operador ?? "", garantia, politica, acessoriosEntregues, observacoes: ds.observacoes ?? "",
    })
    const snapshotHash = sha256Json(snapshot)

    // Índice parcial único (storeId, aparelhoId) WHERE status='ativa' é a última barreira.
    const av = await tx.aparelhoVenda.create({
      data: {
        storeId: ctx.storeId,
        aparelhoId: unit.id,
        vendaId: ctx.vendaId,
        pedidoId: ctx.pedidoId,
        clienteId: cliente.id,
        numeroGarantia,
        precoVenda: preco,
        dataVenda: dateKeyToDb(dataVendaKey),
        dataEntrega: dateKeyToDb(garantia.dataEntrega),
        legalDias: GARANTIA_LEGAL_DIAS,
        legalFim: dateKeyToDb(garantia.legalFim),
        contratualDias: garantia.contratualDias,
        contratualFim: garantia.contratualFim ? dateKeyToDb(garantia.contratualFim) : null,
        coberturaFim: dateKeyToDb(garantia.coberturaFim),
        politicaVersao: politica.versao,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotHash,
        operador: ctx.operador ?? "",
      },
      select: { id: true },
    })

    await tx.aparelhoFisico.update({
      where: { id: unit.id },
      data: { status: "vendido", reservaToken: null, reservadoAte: null, reservadoPor: null, version: { increment: 1 } },
    })
    await tx.aparelhoEvento.create({
      data: {
        storeId: ctx.storeId,
        aparelhoId: unit.id,
        tipo: "venda",
        deStatus: locked.status,
        paraStatus: "vendido",
        operador: ctx.operador ?? "",
        idempotencyKey: `venda:${ctx.vendaId}:${unit.id}`,
        dados: {
          pedidoId: ctx.pedidoId,
          vendaId: ctx.vendaId,
          numeroGarantia,
          contratualDias: garantia.contratualDias,
          coberturaFim: garantia.coberturaFim,
          dataEntrega: garantia.dataEntrega,
        },
      },
    })
    results.push({ aparelhoId: unit.id, aparelhoVendaId: av.id, numeroGarantia })
  }
  return results
}
