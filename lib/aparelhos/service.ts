/**
 * Serviço de aparelhos físicos (OMNI-APARELHOS-ENDTOEND-001).
 *
 * Regras centrais:
 * - Toda escrita recebe `AparelhoCtx` PROVADO pelo servidor (loja, ator, permissões).
 * - Todo saldo passa por `applyStockMutationTx` (ledger canônico), com chave de
 *   idempotência estável por unidade+versão. Produto.stock = unidades disponíveis+reservadas.
 * - Estoque comercial só recebe unidade da LOJA, com aquisição confirmada e liberada.
 * - Eventos append-only registram cada mudança.
 */
import type { Prisma, AparelhoFisico } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { buildIdempotencyKey } from "@/lib/estoque/stock-ledger-contract"
import type { AparelhoPermissions } from "./permissions"
import { podeAprovarAquisicao } from "./permissions"
import { validateImei, normalizeSerial, maskImei, maskSerial, looksLikeImeiQuery, normalizeImei } from "./imei"
import {
  APARELHO_CONDICOES, APARELHO_ORIGENS, canTransition, contaNoEstoque, isAparelhoStatus, isNovo,
  type AparelhoCondicao, type AparelhoOrigem, type AparelhoStatus,
} from "./lifecycle"
import { resumoChecklist, sanitizeAcessorios, sanitizeChecklist } from "./checklist"
import { getPoliticaTx, nextSequenceTx, politicaFromRow, type PoliticaAparelhos } from "./policy"
import { maskDocumento, sha256Json } from "./sale-hook-shared"
import { dateKeyToDb, localDateKey, validateContratualDias } from "./warranty"

export type AparelhoCtx = { storeId: string; actorId: string; actorLabel: string; perms: AparelhoPermissions }
export type Fail = { ok: false; status: number; code: string; message: string; field?: string }
export type Ok<T> = { ok: true } & T

export class AparelhoFailError extends Error {
  constructor(readonly fail: Fail) {
    super(fail.message)
    this.name = "AparelhoFailError"
  }
}

export function fail(status: number, code: string, message: string, field?: string): Fail {
  return { ok: false, status, code, message, ...(field ? { field } : {}) }
}
function stop(status: number, code: string, message: string, field?: string): never {
  throw new AparelhoFailError(fail(status, code, message, field))
}

function isP2002(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2002"
}
function p2002Target(e: unknown): string {
  const meta = (e as { meta?: { target?: unknown } })?.meta?.target
  return Array.isArray(meta) ? meta.join(",") : String(meta ?? "")
}

type Db = typeof prisma

export async function runAparelhoTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, db: Db = prisma): Promise<T | Fail> {
  try {
    return await db.$transaction(fn, { timeout: 20_000, maxWait: 10_000 })
  } catch (e) {
    if (e instanceof AparelhoFailError) return e.fail
    if (isP2002(e)) {
      const t = p2002Target(e)
      if (t.includes("valor") || t.includes("tipo")) return fail(409, "IMEI_DUPLICADO", "Já existe um aparelho desta loja com este IMEI ou número de série.")
      if (t.includes("aparelhoId")) return fail(409, "APARELHO_JA_VENDIDO", "Este aparelho já possui venda ativa.")
      return fail(409, "CONFLITO", "Operação concorrente detectada. Recarregue e tente novamente.")
    }
    throw e
  }
}

// ─── Entradas ────────────────────────────────────────────────────────────────

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export type AparelhoInput = {
  produtoId?: string
  marca: string
  modelo: string
  variante: string
  armazenamento: string
  memoriaRam: string
  cor: string
  condicao: AparelhoCondicao
  imei1: string | null
  imei2: string | null
  serial: string | null
  ean: string | null
  custoAquisicao: number
  despesas: number
  precoSugerido: number | null
  precoVenda: number
  garantiaContratualDias: number
  acessorios: Record<string, boolean>
  estadoFisico: string
  checklist: Record<string, string>
  bateriaSaude: number | null
  bateriaFonte: string | null
  observacoes: string
  fotos: Array<{ dataUrl: string; legenda: string }>
}

const MAX_FOTO_CHARS = 560_000 // ~400 KB binário em base64

export function parseAparelhoInput(raw: unknown, opts: { exigeIdentificador: boolean }): { ok: true; input: AparelhoInput } | Fail {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(400, "VALIDACAO", "Dados do aparelho inválidos.")
  const r = raw as Record<string, unknown>
  const marca = str(r.marca, 60)
  const modelo = str(r.modelo, 80)
  if (!marca) return fail(400, "VALIDACAO", "Informe a marca.", "marca")
  if (!modelo) return fail(400, "VALIDACAO", "Informe o modelo.", "modelo")
  const condicao = str(r.condicao, 30) as AparelhoCondicao
  if (!(APARELHO_CONDICOES as readonly string[]).includes(condicao)) return fail(400, "VALIDACAO", "Selecione a condição do aparelho.", "condicao")

  let imei1: string | null = null
  let imei2: string | null = null
  if (str(r.imei1, 40)) {
    const c = validateImei(r.imei1)
    if (!c.ok) return fail(400, "IMEI_INVALIDO", `IMEI 1: ${c.message}`, "imei1")
    imei1 = c.imei
  }
  if (str(r.imei2, 40)) {
    const c = validateImei(r.imei2)
    if (!c.ok) return fail(400, "IMEI_INVALIDO", `IMEI 2: ${c.message}`, "imei2")
    imei2 = c.imei
  }
  if (imei2 && !imei1) return fail(400, "VALIDACAO", "Preencha o IMEI 1 antes do IMEI 2.", "imei1")
  if (imei1 && imei2 && imei1 === imei2) return fail(400, "IMEI_INVALIDO", "IMEI 1 e IMEI 2 não podem ser iguais.", "imei2")
  const serial = normalizeSerial(r.serial) || null
  if (opts.exigeIdentificador && !imei1 && !serial) {
    return fail(400, "IDENTIFICADOR_OBRIGATORIO", "Informe o IMEI ou o número de série para individualizar o aparelho.", "imei1")
  }
  const custoAquisicao = num(r.custoAquisicao) ?? 0
  const despesas = num(r.despesas) ?? 0
  const precoVenda = num(r.precoVenda) ?? 0
  const precoSugerido = num(r.precoSugerido)
  if (custoAquisicao < 0 || despesas < 0 || precoVenda < 0 || (precoSugerido ?? 0) < 0) {
    return fail(400, "VALIDACAO", "Valores não podem ser negativos.")
  }
  const garantia = typeof r.garantiaContratualDias === "number" ? r.garantiaContratualDias : Number(r.garantiaContratualDias ?? 0)
  if (!Number.isInteger(garantia) || garantia < 0) return fail(400, "VALIDACAO", "Garantia contratual inválida.", "garantiaContratualDias")
  const bateria = r.bateriaSaude === null || r.bateriaSaude === undefined || r.bateriaSaude === "" ? null : Number(r.bateriaSaude)
  if (bateria !== null && (!Number.isInteger(bateria) || bateria < 0 || bateria > 100)) {
    return fail(400, "VALIDACAO", "Saúde da bateria deve ser um percentual entre 0 e 100.", "bateriaSaude")
  }
  const bateriaFonte = bateria !== null ? str(r.bateriaFonte, 80) || null : null
  if (bateria !== null && !bateriaFonte) {
    return fail(400, "VALIDACAO", "Informe de onde veio a saúde da bateria (ex.: Ajustes do iOS, ferramenta de diagnóstico).", "bateriaFonte")
  }
  const fotosRaw = Array.isArray(r.fotos) ? r.fotos.slice(0, 6) : []
  const fotos: AparelhoInput["fotos"] = []
  for (const f of fotosRaw) {
    const dataUrl = f && typeof f === "object" ? str((f as Record<string, unknown>).dataUrl, MAX_FOTO_CHARS + 1) : ""
    if (!dataUrl) continue
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return fail(400, "VALIDACAO", "Foto em formato não suportado (use JPG, PNG ou WebP).")
    if (dataUrl.length > MAX_FOTO_CHARS) return fail(400, "VALIDACAO", "Foto muito grande (máx. 400 KB após redução).")
    fotos.push({ dataUrl, legenda: str((f as Record<string, unknown>).legenda, 80) })
  }
  return {
    ok: true,
    input: {
      ...(str(r.produtoId, 64) ? { produtoId: str(r.produtoId, 64) } : {}),
      marca, modelo,
      variante: str(r.variante, 60),
      armazenamento: str(r.armazenamento, 20),
      memoriaRam: str(r.memoriaRam, 20),
      cor: str(r.cor, 40),
      condicao,
      imei1, imei2, serial,
      ean: str(r.ean, 14).replace(/\D/g, "") || null,
      custoAquisicao, despesas, precoSugerido, precoVenda,
      garantiaContratualDias: garantia,
      acessorios: sanitizeAcessorios(r.acessorios),
      estadoFisico: str(r.estadoFisico, 300),
      checklist: sanitizeChecklist(r.checklist),
      bateriaSaude: bateria,
      bateriaFonte,
      observacoes: str(r.observacoes, 1000),
      fotos,
    },
  }
}

