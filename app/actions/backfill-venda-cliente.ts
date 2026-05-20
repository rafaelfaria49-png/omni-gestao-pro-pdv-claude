"use server"

import { prisma } from "@/lib/prisma"

function normalizeDigits(v: string | null | undefined): string {
  if (!v) return ""
  return v.replace(/\D/g, "")
}

type BackfillResult = {
  ok: boolean
  totalVendas: number
  vinculadas: number
  porDocumento: number
  porTelefone: number
  semMatch: number
  erros: number
  detalhes?: string
}

/**
 * Backfill seguro: vincula Vendas antigas ao cliente cadastrado quando
 * há match confiável por documento normalizado (prioridade) ou telefone normalizado.
 * NUNCA vincula por nome (risco alto de colisão).
 *
 * Critérios de segurança:
 * - só processa Vendas sem clienteId ainda definido
 * - só aceita match único (1 cliente por documento/telefone)
 * - documento tem prioridade sobre telefone
 * - atualiza em batches de 50 para não travar o DB
 */
export async function backfillVendaCliente(
  storeId: string
): Promise<BackfillResult> {
  if (!storeId) return { ok: false, totalVendas: 0, vinculadas: 0, porDocumento: 0, porTelefone: 0, semMatch: 0, erros: 0, detalhes: "storeId obrigatório" }

  // Pré-carrega todos os clientes da loja para lookup in-memory (sem N+1)
  const clientes = await prisma.cliente.findMany({
    where: { storeId },
    select: { id: true, document: true, phone: true },
  })

  // Índices normalizados → clienteId (só registra quando há exatamente 1 match)
  const docMap = new Map<string, string>()
  const phoneMap = new Map<string, string>()

  for (const c of clientes) {
    const docNorm = normalizeDigits(c.document)
    const phoneNorm = normalizeDigits(c.phone)
    if (docNorm.length >= 11) {
      if (docMap.has(docNorm)) {
        // Colisão: dois clientes com mesmo documento — não usa nenhum
        docMap.delete(docNorm)
      } else {
        docMap.set(docNorm, c.id)
      }
    }
    if (phoneNorm.length >= 10) {
      if (phoneMap.has(phoneNorm)) {
        // Colisão: dois clientes com mesmo telefone — não usa nenhum
        phoneMap.delete(phoneNorm)
      } else {
        phoneMap.set(phoneNorm, c.id)
      }
    }
  }

  // Busca Vendas sem clienteId que têm payload.enterprise com documento ou telefone
  const vendas = await prisma.venda.findMany({
    where: { storeId, clienteId: null },
    select: { id: true, payload: true },
  })

  let vinculadas = 0
  let porDocumento = 0
  let porTelefone = 0
  let semMatch = 0
  let erros = 0

  // Processa em batches de 50
  const BATCH = 50
  for (let i = 0; i < vendas.length; i += BATCH) {
    const lote = vendas.slice(i, i + BATCH)
    await Promise.all(
      lote.map(async (v) => {
        try {
          const enterprise = (v.payload as Record<string, unknown> | null)?.enterprise as Record<string, unknown> | undefined

          const docNorm = normalizeDigits(enterprise?.clienteDocument as string | undefined)
          const phoneNorm = normalizeDigits(enterprise?.clienteTelefone as string | undefined)

          let matchId: string | null = null
          let via: "doc" | "phone" | null = null

          if (docNorm.length >= 11 && docMap.has(docNorm)) {
            matchId = docMap.get(docNorm)!
            via = "doc"
          } else if (phoneNorm.length >= 10 && phoneMap.has(phoneNorm)) {
            matchId = phoneMap.get(phoneNorm)!
            via = "phone"
          }

          if (matchId) {
            await prisma.venda.update({
              where: { id: v.id },
              data: { clienteId: matchId },
            })
            vinculadas++
            if (via === "doc") porDocumento++
            else porTelefone++
          } else {
            semMatch++
          }
        } catch {
          erros++
        }
      })
    )
  }

  return {
    ok: true,
    totalVendas: vendas.length,
    vinculadas,
    porDocumento,
    porTelefone,
    semMatch,
    erros,
    detalhes: `Vendas GestaoClick importadas (sem payload.enterprise) ficam com clienteId=null — match por nome não é aplicado por segurança.`,
  }
}
