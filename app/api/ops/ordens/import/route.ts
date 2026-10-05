import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import type { Prisma, Cliente } from "@/generated/prisma"
import { docDigitsForDedupe, normalizeNameForMatch } from "@/lib/import-normalize"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { TX_PAYLOAD_OS_V3 } from "@/lib/operacoes-v3/os-payload-lock"
import { aplicarImportacaoEmOSExistenteV3 } from "@/lib/operacoes-v3/os-payload-import"

export const runtime = "nodejs"

// Aceita `unknown` para tolerar payload null (OS criadas via UI têm payload: null).
function extractFromPayload(raw: unknown): { numero: string; doc: string | null; nomeNorm: string } {
  if (!raw || typeof raw !== "object") return { numero: "", doc: null, nomeNorm: "" }
  const r = raw as Record<string, unknown>
  const numero = typeof r.numero === "string" ? r.numero.trim() : ""
  const c = r.cliente as Record<string, unknown> | undefined
  const nome = typeof c?.nome === "string" ? c.nome : ""
  const cpf = typeof c?.cpf === "string" ? c.cpf : ""
  return {
    numero,
    doc: docDigitsForDedupe(cpf),
    nomeNorm: normalizeNameForMatch(nome),
  }
}

// Lê valorServico → valorTotal → financeiro.valorTotal com fallback em cascata.
// buildOrdemPayloadFromRow grava em `valorServico`; outros formatos legados
// podem usar `valorTotal` ou `payload.financeiro.valorTotal`.
function extractValorFromPayload(o: Record<string, unknown>): number {
  if (typeof o.valorServico === "number" && Number.isFinite(o.valorServico) && o.valorServico > 0) {
    return o.valorServico
  }
  if (typeof o.valorTotal === "number" && Number.isFinite(o.valorTotal) && o.valorTotal > 0) {
    return o.valorTotal
  }
  const fin = o.financeiro as Record<string, unknown> | undefined
  if (fin && typeof fin.valorTotal === "number" && Number.isFinite(fin.valorTotal) && fin.valorTotal > 0) {
    return fin.valorTotal
  }
  return 0
}

// Extrai nome do cliente com fallbacks para tolerar variações de estrutura.
// Ignora o valor padrão "Cliente" que o importador coloca quando a coluna não foi mapeada.
function extractNomeClienteFromPayload(o: Record<string, unknown>): string {
  const cli = o.cliente as Record<string, unknown> | undefined
  if (typeof cli?.nome === "string" && cli.nome.trim() && cli.nome.trim() !== "Cliente") {
    return cli.nome.trim()
  }
  if (typeof o.nomeCliente === "string" && o.nomeCliente.trim()) {
    return o.nomeCliente.trim()
  }
  if (typeof o.clienteNome === "string" && o.clienteNome.trim()) {
    return o.clienteNome.trim()
  }
  return ""
}