// ─── Produto comercial do modelo ─────────────────────────────────────────────

function chaveModelo(i: Pick<AparelhoInput, "marca" | "modelo" | "armazenamento" | "condicao">): string {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
  return [norm(i.marca), norm(i.modelo), norm(i.armazenamento), isNovo(i.condicao) ? "NOVO" : "USADO"].join("|")
}

export function nomeProdutoModelo(i: Pick<AparelhoInput, "marca" | "modelo" | "armazenamento" | "condicao">): string {
  const base = [i.marca, i.modelo, i.armazenamento].filter(Boolean).join(" ")
  return `${base} — ${isNovo(i.condicao) ? "Novo" : "Seminovo/Usado"}`
}

async function resolveProdutoModeloTx(tx: Prisma.TransactionClient, storeId: string, input: AparelhoInput): Promise<string> {
  if (input.produtoId) {
    const p = await tx.produto.findFirst({ where: { id: input.produtoId, storeId }, select: { id: true, metadata: true } })
    if (!p) stop(404, "PRODUTO_NAO_ENCONTRADO", "Produto informado não existe nesta loja.", "produtoId")
    const md = p.metadata as Record<string, unknown> | null
    if (!md || typeof md !== "object" || !(md as { serializedDevice?: unknown }).serializedDevice) {
      stop(409, "PRODUTO_NAO_SERIALIZADO", "Este produto não é um modelo de aparelho por IMEI. Escolha um modelo de aparelho ou deixe o sistema criar.", "produtoId")
    }
    return p.id
  }
  const key = chaveModelo(input)
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`aparelho-produto:${storeId}:${key}`}))::text AS lock`
  const existing = await tx.produto.findFirst({
    where: { storeId, metadata: { path: ["serializedDevice", "key"], equals: key } },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await tx.produto.create({
    data: {
      storeId,
      name: nomeProdutoModelo(input),
      brand: input.marca,
      category: "Aparelhos",
      stock: 0,
      price: input.precoVenda,
      precoCusto: 0,
      warrantyDays: 90,
      metadata: { serializedDevice: { version: 1, key, grupo: isNovo(input.condicao) ? "novo" : "usado" } },
    },
    select: { id: true },
  })
  return created.id
}

// ─── Identificadores ─────────────────────────────────────────────────────────

async function syncIdentificadoresTx(tx: Prisma.TransactionClient, storeId: string, aparelhoId: string, ids: { imei1: string | null; imei2: string | null; serial: string | null }) {
  const desired = [
    ...(ids.imei1 ? [{ tipo: "imei", valor: ids.imei1 }] : []),
    ...(ids.imei2 ? [{ tipo: "imei", valor: ids.imei2 }] : []),
    ...(ids.serial ? [{ tipo: "serial", valor: ids.serial }] : []),
  ]
  if (desired.length > 0) {
    const clash = await tx.aparelhoIdentificador.findFirst({
      where: { storeId, aparelhoId: { not: aparelhoId }, OR: desired.map((d) => ({ tipo: d.tipo, valor: d.valor })) },
      select: { tipo: true, aparelho: { select: { codigoInterno: true } } },
    })
    if (clash) {
      stop(409, "IMEI_DUPLICADO", `${clash.tipo === "imei" ? "IMEI" : "Número de série"} já cadastrado no aparelho ${clash.aparelho.codigoInterno}.`, clash.tipo === "imei" ? "imei1" : "serial")
    }
  }
  await tx.aparelhoIdentificador.deleteMany({ where: { storeId, aparelhoId } })
  if (desired.length > 0) {
    await tx.aparelhoIdentificador.createMany({ data: desired.map((d) => ({ ...d, storeId, aparelhoId })) })
  }
}

// ─── Estoque ─────────────────────────────────────────────────────────────────

async function moverEstoqueTx(tx: Prisma.TransactionClient, ctx: AparelhoCtx, unit: Pick<AparelhoFisico, "id" | "produtoId" | "version" | "custoTotal" | "codigoInterno">, kind: "entrada" | "saida", motivo: string) {
  const res = await applyStockMutationTx(
    tx as unknown as StockLedgerTx,
    { storeId: ctx.storeId, principal: null, source: "aparelhos", operatorLabel: ctx.actorLabel },
    kind === "entrada"
      ? { kind: "entrada", produtoId: unit.produtoId, quantidade: 1, custoUnitario: unit.custoTotal, origem: "aparelho", documento: unit.codigoInterno, motivo, idempotencyKey: buildIdempotencyKey("aparelho", "entrada", unit.id, unit.version) }
      : { kind: "saida", produtoId: unit.produtoId, quantidade: 1, origem: "aparelho", documento: unit.codigoInterno, motivo, idempotencyKey: buildIdempotencyKey("aparelho", "saida", unit.id, unit.version) },
  )
  if (!res.ok) stop(409, `ESTOQUE_${res.code}`, `Estoque: ${res.message}`)
}

async function eventoTx(tx: Prisma.TransactionClient, ctx: AparelhoCtx, aparelhoId: string, tipo: string, de: string | null, para: string | null, dados: Record<string, unknown> = {}) {
  await tx.aparelhoEvento.create({
    data: { storeId: ctx.storeId, aparelhoId, tipo, deStatus: de, paraStatus: para, operador: ctx.actorLabel, dados: dados as Prisma.InputJsonValue },
  })
}

async function lockUnitTx(tx: Prisma.TransactionClient, storeId: string, id: string): Promise<AparelhoFisico> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "aparelhos_fisicos" WHERE "id" = ${id} AND "storeId" = ${storeId} FOR UPDATE`
  if (!rows[0]) stop(404, "NAO_ENCONTRADO", "Aparelho não encontrado nesta loja.")
  return tx.aparelhoFisico.findUniqueOrThrow({ where: { id } })
}

/** Transição genérica com coerência de estoque (entra/sai do saldo ao cruzar a fronteira). */
async function transicionarTx(tx: Prisma.TransactionClient, ctx: AparelhoCtx, unit: AparelhoFisico, para: AparelhoStatus, tipoEvento: string, dados: Record<string, unknown> = {}, extra: Prisma.AparelhoFisicoUpdateInput = {}) {
  if (!canTransition(unit.status, para)) {
    stop(409, "TRANSICAO_INVALIDA", `Não é possível passar de "${unit.status}" para "${para}".`)
  }
  const antes = contaNoEstoque(unit.status)
  const depois = contaNoEstoque(para)
  if (depois && unit.propriedade !== "loja") stop(409, "ORIGEM_PENDENTE", "Aquisição ainda não confirmada: o aparelho não pode entrar no estoque comercial.")
  if (!antes && depois) await moverEstoqueTx(tx, ctx, unit, "entrada", `Aparelho ${unit.codigoInterno} liberado para venda`)
  if (antes && !depois) await moverEstoqueTx(tx, ctx, unit, "saida", `Aparelho ${unit.codigoInterno} retirado da venda (${para})`)
  const updated = await tx.aparelhoFisico.update({
    where: { id: unit.id },
    data: {
      status: para,
      version: { increment: 1 },
      ...(depois && !unit.entradaEstoqueEm ? { entradaEstoqueEm: new Date() } : {}),
      ...(para !== "reservado" ? { reservaToken: null, reservadoAte: null, reservadoPor: null } : {}),
      ...extra,
    },
  })
  await eventoTx(tx, ctx, unit.id, tipoEvento, unit.status, para, dados)
  return updated
}

// ─── Casos de uso ────────────────────────────────────────────────────────────

const ORIGENS_DIRETAS: readonly AparelhoOrigem[] = ["cadastro_manual", "fornecedor", "lote"]

