// ============================================================
// lib/importador-avancado/persistidor.ts
// Persiste registros mergeados no Prisma com upsert idempotente
// Ordem: clientes → fornecedores → produtos → OS → vendas → financeiro
// ============================================================

import { prisma } from "@/lib/prisma"
import { normalizeNameForMatch, docDigitsForDedupe } from "@/lib/import-normalize"
import type { RegistroMergeado, LogLinhaImport, DominioImport, ResultadoImportacao } from "./types"
import {
  extrairCamposOS,
  extrairCamposCliente,
  extrairCamposProduto,
} from "./merger"
import type { Prisma } from "@/generated/prisma"
import { StatusOrdemServico } from "@/generated/prisma"

// ── Utilitários ───────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function toStatusPrisma(s: string): StatusOrdemServico {
  switch (s) {
    case "EmAnalise": return StatusOrdemServico.EmAnalise
    case "Pronto": return StatusOrdemServico.Pronto
    case "Entregue": return StatusOrdemServico.Entregue
    default: return StatusOrdemServico.Aberto
  }
}

function slugCategoria(raw: string): string {
  return norm(raw).replace(/\s+/g, "_").slice(0, 50) || "geral"
}

// ── Persistência por domínio ─────────────────────────────────

async function persistirClientes(
  storeId: string,
  registros: RegistroMergeado[],
  log: LogLinhaImport[]
): Promise<Map<string, string>> {
  const nomeParaId = new Map<string, string>()

  for (const reg of registros) {
    try {
      const campos = extrairCamposCliente(reg)
      if (!campos.name.trim()) {
        log.push({ dominio: "clientes", chave: reg.chave, acao: "ignorado", detalhe: "Nome vazio" })
        continue
      }

      const docDigits = docDigitsForDedupe(campos.document)
      const nomeNorm = normalizeNameForMatch(campos.name)

      // Busca por documento (CPF/CNPJ) primeiro — mais precisa que nome
      const docDigitsLocal = docDigitsForDedupe(campos.document)
      let existente: { id: string } | null = null
      if (docDigitsLocal) {
        existente = await prisma.cliente.findFirst({
          where: { storeId, document: { contains: docDigitsLocal } },
          select: { id: true },
        })
      }
      // Fallback: busca por nome insensível a maiúsculas
      if (!existente) {
        existente = await prisma.cliente.findFirst({
          where: {
            storeId,
            name: { equals: campos.name, mode: "insensitive" as const },
          },
          select: { id: true },
        })
      }

      const cidadeUf = [campos.city].filter(Boolean).join("") || ""
      const data = {
        storeId,
        name: campos.name,
        phone: campos.phone ?? null,
        email: campos.email ?? null,
        document: campos.document || "",
        kind: (campos.kind === "PJ" ? "PJ" : "PF") as string,
        city: cidadeUf,
        active: campos.active ?? true,
        tags: campos.payload as Prisma.InputJsonValue,
      }

      let id: string
      if (existente) {
        await prisma.cliente.update({ where: { id: existente.id }, data })
        id = existente.id
        log.push({ dominio: "clientes", chave: reg.chave, acao: "atualizado" })
      } else {
        const criado = await prisma.cliente.create({ data })
        id = criado.id
        log.push({ dominio: "clientes", chave: reg.chave, acao: "criado" })
      }

      nomeParaId.set(nomeNorm, id)
      if (docDigits) nomeParaId.set(docDigits, id)
    } catch (e) {
      log.push({
        dominio: "clientes",
        chave: reg.chave,
        acao: "erro",
        detalhe: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return nomeParaId
}

async function persistirFornecedores(
  storeId: string,
  registros: RegistroMergeado[],
  log: LogLinhaImport[]
): Promise<void> {
  for (const reg of registros) {
    try {
      const campos = extrairCamposCliente(reg)
      if (!campos.name.trim()) {
        log.push({ dominio: "fornecedores", chave: reg.chave, acao: "ignorado", detalhe: "Nome vazio" })
        continue
      }

      // Model Fornecedor não tem @@unique — "upsert lógico" via findFirst + create/update
      const docDigits = docDigitsForDedupe(campos.document)
      let existente: { id: string } | null = null
      if (docDigits) {
        existente = await prisma.fornecedor.findFirst({
          where: { storeId, document: { contains: docDigits } },
          select: { id: true },
        })
      }
      if (!existente) {
        existente = await prisma.fornecedor.findFirst({
          where: {
            storeId,
            name: { equals: campos.name, mode: "insensitive" as const },
          },
          select: { id: true },
        })
      }

      const data = {
        storeId,
        name: campos.name,
        document: campos.document || "",
        email: campos.email ?? "",
        phone: campos.phone ?? "",
        active: campos.active ?? true,
      }

      if (existente) {
        await prisma.fornecedor.update({ where: { id: existente.id }, data })
        log.push({ dominio: "fornecedores", chave: reg.chave, acao: "atualizado" })
      } else {
        await prisma.fornecedor.create({ data })
        log.push({ dominio: "fornecedores", chave: reg.chave, acao: "criado" })
      }
    } catch (e) {
      log.push({
        dominio: "fornecedores",
        chave: reg.chave,
        acao: "erro",
        detalhe: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

async function persistirProdutos(
  storeId: string,
  registros: RegistroMergeado[],
  log: LogLinhaImport[]
): Promise<void> {
  for (const reg of registros) {
    try {
      const campos = extrairCamposProduto(reg)
      if (!campos.name.trim()) {
        log.push({ dominio: "produtos", chave: reg.chave, acao: "ignorado", detalhe: "Nome vazio" })
        continue
      }

      const catSlug = slugCategoria(campos.category || "produto")

      // SKU vazio: gera sintético para evitar colisão no unique(storeId, sku)
      const skuSafe = campos.sku?.trim()
        ? campos.sku.trim()
        : `IMP-${catSlug}-${norm(campos.name).slice(0, 20).replace(/\s+/g, "-")}`

      // Upsert: tenta por SKU primeiro
      const existenteProduto = await prisma.produto.findFirst({
        where: { storeId, sku: skuSafe },
        select: { id: true },
      })

      const produtoData = {
        storeId,
        sku: skuSafe,
        name: campos.name,
        category: catSlug,
        precoCusto: campos.cost,
        price: campos.price,
        stock: campos.stock,
        barcode: campos.barcode ?? null,
        brand: campos.category || "",
      }

      if (existenteProduto) {
        await prisma.produto.update({
          where: { id: existenteProduto.id },
          data: {
            name: produtoData.name,
            category: produtoData.category,
            precoCusto: produtoData.precoCusto,
            price: produtoData.price,
            stock: produtoData.stock,
            barcode: produtoData.barcode,
            brand: produtoData.brand,
          },
        })
      } else {
        await prisma.produto.create({ data: produtoData })
      }

      log.push({ dominio: "produtos", chave: reg.chave, acao: "criado" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("Unique")) {
        log.push({ dominio: "produtos", chave: reg.chave, acao: "atualizado" })
      } else {
        log.push({ dominio: "produtos", chave: reg.chave, acao: "erro", detalhe: msg })
      }
    }
  }
}

async function persistirOS(
  storeId: string,
  registros: RegistroMergeado[],
  clienteNomeParaId: Map<string, string>,
  log: LogLinhaImport[]
): Promise<void> {
  for (const reg of registros) {
    try {
      const campos = extrairCamposOS(reg)

      // Tenta resolver clienteId: documento → mapa de nomes → banco por nome
      const nomeNorm = normalizeNameForMatch(campos.clienteNome)
      const docCampos = String(
        reg.campos["cliente.cpf"] ?? reg.campos["cliente.cnpj"] ?? reg.campos["cliente.documento"] ?? ""
      ).trim()
      const docDigitsOS = docDigitsForDedupe(docCampos)

      let clienteId: string | null = null

      // 1. Tenta pelo documento (mais preciso — evita mesclar homônimos)
      if (docDigitsOS) {
        clienteId = clienteNomeParaId.get(docDigitsOS) ?? null
      }

      // 2. Fallback: mapa de nomes da importação atual
      if (!clienteId) {
        clienteId = clienteNomeParaId.get(nomeNorm) ?? null
      }

      // 3. Fallback: busca no banco por documento
      if (!clienteId && docDigitsOS) {
        const cli = await prisma.cliente.findFirst({
          where: { storeId, document: { contains: docDigitsOS } },
          select: { id: true },
        })
        clienteId = cli?.id ?? null
      }

      // 4. Último fallback: busca no banco por nome
      if (!clienteId && campos.clienteNome) {
        const cli = await prisma.cliente.findFirst({
          where: {
            storeId,
            name: { equals: campos.clienteNome, mode: "insensitive" },
          },
          select: { id: true },
        })
        clienteId = cli?.id ?? null
      }

      // 5. Fallback final: busca por nome com contains (mais tolerante a variações)
      if (!clienteId && campos.clienteNome) {
        const nomeNorm = normalizeNameForMatch(campos.clienteNome)
        // Pega primeira palavra significativa do nome (ex: "ANDRESSA" de "ANDRESSA SILVA")
        const primeiraPalavra = nomeNorm.split(/\s+/).filter(w => w.length >= 3)[0]
        if (primeiraPalavra) {
          const cli = await prisma.cliente.findFirst({
            where: {
              storeId,
              name: { contains: primeiraPalavra, mode: "insensitive" },
            },
            select: { id: true },
          })
          clienteId = cli?.id ?? null
        }
      }

      const payloadFinal = {
        ...campos.payload,
        clienteNome: campos.clienteNome,
      } as Prisma.InputJsonValue

      // Normaliza número da OS
      const numeroNorm = campos.numero.toUpperCase().startsWith("OS")
        ? campos.numero
        : `OS-${campos.numero}`

      const existente = await prisma.ordemServico.findFirst({
        where: { storeId, numero: numeroNorm },
        select: { id: true },
      })

      if (existente) {
        await prisma.ordemServico.update({
          where: { id: existente.id },
          data: {
            clienteId,
            valorTotal: campos.valorTotal,
            valorBase: campos.valorBase,
            equipamento: campos.equipamento,
            defeito: campos.defeito,
            laudoTecnico: campos.laudoTecnico || null,
            status: toStatusPrisma(campos.status),
            payload: payloadFinal,
          },
        })
        log.push({ dominio: "ordens_servicos", chave: numeroNorm, acao: "atualizado" })
      } else {
        const id = `os-import-${numeroNorm.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${Date.now()}`
        await prisma.ordemServico.create({
          data: {
            id,
            storeId,
            numero: numeroNorm,
            clienteId,
            valorTotal: campos.valorTotal,
            valorBase: campos.valorBase,
            equipamento: campos.equipamento,
            defeito: campos.defeito,
            laudoTecnico: campos.laudoTecnico || null,
            status: toStatusPrisma(campos.status),
            payload: payloadFinal,
          },
        })
        log.push({ dominio: "ordens_servicos", chave: numeroNorm, acao: "criado" })
      }
    } catch (e) {
      log.push({
        dominio: "ordens_servicos",
        chave: reg.chave,
        acao: "erro",
        detalhe: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

async function persistirVendas(
  storeId: string,
  registros: RegistroMergeado[],
  log: LogLinhaImport[]
): Promise<void> {
  for (const reg of registros) {
    try {
      const c = reg.campos
      const pedidoId = String(c["venda.numero"] ?? c["_raw.Nº do pedido"] ?? reg.chave).trim()
      if (!pedidoId) continue

      const total =
        (c["financeiro.valorTotal"] as number | null) ??
        parseFloat(String(c["_raw.Total do pedido"] ?? "0").replace(",", ".")) ??
        0

      const dataRaw = String(c["data.data"] ?? c["_raw.Data"] ?? "").trim()
      let at = new Date()
      if (dataRaw) {
        const match = dataRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
        if (match) at = new Date(`${match[3]}-${match[2]}-${match[1]}`)
        else if (/^\d{4}-\d{2}-\d{2}/.test(dataRaw)) at = new Date(dataRaw)
      }

      const clienteNome = String(c["cliente.nome"] ?? c["_raw.Cliente"] ?? "").trim() || null
      const pagamentosArr = (c["_array.vendas_pagamentos"] as Record<string, unknown>[] | undefined) ?? []
      const produtosArr = (c["_array.vendas_produtos"] as Record<string, unknown>[] | undefined) ?? []

      const payload = {
        pedidoId,
        cliente: clienteNome,
        total,
        at: at.toISOString(),
        formaPagamento: pagamentosArr[0]?.["pagamento.forma"] ?? pagamentosArr[0]?.["_raw.Forma de pagamento"] ?? null,
        parcelas: pagamentosArr.map((p) => ({
          valor: p["financeiro.valorParcela"] ?? p["_raw.Valor da parcela"],
          forma: p["pagamento.forma"] ?? p["_raw.Forma de pagamento"],
          vencimento: p["pagamento.vencimento"] ?? p["_raw.Vencimento"],
        })),
        itens: produtosArr.map((p) => ({
          produto: p["produto.nome"] ?? p["_raw.Produto"],
          quantidade: p["item.quantidade"] ?? p["_raw.Quantidade"] ?? 1,
          valorUnitario: p["financeiro.valorUnitario"] ?? p["_raw.Valor unitário"],
          valorTotal: p["financeiro.valorTotal"] ?? p["_raw.Valor total"],
        })),
        vendedor: c["meta.vendedor"] ?? c["_raw.Vendedor"] ?? null,
        fontes: reg.fontes,
        importadoEm: new Date().toISOString(),
      }

      await prisma.venda.upsert({
        where: { pedidoId },
        create: {
          storeId,
          pedidoId,
          total: typeof total === "number" ? total : 0,
          at,
          clienteNome,
          payload: payload as Prisma.InputJsonValue,
        },
        update: {
          total: typeof total === "number" ? total : 0,
          at,
          clienteNome,
          payload: payload as Prisma.InputJsonValue,
        },
      })

      log.push({ dominio: "vendas", chave: pedidoId, acao: "criado" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("Unique")) {
        log.push({ dominio: "vendas", chave: reg.chave, acao: "atualizado" })
      } else {
        log.push({ dominio: "vendas", chave: reg.chave, acao: "erro", detalhe: msg })
      }
    }
  }
}

// ── Orquestrador principal ────────────────────────────────────

export async function persistirImportacao(
  storeId: string,
  grupos: Map<DominioImport, RegistroMergeado[]>,
  batchId: string
): Promise<ResultadoImportacao> {
  const inicio = Date.now()
  const log: LogLinhaImport[] = []

  // 1. Clientes primeiro (OS e Vendas dependem deles)
  const clienteNomeParaId = new Map<string, string>()
  const regClientes = grupos.get("clientes") ?? []
  if (regClientes.length > 0) {
    const mapa = await persistirClientes(storeId, regClientes, log)
    for (const [k, v] of mapa) clienteNomeParaId.set(k, v)
  }

  // 2. Fornecedores (independente — usa persistência própria, NÃO vai pra tabela Cliente)
  const regFornecedores = grupos.get("fornecedores") ?? []
  if (regFornecedores.length > 0) {
    await persistirFornecedores(storeId, regFornecedores, log)
  }

  // 3. Produtos / Catálogo
  const regProdutos = grupos.get("produtos") ?? []
  if (regProdutos.length > 0) {
    await persistirProdutos(storeId, regProdutos, log)
  }

  // 4. Serviços catálogo — não persiste em produto. Aguarda model Servico próprio.
  const regServicos = grupos.get("servicos_catalogo") ?? []
  if (regServicos.length > 0) {
    for (const reg of regServicos) {
      log.push({
        dominio: "servicos_catalogo",
        chave: reg.chave,
        acao: "ignorado",
        detalhe: "Modelo Servico não implementado — será coberto em Fix futuro",
      })
    }
  }

  // 5. Ordens de Serviço (depende de clientes)
  const regOS = grupos.get("ordens_servicos") ?? []
  if (regOS.length > 0) {
    await persistirOS(storeId, regOS, clienteNomeParaId, log)
  }

  // 6. Vendas (depende de clientes + produtos)
  const regVendas = grupos.get("vendas") ?? []
  if (regVendas.length > 0) {
    await persistirVendas(storeId, regVendas, log)
  }

  // 7. Financeiro (contas a pagar/receber) — persistência via localStorage no cliente
  // Quando migrar para Prisma, adicionar aqui.

  const criados = log.filter((l) => l.acao === "criado").length
  const atualizados = log.filter((l) => l.acao === "atualizado").length
  const ignorados = log.filter((l) => l.acao === "ignorado").length
  const erros = log.filter((l) => l.acao === "erro").length

  return {
    batchId,
    ok: erros === 0,
    criados,
    atualizados,
    ignorados,
    erros,
    log,
    duracaoMs: Date.now() - inicio,
  }
}