async function requireSubscription() {
  // NextAuth v5: aceitar sessão JWT ativa
  try {
    const session = await auth()
    if (session?.user) return { ok: true as const }
  } catch {
    // fora de contexto de request; tenta fallback legacy
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, res: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, res: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function PUT(req: Request) {
  const gate = await requireSubscription()
  if (!gate.ok) return gate.res
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const list = (body as { ordens?: unknown }).ordens
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "ordens deve ser um array" }, { status: 400 })
  }

  let created = 0
  let updated = 0

  try {
    const working = await prisma.ordemServico.findMany({ where: { storeId } })
    const clientes: Cliente[] = await prisma.cliente.findMany({ where: { storeId } })
    const clienteByNomeNorm = new Map<string, string>()
    for (const c of clientes) {
      const k = normalizeNameForMatch(c.name)
      if (k && !clienteByNomeNorm.has(k)) {
        clienteByNomeNorm.set(k, c.id)
      }
    }

    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue
      const o = raw as Record<string, unknown>
      const incoming = extractFromPayload(o)
      if (!incoming.numero) continue

      const match =
        working.find((r) => r.numero === incoming.numero) ??
        (incoming.doc
          ? working.find((r) => extractFromPayload(r.payload).doc === incoming.doc)
          : undefined) ??
        (incoming.nomeNorm
          ? working.find((r) => extractFromPayload(r.payload).nomeNorm === incoming.nomeNorm)
          : undefined)

      const payloadMerged = { ...o } as Record<string, unknown>

      const nomeCli = extractNomeClienteFromPayload(payloadMerged)
      const nomeCliNorm = normalizeNameForMatch(nomeCli)
      const clienteId =
        nomeCliNorm && clienteByNomeNorm.has(nomeCliNorm) ? (clienteByNomeNorm.get(nomeCliNorm) as string) : null

      const valorTotal = extractValorFromPayload(payloadMerged)
      const valorBase = valorTotal

      const equipamentoStr = (() => {
        const eq = payloadMerged.equipamento
        if (typeof eq === "string" && eq.trim()) return eq.trim()
        const ap = payloadMerged.aparelho as Record<string, unknown> | undefined
        if (ap) {
          const marca = typeof ap.marca === "string" ? ap.marca.trim() : ""
          const modelo = typeof ap.modelo === "string" ? ap.modelo.trim() : ""
          const combined = `${marca} ${modelo}`.trim()
          if (combined) return combined
        }
        return ""
      })()

      const defeitoStr = typeof payloadMerged.defeito === "string" ? payloadMerged.defeito.trim() : ""

      const colunas = {
        numero: incoming.numero,
        clienteId,
        valorTotal,
        valorBase,
        equipamento: equipamentoStr,
        defeito: defeitoStr,
      }
      const criar = (tx: Prisma.TransactionClient, id: string) =>
        tx.ordemServico.create({
          data: {
            id,
            storeId,
            numero: incoming.numero,
            payload: { ...payloadMerged, id } as Prisma.InputJsonValue,
            clienteId,
            valorTotal,
            valorBase,
            equipamento: equipamentoStr,
            defeito: defeitoStr,
          },
        })
      const idInformado = typeof o.id === "string" && o.id.trim() ? o.id.trim() : ""
      const idGerado = () => `os-import-${incoming.numero.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${Date.now()}`

      // OS existente desta loja (por número/documento/nome ou pelo id informado): patch
      // intencional sobre o payload MAIS RECENTE, sob a trava da linha — nunca o arquivo
      // inteiro por cima de recusas, espelhos financeiros, timeline ou campos desconhecidos.
      // Id que pertence a OUTRA loja nunca é tocado: cria uma OS nova nesta loja.
      const resultado = await prisma.$transaction(async (tx) => {
        const alvo = match?.id ?? idInformado
        if (alvo) {
          const aplicado = await aplicarImportacaoEmOSExistenteV3({
            tx, storeId, osId: alvo, importado: payloadMerged, colunas, fixarIdNoPayload: true,
          })
          if (aplicado) return { tipo: "atualizado" as const, id: alvo, aplicado }
        }
        if (idInformado) {
          const existe = await tx.ordemServico.findUnique({ where: { id: idInformado }, select: { id: true } })
          if (!existe) return { tipo: "criado" as const, row: await criar(tx, idInformado) }
        }
        return { tipo: "criado" as const, row: await criar(tx, idGerado()) }
      }, TX_PAYLOAD_OS_V3)

      if (resultado.tipo === "atualizado") {
        const ix = working.findIndex((r) => r.id === resultado.id)
        const atual = ix >= 0 ? working[ix] : undefined
        if (atual) {
          working[ix] = {
            ...atual,
            numero: resultado.aplicado.numero ?? atual.numero,
            payload: resultado.aplicado.payload as Prisma.JsonValue,
          }
        }
        updated += 1
        continue
      }
      working.push(resultado.row)
      created += 1
    }

    return NextResponse.json({ ok: true, count: list.length, created, updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/ordens/import PUT]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao importar ordens", ...(dev ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