async function criarUnidadeTx(
  tx: Prisma.TransactionClient,
  ctx: AparelhoCtx,
  input: AparelhoInput,
  opts: { origem: AparelhoOrigem; propriedade: "loja" | "aguardando_aquisicao" | "negociacao"; status: AparelhoStatus; aquisicaoId?: string | null; fornecedorNome?: string },
): Promise<AparelhoFisico> {
  const produtoId = await resolveProdutoModeloTx(tx, ctx.storeId, input)
  const seq = await nextSequenceTx(tx, ctx.storeId, "APA", 0)
  const codigoInterno = `APA-${String(seq).padStart(6, "0")}`
  const custoTotal = Math.round((input.custoAquisicao + input.despesas) * 100) / 100
  const unit = await tx.aparelhoFisico.create({
    data: {
      storeId: ctx.storeId,
      produtoId,
      codigoInterno,
      marca: input.marca,
      modelo: input.modelo,
      variante: input.variante,
      armazenamento: input.armazenamento,
      memoriaRam: input.memoriaRam,
      cor: input.cor,
      condicao: input.condicao,
      imei1: input.imei1,
      imei2: input.imei2,
      serial: input.serial,
      ean: input.ean,
      status: opts.status,
      propriedade: opts.propriedade,
      origem: opts.origem,
      aquisicaoId: opts.aquisicaoId ?? null,
      custoAquisicao: ctx.perms.definirCusto ? input.custoAquisicao : 0,
      despesas: ctx.perms.definirCusto ? input.despesas : 0,
      custoTotal: ctx.perms.definirCusto ? custoTotal : 0,
      precoSugerido: input.precoSugerido,
      precoVenda: input.precoVenda,
      garantiaContratualDias: input.garantiaContratualDias,
      acessorios: input.acessorios,
      estadoFisico: input.estadoFisico,
      checklist: input.checklist as Prisma.InputJsonValue,
      bateriaSaude: input.bateriaSaude,
      bateriaFonte: input.bateriaFonte,
      observacoes: input.observacoes,
      createdBy: ctx.actorId,
    },
  })
  await syncIdentificadoresTx(tx, ctx.storeId, unit.id, input)
  if (input.fotos.length) {
    await tx.aparelhoFoto.createMany({ data: input.fotos.map((f) => ({ storeId: ctx.storeId, aparelhoId: unit.id, dataUrl: f.dataUrl, legenda: f.legenda, createdBy: ctx.actorId })) })
  }
  await eventoTx(tx, ctx, unit.id, "cadastro", null, opts.status, {
    origem: opts.origem,
    condicao: input.condicao,
    checklist: resumoChecklist(input.checklist),
    ...(opts.fornecedorNome ? { fornecedor: opts.fornecedorNome } : {}),
    ...(opts.aquisicaoId ? { aquisicaoId: opts.aquisicaoId } : {}),
  })
  return unit
}

export async function cadastrarAparelho(ctx: AparelhoCtx, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.cadastrar) return fail(403, "SEM_PERMISSAO", "Sem permissão para cadastrar aparelhos.")
  const parsed = parseAparelhoInput(raw, { exigeIdentificador: true })
  if (!parsed.ok) return parsed
  const r = (raw ?? {}) as Record<string, unknown>
  const origem = (ORIGENS_DIRETAS as readonly string[]).includes(String(r.origem)) ? (r.origem as AparelhoOrigem) : "cadastro_manual"
  const fornecedorId = str(r.fornecedorId, 64) || null
  const liberar = r.liberarParaVenda === true
  if (liberar && !ctx.perms.alterarStatus) {
    return fail(403, "SEGREGACAO_FUNCOES", "Somente gerente ou proprietário libera aparelho para venda. Cadastre e peça a liberação.")
  }
  return runAparelhoTx(async (tx) => {
    let fornecedorNome = ""
    if (fornecedorId) {
      const f = await tx.fornecedor.findFirst({ where: { id: fornecedorId, storeId: ctx.storeId }, select: { name: true } })
      if (!f) stop(404, "FORNECEDOR_NAO_ENCONTRADO", "Fornecedor não encontrado nesta loja.", "fornecedorId")
      fornecedorNome = f.name
    }
    let unit = await criarUnidadeTx(tx, ctx, parsed.input, { origem, propriedade: "loja", status: "aguardando_conferencia", fornecedorNome })
    if (liberar) unit = await liberarTx(tx, ctx, unit)
    return { ok: true as const, aparelho: { id: unit.id, codigoInterno: unit.codigoInterno, status: unit.status } }
  }, db)
}

async function liberarTx(tx: Prisma.TransactionClient, ctx: AparelhoCtx, unit: AparelhoFisico): Promise<AparelhoFisico> {
  const politica = await getPoliticaTx(tx, ctx.storeId)
  if (unit.propriedade !== "loja") stop(409, "ORIGEM_PENDENTE", "Confirme a aquisição antes de liberar o aparelho para venda.")
  if (unit.restricaoStatus === "restricao_conhecida") stop(409, "RESTRICAO_CONHECIDA", "Aparelho com restrição registrada não pode ser liberado para revenda.")
  if (politica.liberacaoExigeConferencia && unit.condicao !== "novo_lacrado" && unit.restricaoStatus !== "conferido_sem_restricao") {
    stop(409, "CONFERENCIA_PENDENTE", "Registre a conferência de restrição do IMEI antes de liberar este aparelho.")
  }
  if (!(unit.precoVenda > 0)) stop(409, "PRECO_OBRIGATORIO", "Defina o preço de venda antes de liberar.", "precoVenda")
  const checklist = resumoChecklist(sanitizeChecklist(unit.checklist))
  if (checklist.falhas > 0 && unit.observacoes.trim().length === 0) {
    stop(409, "CHECKLIST_COM_FALHA", "Há itens com falha no checklist: descreva-os nas observações antes de liberar.", "observacoes")
  }
  return transicionarTx(tx, ctx, unit, "disponivel", "liberacao", { checklist })
}

export async function liberarParaVenda(ctx: AparelhoCtx, id: string, db: Db = prisma) {
  // Segregação: quem cadastra (vendedor/técnico) não libera o próprio aparelho para venda.
  if (!ctx.perms.alterarStatus) return fail(403, "SEGREGACAO_FUNCOES", "Somente gerente ou proprietário libera aparelho para venda.")
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    if (unit.status === "disponivel") return { ok: true as const, aparelho: { id: unit.id, status: unit.status }, replay: true }
    const u = await liberarTx(tx, ctx, unit)
    return { ok: true as const, aparelho: { id: u.id, status: u.status } }
  }, db)
}

export async function alterarStatus(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.alterarStatus) return fail(403, "SEM_PERMISSAO", "Sem permissão para alterar a situação do aparelho.")
  const r = (raw ?? {}) as Record<string, unknown>
  const para = r.para
  const motivo = str(r.motivo, 300)
  if (!isAparelhoStatus(para) || para === "vendido" || para === "devolvido" || para === "reservado") {
    return fail(400, "VALIDACAO", "Situação de destino inválida.")
  }
  if (para === "disponivel") return liberarParaVenda(ctx, id, db)
  if (!motivo) return fail(400, "VALIDACAO", "Informe o motivo da mudança.", "motivo")
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    const u = await transicionarTx(tx, ctx, unit, para, "status", { motivo })
    return { ok: true as const, aparelho: { id: u.id, status: u.status } }
  }, db)
}

export async function registrarConferenciaRestricao(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.cadastrar && !ctx.perms.alterarStatus) return fail(403, "SEM_PERMISSAO", "Sem permissão para registrar conferência.")
  const r = (raw ?? {}) as Record<string, unknown>
  const resultado = r.resultado
  const fonte = str(r.fonte, 120)
  const observacao = str(r.observacao, 300)
  if (resultado !== "sem_restricao" && resultado !== "restricao_conhecida") return fail(400, "VALIDACAO", "Informe o resultado da conferência.")
  if (!fonte) return fail(400, "VALIDACAO", "Informe a fonte consultada (ex.: consulta manual no portal oficial).", "fonte")
  return runAparelhoTx(async (tx) => {
    let unit = await lockUnitTx(tx, ctx.storeId, id)
    if (unit.status === "vendido" || unit.status === "baixado") stop(409, "TRANSICAO_INVALIDA", "Aparelho vendido ou baixado não recebe nova conferência.")
    unit = await tx.aparelhoFisico.update({
      where: { id: unit.id },
      data: {
        restricaoStatus: resultado === "sem_restricao" ? "conferido_sem_restricao" : "restricao_conhecida",
        restricaoFonte: fonte,
        restricaoConferidaEm: new Date(),
        restricaoConferidaPor: ctx.actorLabel,
        version: { increment: 1 },
      },
    })
    await eventoTx(tx, ctx, unit.id, "conferencia_restricao", unit.status, unit.status, { resultado, fonte, observacao, manual: true })
    if (resultado === "restricao_conhecida" && unit.status !== "bloqueado") {
      unit = await transicionarTx(tx, ctx, unit, "bloqueado", "bloqueio", { motivo: "Restrição de IMEI registrada", fonte })
    }
    return { ok: true as const, aparelho: { id: unit.id, status: unit.status, restricaoStatus: unit.restricaoStatus } }
  }, db)
}

