/**
 * Emissão/reimpressão de documentos de aparelhos. Somente leitura do snapshot +
 * contador de emissões: NUNCA cria venda, garantia ou movimento de estoque.
 */
import { prisma } from "@/lib/prisma"
import { fail, registrarEmissaoDocumento, type AparelhoCtx, type Fail } from "./service"
import {
  pagamentosDoPayload, renderComprovanteVenda, renderProtocoloAquisicao, renderTermoEntrega, renderTermoGarantia,
  type DocFormato, type DocTipo, type GarantiaSnapshot,
} from "./documents"
import { sha256Json } from "./sale-hook-shared"
import { getPoliticaTx } from "./policy"
import { buildGarantiaSnapshot } from "./snapshot"
import { calcularGarantia, isDateKey, localDateKey, validateContratualDias } from "./warranty"
import { sanitizeAcessorios, resumoChecklist, sanitizeChecklist } from "./checklist"
import { APARELHO_CONDICAO_LABEL, type AparelhoCondicao } from "./lifecycle"
import { formatImei } from "./imei"

type Db = typeof prisma
type Html = { ok: true; html: string; emissoes: number }

export function parseFormato(v: unknown): DocFormato | null {
  return v === "a4" || v === "80mm" ? v : null
}

export async function documentoDaVenda(ctx: AparelhoCtx, aparelhoVendaId: string, tipo: DocTipo, formato: DocFormato, db: Db = prisma): Promise<Html | Fail> {
  if (!ctx.perms.reimprimir) return fail(403, "SEM_PERMISSAO", "Sem permissão para emitir documentos.")
  if (tipo === "protocolo_aquisicao") return fail(400, "VALIDACAO", "Tipo inválido para venda.")
  const av = await db.aparelhoVenda.findFirst({
    where: { id: aparelhoVendaId, storeId: ctx.storeId },
    select: { id: true, snapshot: true, snapshotHash: true, venda: { select: { payload: true, status: true } } },
  })
  if (!av) return fail(404, "NAO_ENCONTRADO", "Garantia não encontrada nesta loja.")
  const snap = av.snapshot as unknown as GarantiaSnapshot
  const html =
    tipo === "termo_garantia" ? renderTermoGarantia(snap, formato)
      : tipo === "termo_entrega" ? renderTermoEntrega(snap, formato)
        : renderComprovanteVenda(snap, pagamentosDoPayload(av.venda.payload), formato)
  const reg = await registrarEmissaoDocumento(ctx, { tipo, formato, aparelhoVendaId: av.id, conteudoHash: av.snapshotHash }, db)
  return { ok: true, html, emissoes: reg.emissoes }
}

export async function documentoDaAquisicao(ctx: AparelhoCtx, aquisicaoId: string, formato: DocFormato, db: Db = prisma): Promise<Html | Fail> {
  if (!ctx.perms.comprarDeCliente && !ctx.perms.aprovarAquisicao) return fail(403, "SEM_PERMISSAO", "Sem permissão para emitir protocolo de aquisição.")
  const aq = await db.aparelhoAquisicao.findFirst({
    where: { id: aquisicaoId, storeId: ctx.storeId },
    include: { aparelhos: true, cliente: { select: { name: true } }, fornecedor: { select: { name: true } }, store: { select: { name: true, cnpj: true, phone: true } } },
  })
  if (!aq) return fail(404, "NAO_ENCONTRADO", "Aquisição não encontrada nesta loja.")
  const origemLabel: Record<string, string> = { declaracao_procedencia: "Declaração de procedência", nota_fiscal: "Nota fiscal", recibo: "Recibo", outro: "Outro documento" }
  const doc = {
    protocolo: aq.protocolo, tipo: aq.tipo, status: aq.status, dataKey: localDateKey(aq.createdAt),
    loja: { nome: aq.store.name, cnpj: aq.store.cnpj, telefone: aq.store.phone },
    vendedor: { nome: aq.cliente?.name || aq.vendedorNome || aq.fornecedor?.name || "", documentoMascarado: aq.vendedorDocMascarado },
    documentoOrigem: `${origemLabel[aq.documentoOrigemTipo] ?? aq.documentoOrigemTipo}${aq.documentoOrigemNumero ? ` nº ${aq.documentoOrigemNumero}` : ""}`,
    valorTotal: aq.valorTotal, formaPagamento: aq.formaPagamento, pagamentoStatus: aq.pagamentoStatus,
    aparelhos: aq.aparelhos.map((u) => {
      const r = resumoChecklist(sanitizeChecklist(u.checklist))
      return {
        codigoInterno: u.codigoInterno,
        descricao: [u.marca, u.modelo, u.armazenamento, u.cor].filter(Boolean).join(" "),
        imei1: u.imei1 ? formatImei(u.imei1) : "", imei2: u.imei2 ? formatImei(u.imei2) : "", serial: u.serial ?? "",
        condicao: APARELHO_CONDICAO_LABEL[u.condicao as AparelhoCondicao] ?? u.condicao,
        checklist: `${r.aprovados} aprovados, ${r.falhas} com falha, ${r.naoTestados} não testados, ${r.naoAplicaveis} não se aplicam`,
      }
    }),
    observacoes: aq.observacoes,
  }
  const html = renderProtocoloAquisicao(doc, formato)
  const reg = await registrarEmissaoDocumento(ctx, { tipo: "protocolo_aquisicao", formato, aquisicaoId: aq.id, conteudoHash: sha256Json(doc) }, db)
  return { ok: true, html, emissoes: reg.emissoes }
}