export async function atualizarAparelho(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.editar) return fail(403, "SEM_PERMISSAO", "Sem permissão para editar aparelhos.")
  const r = (raw ?? {}) as Record<string, unknown>
  const expectedVersion = Number(r.version)
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    if (Number.isInteger(expectedVersion) && expectedVersion !== unit.version) {
      stop(409, "VERSAO_DESATUALIZADA", "Este aparelho foi alterado por outra pessoa. Recarregue antes de salvar.")
    }
    if (unit.status === "vendido" || unit.status === "baixado") stop(409, "SOMENTE_LEITURA", "Aparelho vendido ou baixado não pode ser editado.")
    const merged = { ...unit, ...r, imei1: r.imei1 ?? unit.imei1 ?? "", imei2: r.imei2 ?? unit.imei2 ?? "", serial: r.serial ?? unit.serial ?? "", fotos: [] }
    const parsed = parseAparelhoInput(merged, { exigeIdentificador: true })
    if (!parsed.ok) throw new AparelhoFailError(parsed)
    const i = parsed.input
    if (!ctx.perms.definirCusto) { i.custoAquisicao = unit.custoAquisicao; i.despesas = unit.despesas }
    const custoMuda = i.custoAquisicao !== unit.custoAquisicao || i.despesas !== unit.despesas
    if (custoMuda && !ctx.perms.definirCusto) stop(403, "SEM_PERMISSAO", "Sem permissão para alterar o custo.")
    const precoMuda = i.precoVenda !== unit.precoVenda
    if (precoMuda && !ctx.perms.definirPreco && unit.status !== "aguardando_conferencia" && unit.status !== "em_avaliacao") {
      stop(403, "SEM_PERMISSAO", "Sem permissão para alterar o preço de um aparelho já liberado.")
    }
    const idsMudam = i.imei1 !== unit.imei1 || i.imei2 !== unit.imei2 || i.serial !== unit.serial
    if (idsMudam && contaNoEstoque(unit.status)) stop(409, "IDENTIFICADOR_BLOQUEADO", "Retire o aparelho da venda antes de corrigir o IMEI ou série.")
    const modeloMuda = i.marca !== unit.marca || i.modelo !== unit.modelo || i.armazenamento !== unit.armazenamento || isNovo(i.condicao) !== isNovo(unit.condicao)
    if (modeloMuda && contaNoEstoque(unit.status)) stop(409, "MODELO_BLOQUEADO", "Retire o aparelho da venda antes de trocar modelo, armazenamento ou condição.")
    const produtoId = modeloMuda ? await resolveProdutoModeloTx(tx, ctx.storeId, { ...i, produtoId: undefined }) : unit.produtoId
    const updated = await tx.aparelhoFisico.update({
      where: { id: unit.id },
      data: {
        produtoId,
        marca: i.marca, modelo: i.modelo, variante: i.variante, armazenamento: i.armazenamento, memoriaRam: i.memoriaRam, cor: i.cor,
        condicao: i.condicao, imei1: i.imei1, imei2: i.imei2, serial: i.serial, ean: i.ean,
        ...(ctx.perms.definirCusto ? { custoAquisicao: i.custoAquisicao, despesas: i.despesas, custoTotal: Math.round((i.custoAquisicao + i.despesas) * 100) / 100 } : {}),
        precoSugerido: i.precoSugerido, precoVenda: i.precoVenda, garantiaContratualDias: i.garantiaContratualDias,
        acessorios: i.acessorios, estadoFisico: i.estadoFisico, checklist: i.checklist as Prisma.InputJsonValue,
        bateriaSaude: i.bateriaSaude, bateriaFonte: i.bateriaFonte, observacoes: i.observacoes,
        version: { increment: 1 },
      },
    })
    if (idsMudam) await syncIdentificadoresTx(tx, ctx.storeId, unit.id, i)
    const mudou: Record<string, unknown> = {}
    if (precoMuda) mudou.preco = { de: unit.precoVenda, para: i.precoVenda }
    if (custoMuda) mudou.custo = true
    if (idsMudam) mudou.identificadores = true
    await eventoTx(tx, ctx, unit.id, precoMuda ? "alteracao_preco" : "edicao", unit.status, unit.status, mudou)
    return { ok: true as const, aparelho: { id: updated.id, version: updated.version } }
  }, db)
}

export async function adicionarFotos(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.editar) return fail(403, "SEM_PERMISSAO", "Sem permissão para editar aparelhos.")
  const parsed = parseAparelhoInput({ marca: "x", modelo: "x", condicao: "usado", fotos: (raw as { fotos?: unknown })?.fotos }, { exigeIdentificador: false })
  if (!parsed.ok) return parsed
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    const atuais = await tx.aparelhoFoto.count({ where: { storeId: ctx.storeId, aparelhoId: unit.id } })
    if (atuais + parsed.input.fotos.length > 6) stop(409, "LIMITE_FOTOS", "Máximo de 6 fotos por aparelho.")
    await tx.aparelhoFoto.createMany({ data: parsed.input.fotos.map((f) => ({ storeId: ctx.storeId, aparelhoId: unit.id, dataUrl: f.dataUrl, legenda: f.legenda, createdBy: ctx.actorId })) })
    await eventoTx(tx, ctx, unit.id, "fotos", unit.status, unit.status, { quantidade: parsed.input.fotos.length })
    return { ok: true as const }
  }, db)
}

// ─── Reserva ─────────────────────────────────────────────────────────────────

export async function reservarAparelho(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.reservar) return fail(403, "SEM_PERMISSAO", "Sem permissão para reservar aparelhos.")
  const r = (raw ?? {}) as Record<string, unknown>
  const token = str(r.token, 128)
  const minutos = Math.min(Math.max(Number(r.minutos) || 30, 5), 120)
  if (!token) return fail(400, "VALIDACAO", "Token de reserva obrigatório.")
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    const now = Date.now()
    if (unit.status === "reservado" && unit.reservaToken === token) {
      const u = await tx.aparelhoFisico.update({ where: { id: unit.id }, data: { reservadoAte: new Date(now + minutos * 60_000) } })
      return { ok: true as const, reserva: { token, ate: u.reservadoAte } }
    }
    if (unit.status === "reservado" && unit.reservadoAte && unit.reservadoAte.getTime() > now) {
      stop(409, "APARELHO_RESERVADO", `Aparelho reservado por ${unit.reservadoPor || "outro atendimento"} até ${unit.reservadoAte.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`)
    }
    if (unit.status === "reservado") {
      // Reserva expirada: assume a unidade sem passar pelo estado intermediário.
      const u = await tx.aparelhoFisico.update({ where: { id: unit.id }, data: { reservaToken: token, reservadoAte: new Date(now + minutos * 60_000), reservadoPor: ctx.actorLabel, version: { increment: 1 } } })
      await eventoTx(tx, ctx, unit.id, "reserva", "reservado", "reservado", { expirada: true, minutos })
      return { ok: true as const, reserva: { token, ate: u.reservadoAte } }
    }
    if (unit.status !== "disponivel") stop(409, "APARELHO_INDISPONIVEL", "Aparelho indisponível para reserva.")
    const u = await transicionarTx(tx, ctx, unit, "reservado", "reserva", { minutos }, { reservaToken: token, reservadoAte: new Date(now + minutos * 60_000), reservadoPor: ctx.actorLabel })
    return { ok: true as const, reserva: { token, ate: u.reservadoAte } }
  }, db)
}

export async function cancelarReserva(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.reservar) return fail(403, "SEM_PERMISSAO", "Sem permissão.")
  const token = str((raw as { token?: unknown })?.token, 128)
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, id)
    if (unit.status !== "reservado") return { ok: true as const, replay: true }
    const expirada = !unit.reservadoAte || unit.reservadoAte.getTime() <= Date.now()
    if (unit.reservaToken !== token && !expirada && !ctx.perms.aprovarAquisicao) stop(403, "RESERVA_DE_OUTRO", "Reserva feita por outro atendimento.")
    await transicionarTx(tx, ctx, unit, "disponivel", "reserva_cancelada", {})
    return { ok: true as const }
  }, db)
}

// ─── Aquisições ──────────────────────────────────────────────────────────────

const TIPOS_AQUISICAO = ["compra_cliente", "fornecedor", "lote", "negociacao"] as const
const FORMAS_PAGAMENTO = ["dinheiro", "pix", "transferencia", "credito_loja", "abatimento_venda", "outro"] as const
const DOC_ORIGEM = ["declaracao_procedencia", "nota_fiscal", "recibo", "outro"] as const

export async function criarAquisicao(ctx: AparelhoCtx, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.comprarDeCliente) return fail(403, "SEM_PERMISSAO", "Sem permissão para registrar compra de aparelhos.")
  const r = (raw ?? {}) as Record<string, unknown>
  const tipo = String(r.tipo) as (typeof TIPOS_AQUISICAO)[number]
  if (!(TIPOS_AQUISICAO as readonly string[]).includes(tipo)) return fail(400, "VALIDACAO", "Tipo de aquisição inválido.")
  const clienteId = str(r.clienteId, 64) || null
  const fornecedorId = str(r.fornecedorId, 64) || null
  const vendedorNome = str(r.vendedorNome, 120)
  const vendedorDoc = str(r.vendedorDocumento, 20).replace(/\D/g, "")
  const documentoOrigemTipo = str(r.documentoOrigemTipo, 40)
  const documentoOrigemNumero = str(r.documentoOrigemNumero, 80)
  const formaPagamento = str(r.formaPagamento, 30)
  const pagamentoStatus = r.pagamentoStatus === "pago" ? "pago" : "pendente"
  const valorTotal = num(r.valorTotal)
  const observacoes = str(r.observacoes, 1000)
  const itens = Array.isArray(r.aparelhos) ? r.aparelhos.slice(0, 50) : []

  const pessoaFisica = tipo === "compra_cliente" || tipo === "negociacao"
  if (pessoaFisica && !clienteId && !vendedorNome) return fail(400, "VALIDACAO", "Identifique o vendedor (cliente cadastrado ou nome).", "vendedorNome")
  if (pessoaFisica && vendedorDoc.length !== 11 && vendedorDoc.length !== 14 && !clienteId) {
    return fail(400, "DOCUMENTO_VENDEDOR", "Informe o CPF ou CNPJ de quem está vendendo o aparelho.", "vendedorDocumento")
  }
  if (!pessoaFisica && !fornecedorId) return fail(400, "VALIDACAO", "Selecione o fornecedor.", "fornecedorId")
  if (!(DOC_ORIGEM as readonly string[]).includes(documentoOrigemTipo)) {
    return fail(400, "ORIGEM_SEM_DOCUMENTO", "Registre o documento de origem (declaração de procedência, nota fiscal ou recibo).", "documentoOrigemTipo")
  }
  if (documentoOrigemTipo !== "declaracao_procedencia" && !documentoOrigemNumero) {
    return fail(400, "ORIGEM_SEM_DOCUMENTO", "Informe o número do documento de origem.", "documentoOrigemNumero")
  }
  if (!(FORMAS_PAGAMENTO as readonly string[]).includes(formaPagamento)) return fail(400, "VALIDACAO", "Selecione a forma de pagamento.", "formaPagamento")
  if (valorTotal === null || valorTotal < 0) return fail(400, "VALIDACAO", "Informe o valor da compra.", "valorTotal")
  if (itens.length === 0) return fail(400, "VALIDACAO", "Inclua ao menos um aparelho.")
  if (pessoaFisica && itens.length !== 1) return fail(400, "VALIDACAO", "Compra de cliente registra um aparelho por protocolo.")
  const parsedItens: AparelhoInput[] = []
  for (const [idx, it] of itens.entries()) {
    const p = parseAparelhoInput(it, { exigeIdentificador: true })
    if (!p.ok) return { ...p, message: itens.length > 1 ? `Aparelho ${idx + 1}: ${p.message}` : p.message }
    parsedItens.push(p.input)
  }
  // Valor da compra é o custo de aquisição: distribuído pelo valor informado por item (ou igual).
  const somaItens = parsedItens.reduce((s, i) => s + i.custoAquisicao, 0)
  if (somaItens > 0 && Math.abs(somaItens - valorTotal) > 0.02) {
    return fail(400, "VALOR_DIVERGENTE", `A soma dos custos dos aparelhos (R$ ${somaItens.toFixed(2)}) difere do valor da compra (R$ ${valorTotal.toFixed(2)}).`, "valorTotal")
  }
  if (somaItens === 0) {
    const cada = Math.round((valorTotal / parsedItens.length) * 100) / 100
    parsedItens.forEach((i, k) => { i.custoAquisicao = k === parsedItens.length - 1 ? Math.round((valorTotal - cada * (parsedItens.length - 1)) * 100) / 100 : cada })
  }
  const ctxCusto: AparelhoCtx = { ...ctx, perms: { ...ctx.perms, definirCusto: true } } // custo da aquisição é o próprio valor pago

  return runAparelhoTx(async (tx) => {
    if (clienteId) {
      const c = await tx.cliente.findFirst({ where: { id: clienteId, storeId: ctx.storeId }, select: { id: true } })
      if (!c) stop(404, "CLIENTE_NAO_ENCONTRADO", "Cliente não encontrado nesta loja.", "clienteId")
    }
    let fornecedorNome = ""
    if (fornecedorId) {
      const f = await tx.fornecedor.findFirst({ where: { id: fornecedorId, storeId: ctx.storeId }, select: { name: true } })
      if (!f) stop(404, "FORNECEDOR_NAO_ENCONTRADO", "Fornecedor não encontrado nesta loja.", "fornecedorId")
      fornecedorNome = f.name
    }
    const ano = Number(localDateKey(new Date()).slice(0, 4))
    const seq = await nextSequenceTx(tx, ctx.storeId, "AQ", ano)
    const protocolo = `AQ-${ano}-${String(seq).padStart(4, "0")}`
    const aq = await tx.aparelhoAquisicao.create({
      data: {
        storeId: ctx.storeId, protocolo, tipo, status: "aguardando_aprovacao", clienteId, fornecedorId,
        vendedorNome: vendedorNome || fornecedorNome,
        vendedorDocMascarado: vendedorDoc ? maskDocumento(vendedorDoc) : "",
        vendedorDocHash: vendedorDoc ? sha256Json(["doc", ctx.storeId, vendedorDoc]) : null,
        documentoOrigemTipo, documentoOrigemNumero, valorTotal, formaPagamento, pagamentoStatus, observacoes,
        createdBy: ctx.actorId,
      },
    })
    const unidades: Array<{ id: string; codigoInterno: string }> = []
    for (const item of parsedItens) {
      // Recompra: IMEI já conhecido da loja (vendido/baixado/devolvido) reaproveita a MESMA unidade.
      const ids = [item.imei1, item.imei2].filter(Boolean) as string[]
      const known = ids.length
        ? await tx.aparelhoIdentificador.findFirst({ where: { storeId: ctx.storeId, tipo: "imei", valor: { in: ids } }, select: { aparelhoId: true } })
        : item.serial
          ? await tx.aparelhoIdentificador.findFirst({ where: { storeId: ctx.storeId, tipo: "serial", valor: item.serial }, select: { aparelhoId: true } })
          : null
      if (known) {
        const unit = await lockUnitTx(tx, ctx.storeId, known.aparelhoId)
        if (!["vendido", "baixado", "devolvido"].includes(unit.status)) {
          stop(409, "IMEI_DUPLICADO", `Este aparelho já está no estoque da loja (${unit.codigoInterno}, ${unit.status}).`, "imei1")
        }
        const anterior = {
          status: unit.status, propriedade: unit.propriedade, origem: unit.origem, aquisicaoId: unit.aquisicaoId, produtoId: unit.produtoId,
          marca: unit.marca, modelo: unit.modelo, armazenamento: unit.armazenamento, cor: unit.cor, condicao: unit.condicao,
          custoAquisicao: unit.custoAquisicao, despesas: unit.despesas, custoTotal: unit.custoTotal, precoVenda: unit.precoVenda,
          variante: unit.variante, memoriaRam: unit.memoriaRam, imei1: unit.imei1, imei2: unit.imei2, serial: unit.serial,
          precoSugerido: unit.precoSugerido, checklist: unit.checklist, acessorios: unit.acessorios, estadoFisico: unit.estadoFisico,
          bateriaSaude: unit.bateriaSaude, bateriaFonte: unit.bateriaFonte, observacoes: unit.observacoes,
          restricaoStatus: unit.restricaoStatus, restricaoFonte: unit.restricaoFonte,
          restricaoConferidaEm: unit.restricaoConferidaEm, restricaoConferidaPor: unit.restricaoConferidaPor,
        }
        // Fora do saldo (vendido/baixado/devolvido): trocar de produto não mexe em estoque.
        const produtoId = await resolveProdutoModeloTx(tx, ctx.storeId, { ...item, produtoId: undefined })
        await syncIdentificadoresTx(tx, ctx.storeId, unit.id, item)
        const updated = await tx.aparelhoFisico.update({
          where: { id: unit.id },
          data: {
            produtoId, marca: item.marca, modelo: item.modelo, variante: item.variante, armazenamento: item.armazenamento, memoriaRam: item.memoriaRam, cor: item.cor,
            imei1: item.imei1, imei2: item.imei2, serial: item.serial,
            status: "em_avaliacao", propriedade: tipo === "negociacao" ? "negociacao" : "aguardando_aquisicao", origem: tipo, aquisicaoId: aq.id,
            custoAquisicao: item.custoAquisicao, despesas: item.despesas, custoTotal: Math.round((item.custoAquisicao + item.despesas) * 100) / 100,
            precoVenda: item.precoVenda, precoSugerido: item.precoSugerido, condicao: item.condicao,
            checklist: item.checklist as Prisma.InputJsonValue, acessorios: item.acessorios, estadoFisico: item.estadoFisico,
            bateriaSaude: item.bateriaSaude, bateriaFonte: item.bateriaFonte, observacoes: item.observacoes,
            restricaoStatus: "nao_consultado", restricaoFonte: null, restricaoConferidaEm: null, restricaoConferidaPor: null,
            version: { increment: 1 },
          },
        })
        await eventoTx(tx, ctx, unit.id, "reaquisicao", unit.status, "em_avaliacao", { aquisicaoId: aq.id, protocolo, anterior })
        unidades.push({ id: updated.id, codigoInterno: updated.codigoInterno })
        continue
      }
      const unit = await criarUnidadeTx(tx, ctxCusto, item, {
        origem: tipo, propriedade: tipo === "negociacao" ? "negociacao" : "aguardando_aquisicao", status: "em_avaliacao", aquisicaoId: aq.id, fornecedorNome,
      })
      unidades.push({ id: unit.id, codigoInterno: unit.codigoInterno })
    }
    return { ok: true as const, aquisicao: { id: aq.id, protocolo, status: aq.status }, aparelhos: unidades }
  }, db)
}