/** Prévia ANTES da confirmação: marcada como RASCUNHO, sem número real, sem gravar nada. */
export async function previaTermo(ctx: AparelhoCtx, raw: unknown, db: Db = prisma): Promise<{ ok: true; html: string } | Fail> {
  if (!ctx.perms.vender) return fail(403, "SEM_PERMISSAO", "Sem permissão para vender aparelhos.")
  const r = (raw ?? {}) as Record<string, unknown>
  const aparelhoId = typeof r.aparelhoId === "string" ? r.aparelhoId : ""
  const tipo = r.tipo === "comprovante_venda" || r.tipo === "termo_entrega" ? r.tipo : "termo_garantia"
  const formato = parseFormato(r.formato) ?? "a4"
  const unit = await db.aparelhoFisico.findFirst({ where: { id: aparelhoId, storeId: ctx.storeId } })
  if (!unit) return fail(404, "NAO_ENCONTRADO", "Aparelho não encontrado nesta loja.")
  const politica = await db.$transaction((tx) => getPoliticaTx(tx, ctx.storeId))
  const contratual = validateContratualDias(r.contratualDias, politica.contratualMaxDias)
  if (!contratual.ok) return fail(400, contratual.code, contratual.message)
  const hoje = localDateKey(new Date())
  const dataEntrega = typeof r.dataEntrega === "string" && isDateKey(r.dataEntrega) && r.dataEntrega >= hoje ? r.dataEntrega : hoje
  const clienteId = typeof r.clienteId === "string" ? r.clienteId : ""
  const cliente = clienteId ? await db.cliente.findFirst({ where: { id: clienteId, storeId: ctx.storeId }, select: { name: true, document: true, phone: true } }) : null
  const [store, settings] = await Promise.all([
    db.store.findUnique({ where: { id: ctx.storeId }, select: { name: true, cnpj: true, phone: true, address: true } }),
    db.storeSettings.findUnique({ where: { storeId: ctx.storeId }, select: { contactEmail: true, contactWhatsapp: true } }),
  ])
  const preco = typeof r.preco === "number" && Number.isFinite(r.preco) ? r.preco : unit.precoVenda
  const snap = buildGarantiaSnapshot({
    numeroGarantia: "RASCUNHO", store, settings,
    cliente: cliente ?? { name: "Cliente não selecionado", document: "", phone: "" },
    unit, pedidoId: "Venda não confirmada", dataVendaKey: hoje, preco, operador: ctx.actorLabel,
    garantia: calcularGarantia(dataEntrega, contratual.dias), politica,
    acessoriosEntregues: sanitizeAcessorios(r.acessoriosEntregues ?? unit.acessorios), observacoes: typeof r.observacoes === "string" ? r.observacoes.slice(0, 500) : "",
  })
  const html = tipo === "termo_entrega" ? renderTermoEntrega(snap, formato, true)
    : tipo === "comprovante_venda" ? renderComprovanteVenda(snap, [], formato, true)
      : renderTermoGarantia(snap, formato, true)
  return { ok: true, html }
}

/** Documentos emitidos por venda (para reimprimir no pós-venda). */
export async function garantiasDaVenda(ctx: AparelhoCtx, ref: { vendaId?: string; pedidoId?: string }, db: Db = prisma) {
  if (!ref.vendaId && !ref.pedidoId) return fail(400, "VALIDACAO", "Informe a venda.")
  const itens = await db.aparelhoVenda.findMany({
    where: { storeId: ctx.storeId, ...(ref.vendaId ? { vendaId: ref.vendaId } : { pedidoId: ref.pedidoId }) },
    select: { id: true, numeroGarantia: true, pedidoId: true, status: true, coberturaFim: true, aparelho: { select: { marca: true, modelo: true, armazenamento: true } } },
  })
  return { ok: true as const, itens }
}