export async function decidirAquisicao(ctx: AparelhoCtx, id: string, raw: unknown, db: Db = prisma) {
  const r = (raw ?? {}) as Record<string, unknown>
  const decisao = r.decisao
  const motivo = str(r.motivo, 300)
  if (decisao !== "aprovar" && decisao !== "recusar") return fail(400, "VALIDACAO", "Decisão inválida.")
  if (decisao === "recusar" && !motivo) return fail(400, "VALIDACAO", "Informe o motivo da recusa.", "motivo")
  return runAparelhoTx(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "aparelhos_aquisicoes" WHERE "id" = ${id} AND "storeId" = ${ctx.storeId} FOR UPDATE`
    if (!rows[0]) stop(404, "NAO_ENCONTRADO", "Aquisição não encontrada nesta loja.")
    const aq = await tx.aparelhoAquisicao.findUniqueOrThrow({ where: { id }, include: { aparelhos: true } })
    if (aq.status !== "aguardando_aprovacao") {
      if ((decisao === "aprovar" && aq.status === "confirmada") || (decisao === "recusar" && aq.status === "recusada")) {
        return { ok: true as const, aquisicao: { id: aq.id, status: aq.status }, replay: true }
      }
      stop(409, "AQUISICAO_DECIDIDA", `Aquisição já ${aq.status}.`)
    }
    const politica = await getPoliticaTx(tx, ctx.storeId)
    const exigeSegregacao = politica.aquisicaoExigeAprovacao
    const permitido = exigeSegregacao ? podeAprovarAquisicao(ctx.perms, aq.createdBy, ctx.actorId) : ctx.perms.aprovarAquisicao
    if (!permitido) {
      stop(403, "SEGREGACAO_FUNCOES", ctx.perms.aprovarAquisicao
        ? "Quem registrou a compra não pode aprová-la. Peça a outro gerente ou ao proprietário."
        : "Somente gerente ou proprietário aprova aquisições.")
    }
    if (decisao === "aprovar") {
      await tx.aparelhoAquisicao.update({ where: { id }, data: { status: "confirmada", aprovadaPor: ctx.actorLabel, aprovadaEm: new Date() } })
      for (const u of aq.aparelhos) {
        if (u.status === "baixado") continue
        await tx.aparelhoFisico.update({ where: { id: u.id }, data: { propriedade: "loja", version: { increment: 1 } } })
        const encerradas = await tx.aparelhoVenda.updateMany({ where: { storeId: ctx.storeId, aparelhoId: u.id, status: "ativa" }, data: { status: "recomprada" } })
        await eventoTx(tx, ctx, u.id, "aquisicao_confirmada", u.status, u.status, { protocolo: aq.protocolo, valor: u.custoAquisicao, ...(encerradas.count ? { garantiaAnteriorEncerrada: true } : {}) })
      }
      return { ok: true as const, aquisicao: { id, status: "confirmada" } }
    }
    await tx.aparelhoAquisicao.update({ where: { id }, data: { status: "recusada", motivoRecusa: motivo, aprovadaPor: ctx.actorLabel, aprovadaEm: new Date() } })
    for (const u of aq.aparelhos) {
      const reaq = await tx.aparelhoEvento.findFirst({ where: { storeId: ctx.storeId, aparelhoId: u.id, tipo: "reaquisicao" }, orderBy: { createdAt: "desc" }, select: { dados: true } })
      const anterior = (reaq?.dados as { aquisicaoId?: string; anterior?: Record<string, unknown> } | null)
      if (anterior?.aquisicaoId === aq.id && anterior.anterior) {
        // Recompra recusada: a unidade volta exatamente como estava (venda/garantia anteriores intactas).
        const a = anterior.anterior as Record<string, never>
        await tx.aparelhoFisico.update({ where: { id: u.id }, data: { ...a, version: { increment: 1 } } })
        const prev = anterior.anterior as { imei1?: string | null; imei2?: string | null; serial?: string | null }
        await syncIdentificadoresTx(tx, ctx.storeId, u.id, { imei1: prev.imei1 ?? null, imei2: prev.imei2 ?? null, serial: prev.serial ?? null })
        await eventoTx(tx, ctx, u.id, "aquisicao_recusada", u.status, String(a.status), { protocolo: aq.protocolo, motivo, recompra: true })
        continue
      }
      // Aparelho do vendedor nunca foi da loja: sai do fluxo e libera o IMEI para nova tentativa.
      await tx.aparelhoFisico.update({ where: { id: u.id }, data: { status: "baixado", aquisicaoId: aq.id, version: { increment: 1 } } })
      await tx.aparelhoIdentificador.deleteMany({ where: { storeId: ctx.storeId, aparelhoId: u.id } })
      await eventoTx(tx, ctx, u.id, "aquisicao_recusada", u.status, "baixado", { protocolo: aq.protocolo, motivo })
    }
    return { ok: true as const, aquisicao: { id, status: "recusada" } }
  }, db)
}

// ─── Política ────────────────────────────────────────────────────────────────

export async function obterPolitica(storeId: string, db: Db = prisma): Promise<PoliticaAparelhos> {
  const row = await db.aparelhoPoliticaLoja.findUnique({ where: { storeId } })
  return politicaFromRow(row)
}

export async function salvarPolitica(ctx: AparelhoCtx, raw: unknown, db: Db = prisma) {
  if (!ctx.perms.configurarGarantia) return fail(403, "SEM_PERMISSAO", "Somente o proprietário configura a política de garantia.")
  const r = (raw ?? {}) as Record<string, unknown>
  const max = Number(r.contratualMaxDias)
  if (!Number.isInteger(max) || max < 0) return fail(400, "VALIDACAO", "Limite máximo inválido.", "contratualMaxDias")
  const padrao = validateContratualDias(r.contratualPadraoDias, max)
  if (!padrao.ok) return fail(400, padrao.code, padrao.message, "contratualPadraoDias")
  const presets = Array.isArray(r.presetsContratuaisDias) ? r.presetsContratuaisDias : [0, 30, 90, 180, 365]
  const condicoesTermo = str(r.condicoesTermo, 3000)
  const data = {
    presetsContratuaisDias: presets as Prisma.InputJsonValue,
    contratualPadraoDias: padrao.dias,
    contratualMaxDias: max,
    condicoesTermo,
    aquisicaoExigeAprovacao: r.aquisicaoExigeAprovacao !== false,
    liberacaoExigeConferencia: r.liberacaoExigeConferencia !== false,
    updatedBy: ctx.actorLabel,
  }
  const saved = await db.aparelhoPoliticaLoja.upsert({
    where: { storeId: ctx.storeId },
    create: { storeId: ctx.storeId, versao: 1, ...data },
    update: { ...data, versao: { increment: 1 } },
  })
  return { ok: true as const, politica: politicaFromRow(saved) }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export type AparelhoListaFiltro = {
  q?: string
  status?: string
  condicao?: string
  origem?: string
  page?: number
  pageSize?: number
  ordem?: "recentes" | "preco_asc" | "preco_desc" | "modelo"
  somenteVendaveis?: boolean
}

export function aparelhoDto(u: AparelhoFisico & { _vendas?: number }, perms: AparelhoPermissions) {
  return {
    id: u.id,
    codigoInterno: u.codigoInterno,
    produtoId: u.produtoId,
    marca: u.marca,
    modelo: u.modelo,
    variante: u.variante,
    armazenamento: u.armazenamento,
    memoriaRam: u.memoriaRam,
    cor: u.cor,
    condicao: u.condicao,
    imei1: perms.dadosSensiveis ? u.imei1 : maskImei(u.imei1),
    imei2: perms.dadosSensiveis ? u.imei2 : maskImei(u.imei2),
    serial: perms.dadosSensiveis ? u.serial : maskSerial(u.serial),
    ean: u.ean,
    identificadoresMascarados: !perms.dadosSensiveis,
    status: u.status,
    propriedade: u.propriedade,
    origem: u.origem,
    aquisicaoId: u.aquisicaoId,
    custoAquisicao: perms.verCusto ? u.custoAquisicao : null,
    despesas: perms.verCusto ? u.despesas : null,
    custoTotal: perms.verCusto ? u.custoTotal : null,
    precoSugerido: u.precoSugerido,
    precoVenda: u.precoVenda,
    garantiaContratualDias: u.garantiaContratualDias,
    acessorios: u.acessorios,
    estadoFisico: u.estadoFisico,
    checklist: u.checklist,
    bateriaSaude: u.bateriaSaude,
    bateriaFonte: u.bateriaFonte,
    restricaoStatus: u.restricaoStatus,
    restricaoFonte: u.restricaoFonte,
    restricaoConferidaEm: u.restricaoConferidaEm,
    observacoes: u.observacoes,
    entradaEstoqueEm: u.entradaEstoqueEm,
    reservadoAte: u.reservadoAte,
    reservadoPor: u.reservadoPor,
    version: u.version,
    createdAt: u.createdAt,
  }
}
export type AparelhoDTO = ReturnType<typeof aparelhoDto>

export async function listarAparelhos(ctx: AparelhoCtx, f: AparelhoListaFiltro, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão para consultar aparelhos.")
  const pageSize = Math.min(Math.max(Math.floor(Number(f.pageSize) || 10), 1), 100)
  const page = Math.max(Math.floor(Number(f.page) || 1), 1)
  const where: Prisma.AparelhoFisicoWhereInput = { storeId: ctx.storeId }
  if (f.somenteVendaveis) where.status = { in: ["disponivel", "reservado"] }
  else if (f.status && isAparelhoStatus(f.status)) where.status = f.status
  else where.status = { not: "baixado" }
  if (f.condicao && (APARELHO_CONDICOES as readonly string[]).includes(f.condicao)) where.condicao = f.condicao
  if (f.origem && (APARELHO_ORIGENS as readonly string[]).includes(f.origem)) where.origem = f.origem
  const q = (f.q ?? "").trim().slice(0, 80)
  if (q) {
    const digits = normalizeImei(q)
    const or: Prisma.AparelhoFisicoWhereInput[] = [
      { marca: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { cor: { contains: q, mode: "insensitive" } },
      { codigoInterno: { contains: q, mode: "insensitive" } },
      { serial: { contains: q.toUpperCase() } },
      { observacoes: { contains: q, mode: "insensitive" } },
      { aquisicao: { is: { vendedorNome: { contains: q, mode: "insensitive" } } } },
      { aquisicao: { is: { fornecedor: { is: { name: { contains: q, mode: "insensitive" } } } } } },
    ]
    if (looksLikeImeiQuery(q)) {
      or.push({ imei1: digits.length === 15 ? digits : { endsWith: digits } }, { imei2: digits.length === 15 ? digits : { endsWith: digits } })
    }
    const tokens = q.split(/\s+/).filter(Boolean)
    if (tokens.length > 1) {
      or.push({ AND: tokens.map((t) => ({ OR: [{ marca: { contains: t, mode: "insensitive" as const } }, { modelo: { contains: t, mode: "insensitive" as const } }, { armazenamento: { contains: t, mode: "insensitive" as const } }, { cor: { contains: t, mode: "insensitive" as const } }] })) })
    }
    where.OR = or
  }
  const orderBy: Prisma.AparelhoFisicoOrderByWithRelationInput[] =
    f.ordem === "preco_asc" ? [{ precoVenda: "asc" }] : f.ordem === "preco_desc" ? [{ precoVenda: "desc" }] : f.ordem === "modelo" ? [{ marca: "asc" }, { modelo: "asc" }] : [{ createdAt: "desc" }]
  const [total, rows] = await Promise.all([
    db.aparelhoFisico.count({ where }),
    db.aparelhoFisico.findMany({ where, orderBy: [...orderBy, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ])
  return { ok: true as const, total, page, pageSize, itens: rows.map((u) => aparelhoDto(u, ctx.perms)) }
}

export async function resumoAparelhos(ctx: AparelhoCtx, dias = 30, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão para consultar aparelhos.")
  const desde = new Date(Date.now() - Math.min(Math.max(dias, 1), 366) * 86_400_000)
  const [grupos, vendas, aguardando] = await Promise.all([
    db.aparelhoFisico.groupBy({
      by: ["status", "condicao"],
      where: { storeId: ctx.storeId, status: { in: ["disponivel", "reservado", "em_revisao", "em_avaliacao", "aguardando_conferencia"] } },
      _count: { _all: true },
      _sum: { custoTotal: true, precoVenda: true },
    }),
    db.aparelhoVenda.findMany({
      where: { storeId: ctx.storeId, status: "ativa", createdAt: { gte: desde } },
      select: { precoVenda: true, aparelho: { select: { custoTotal: true } } },
    }),
    db.aparelhoAquisicao.count({ where: { storeId: ctx.storeId, status: "aguardando_aprovacao" } }),
  ])
  let emEstoque = 0, custoEstoque = 0, novos = 0, custoNovos = 0, usados = 0, custoUsados = 0, reservados = 0, valorReservados = 0, emPreparo = 0
  for (const g of grupos) {
    const c = g._count._all
    const custo = g._sum.custoTotal ?? 0
    if (g.status === "disponivel" || g.status === "reservado") {
      emEstoque += c; custoEstoque += custo
      if (isNovo(g.condicao)) { novos += c; custoNovos += custo } else { usados += c; custoUsados += custo }
    } else emPreparo += c
    if (g.status === "reservado") { reservados += c; valorReservados += g._sum.precoVenda ?? 0 }
  }
  const receita = vendas.reduce((s, v) => s + v.precoVenda, 0)
  const custoVendidos = vendas.reduce((s, v) => s + (v.aparelho.custoTotal ?? 0), 0)
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    ok: true as const,
    periodoDias: dias,
    emEstoque, novos, usados, reservados, emPreparo, aquisicoesPendentes: aguardando,
    vendidosPeriodo: vendas.length,
    receitaPeriodo: r2(receita),
    valorReservados: r2(valorReservados),
    ...(ctx.perms.verCusto
      ? { custoEstoque: r2(custoEstoque), custoNovos: r2(custoNovos), custoUsados: r2(custoUsados), resultadoPeriodo: r2(receita - custoVendidos) }
      : { custoEstoque: null, custoNovos: null, custoUsados: null, resultadoPeriodo: null }),
  }
}

export async function detalheAparelho(ctx: AparelhoCtx, id: string, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão para consultar aparelhos.")
  const u = await db.aparelhoFisico.findFirst({
    where: { id, storeId: ctx.storeId },
    include: {
      eventos: { orderBy: { createdAt: "asc" }, take: 200 },
      fotos: { select: { id: true, dataUrl: true, legenda: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      vendas: { orderBy: { createdAt: "desc" }, select: { id: true, pedidoId: true, numeroGarantia: true, status: true, dataVenda: true, dataEntrega: true, contratualDias: true, coberturaFim: true, precoVenda: true, cliente: { select: { name: true } } } },
      aquisicao: { select: { id: true, protocolo: true, tipo: true, status: true, vendedorNome: true, vendedorDocMascarado: true, documentoOrigemTipo: true, documentoOrigemNumero: true, valorTotal: true, formaPagamento: true, pagamentoStatus: true, createdAt: true, fornecedor: { select: { name: true } } } },
      produto: { select: { id: true, name: true, stock: true } },
    },
  })
  if (!u) return fail(404, "NAO_ENCONTRADO", "Aparelho não encontrado nesta loja.")
  // OS em que o mesmo IMEI apareceu como aparelho DE CLIENTE (só referência; nunca vira estoque).
  const ids = [u.imei1, u.imei2, u.serial].filter((x): x is string => !!x)
  // Sem Prisma.sql/Prisma.join (viram parâmetro jsonb depois do bundler): 3 LIKEs fixos.
  const pad = (i: number) => (ids[i] ? `%${ids[i]}%` : "%§sem-identificador§%")
  const os = ids.length
    ? await db.$queryRaw<Array<{ id: string; numero: string | null; createdAt: Date }>>`
        SELECT "id", "numero", "createdAt" FROM "ordens_servico"
        WHERE "storeId" = ${ctx.storeId}
          AND ("payload"::text LIKE ${pad(0)} OR "payload"::text LIKE ${pad(1)} OR "payload"::text LIKE ${pad(2)})
        ORDER BY "createdAt" DESC LIMIT 10`
    : []
  return {
    ok: true as const,
    aparelho: aparelhoDto(u, ctx.perms),
    produto: u.produto,
    eventos: u.eventos.map((e) => ({ id: e.id, tipo: e.tipo, deStatus: e.deStatus, paraStatus: e.paraStatus, dados: ctx.perms.verCusto ? e.dados : redactDados(e.dados), operador: e.operador, createdAt: e.createdAt })),
    fotos: u.fotos,
    vendas: u.vendas.map((v) => ({ ...v, cliente: v.cliente?.name ?? "" })),
    aquisicao: u.aquisicao ? { ...u.aquisicao, valorTotal: ctx.perms.verCusto ? u.aquisicao.valorTotal : null, fornecedor: u.aquisicao.fornecedor?.name ?? "" } : null,
    ordensServico: os,
  }
}

function redactDados(d: unknown): unknown {
  if (!d || typeof d !== "object" || Array.isArray(d)) return d
  const { valor: _v, custo: _c, anterior: _a, ...rest } = d as Record<string, unknown>
  return rest
}

export async function listarAquisicoes(ctx: AparelhoCtx, f: { status?: string; page?: number }, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão.")
  const where: Prisma.AparelhoAquisicaoWhereInput = { storeId: ctx.storeId, ...(f.status ? { status: f.status } : {}) }
  const page = Math.max(1, Math.floor(Number(f.page) || 1))
  const [total, rows] = await Promise.all([
    db.aparelhoAquisicao.count({ where }),
    db.aparelhoAquisicao.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20,
      include: { aparelhos: { select: { id: true, codigoInterno: true, marca: true, modelo: true, armazenamento: true, cor: true, imei1: true, status: true } }, fornecedor: { select: { name: true } }, cliente: { select: { name: true } } },
    }),
  ])
  return {
    ok: true as const,
    total,
    itens: rows.map((a) => ({
      id: a.id, protocolo: a.protocolo, tipo: a.tipo, status: a.status,
      vendedor: a.cliente?.name || a.vendedorNome || a.fornecedor?.name || "",
      vendedorDocMascarado: a.vendedorDocMascarado,
      documentoOrigemTipo: a.documentoOrigemTipo, documentoOrigemNumero: a.documentoOrigemNumero,
      valorTotal: ctx.perms.verCusto || a.createdBy === ctx.actorId ? a.valorTotal : null,
      formaPagamento: a.formaPagamento, pagamentoStatus: a.pagamentoStatus,
      criadoPorMim: a.createdBy === ctx.actorId,
      aprovadaPor: a.aprovadaPor, aprovadaEm: a.aprovadaEm, motivoRecusa: a.motivoRecusa, createdAt: a.createdAt,
      aparelhos: a.aparelhos.map((u) => ({ ...u, imei1: ctx.perms.dadosSensiveis ? u.imei1 : maskImei(u.imei1) })),
    })),
  }
}

export async function listarGarantias(ctx: AparelhoCtx, f: { q?: string; vigentes?: boolean; page?: number }, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão.")
  const q = (f.q ?? "").trim()
  const hoje = dateKeyToDb(localDateKey(new Date()))
  const where: Prisma.AparelhoVendaWhereInput = {
    storeId: ctx.storeId,
    ...(f.vigentes ? { status: "ativa", coberturaFim: { gte: hoje } } : {}),
    ...(q
      ? { OR: [
          { numeroGarantia: { contains: q, mode: "insensitive" } },
          { pedidoId: { contains: q, mode: "insensitive" } },
          { cliente: { is: { name: { contains: q, mode: "insensitive" } } } },
          { aparelho: { is: { OR: [{ imei1: { endsWith: normalizeImei(q) || "§" } }, { modelo: { contains: q, mode: "insensitive" } }] } } },
        ] }
      : {}),
  }
  const page = Math.max(1, Math.floor(Number(f.page) || 1))
  const [total, rows] = await Promise.all([
    db.aparelhoVenda.count({ where }),
    db.aparelhoVenda.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20,
      select: { id: true, numeroGarantia: true, pedidoId: true, status: true, dataVenda: true, dataEntrega: true, legalDias: true, contratualDias: true, contratualFim: true, coberturaFim: true, precoVenda: true,
        cliente: { select: { name: true } }, aparelho: { select: { id: true, codigoInterno: true, marca: true, modelo: true, armazenamento: true, cor: true, imei1: true } } },
    }),
  ])
  return {
    ok: true as const,
    total,
    itens: rows.map((g) => ({ ...g, cliente: g.cliente?.name ?? "", aparelho: { ...g.aparelho, imei1: ctx.perms.dadosSensiveis ? g.aparelho.imei1 : maskImei(g.aparelho.imei1) }, vigente: g.status === "ativa" && g.coberturaFim >= hoje })),
  }
}

export async function historicoLoja(ctx: AparelhoCtx, f: { q?: string; page?: number }, db: Db = prisma) {
  if (!ctx.perms.consultar) return fail(403, "SEM_PERMISSAO", "Sem permissão.")
  const page = Math.max(1, Math.floor(Number(f.page) || 1))
  const q = (f.q ?? "").trim()
  const digits = normalizeImei(q)
  const where: Prisma.AparelhoEventoWhereInput = {
    storeId: ctx.storeId,
    ...(q ? { aparelho: { is: { OR: [{ codigoInterno: { contains: q, mode: "insensitive" } }, { modelo: { contains: q, mode: "insensitive" } }, ...(digits.length >= 5 ? [{ imei1: { endsWith: digits } }, { imei2: { endsWith: digits } }] : [])] } } } : {}),
  }
  const [total, rows] = await Promise.all([
    db.aparelhoEvento.count({ where }),
    db.aparelhoEvento.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { aparelho: { select: { id: true, codigoInterno: true, marca: true, modelo: true, armazenamento: true } } } }),
  ])
  return { ok: true as const, total, itens: rows.map((e) => ({ id: e.id, tipo: e.tipo, deStatus: e.deStatus, paraStatus: e.paraStatus, operador: e.operador, createdAt: e.createdAt, dados: ctx.perms.verCusto ? e.dados : redactDados(e.dados), aparelho: e.aparelho })) }
}

/** Busca para venda (PDV / Venda Completa): somente unidades vendáveis; nunca expõe custo sem permissão. */
export async function buscarParaVenda(ctx: AparelhoCtx, q: string, db: Db = prisma) {
  return listarAparelhos(ctx, { q, somenteVendaveis: true, pageSize: 20, ordem: "modelo" }, db)
}

export async function registrarEmissaoDocumento(
  ctx: AparelhoCtx,
  ref: { tipo: string; formato: string; aparelhoVendaId?: string | null; aquisicaoId?: string | null; conteudoHash: string },
  db: Db = prisma,
) {
  const key = ref.aparelhoVendaId
    ? { storeId_tipo_formato_aparelhoVendaId: { storeId: ctx.storeId, tipo: ref.tipo, formato: ref.formato, aparelhoVendaId: ref.aparelhoVendaId } }
    : { storeId_tipo_formato_aquisicaoId: { storeId: ctx.storeId, tipo: ref.tipo, formato: ref.formato, aquisicaoId: ref.aquisicaoId! } }
  const doc = await db.aparelhoDocumento.upsert({
    where: key,
    create: { storeId: ctx.storeId, tipo: ref.tipo, formato: ref.formato, aparelhoVendaId: ref.aparelhoVendaId ?? null, aquisicaoId: ref.aquisicaoId ?? null, conteudoHash: ref.conteudoHash, emitidoPor: ctx.actorLabel },
    update: { emissoes: { increment: 1 }, ultimaEmissaoEm: new Date() },
  })
  return { emissoes: doc.emissoes, primeiraEmissaoEm: doc.primeiraEmissaoEm, conteudoHash: doc.conteudoHash, mudouDesdeEmissao: doc.conteudoHash !== ref.conteudoHash }
}
