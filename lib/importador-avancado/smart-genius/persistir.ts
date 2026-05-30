// ============================================================
// lib/importador-avancado/smart-genius/persistir.ts
// Persistência server-side dos dois relatórios Smart Genius.
//
// Clientes  → upsert mínimo seguro em `Cliente` (dedupe por nome, multi-loja).
// Contas a Receber → 2 títulos por cliente (atraso=VENCIDO, a vencer=PENDENTE)
//   via `upsertContaReceber` (idempotente por storeId+localKey).
//
// Invariantes respeitadas:
//  - storeId obrigatório em TODA query (multi-loja).
//  - Idempotência: reimportar não duplica (dedupe por nome / localKey estável).
//  - Não rebaixa título já pago/parcial/cancelado/estornado.
//  - Importa o PRINCIPAL ("Em atraso"/"A vencer"); "Reaj"/"Total"/"Tot. Reaj"
//    ficam apenas na observação (payload). Nunca soma juros ao principal.
// ============================================================

import { prisma } from "@/lib/prisma"
import {
  upsertContaReceber,
  getContaReceberByLocalKey,
} from "@/lib/financeiro/services/contas-receber-service"
import { RECEBER_STATUS, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"
import { FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem"
import type { SmartClienteNormalizado, SmartContaReceberNormalizada } from "./tipos"

const ORIGEM_SISTEMA = "smart-genius" as const

export type SmartPersistLog = {
  chave: string
  acao: "criado" | "atualizado" | "pulado" | "erro"
  detalhe?: string
}

export type SmartPersistResultado = {
  criados: number
  atualizados: number
  pulados: number
  erros: number
  log: SmartPersistLog[]
}

function vazio(): SmartPersistResultado {
  return { criados: 0, atualizados: 0, pulados: 0, erros: 0, log: [] }
}

// ── Clientes ─────────────────────────────────────────────────

export async function persistirClientesSmart(
  storeId: string,
  clientes: SmartClienteNormalizado[],
): Promise<SmartPersistResultado> {
  const out = vazio()
  const sid = String(storeId ?? "").trim()
  if (!sid) {
    out.erros++
    out.log.push({ chave: "-", acao: "erro", detalhe: "storeId ausente" })
    return out
  }

  for (const c of clientes) {
    const nome = c.nome.trim()
    if (!nome) {
      out.pulados++
      out.log.push({ chave: `linha ${c.linha}`, acao: "pulado", detalhe: "nome vazio" })
      continue
    }
    try {
      // Dedupe por nome (case-insensitive) dentro da loja. Smart não traz CPF/CNPJ.
      const existente = await prisma.cliente.findFirst({
        where: { storeId: sid, name: { equals: nome, mode: "insensitive" } },
        select: { id: true },
      })

      if (existente) {
        // Update conservador: só sobrescreve telefone/cidade quando vierem
        // preenchidos — nunca apaga dado já existente no OmniGestão.
        await prisma.cliente.update({
          where: { id: existente.id },
          data: {
            phone: c.telefone || undefined,
            city: c.cidade || undefined,
          },
        })
        out.atualizados++
        out.log.push({ chave: nome, acao: "atualizado" })
      } else {
        await prisma.cliente.create({
          data: {
            storeId: sid,
            name: nome,
            kind: "PF",
            phone: c.telefone || null,
            city: c.cidade || "",
          },
        })
        out.criados++
        out.log.push({ chave: nome, acao: "criado" })
      }
    } catch (e) {
      out.erros++
      out.log.push({ chave: nome, acao: "erro", detalhe: e instanceof Error ? e.message : String(e) })
    }
  }

  console.info(
    `[import/smart/clientes] storeId=${sid} total=${clientes.length} ` +
      `criados=${out.criados} atualizados=${out.atualizados} pulados=${out.pulados} erros=${out.erros}`,
  )
  return out
}

// ── Contas a Receber ─────────────────────────────────────────

/** Slug seguro para compor `localKey` (sem `:` para não quebrar o parse da chave). */
function slugLocalKey(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "sem-id"
}

/** Identidade estável do cliente na chave: código legado quando houver, senão slug do nome. */
function chaveCliente(c: SmartContaReceberNormalizada): string {
  const cod = String(c.codigoLegado ?? "").replace(/\D/g, "")
  return cod || slugLocalKey(c.cliente)
}

/** Status que NÃO podem ser rebaixados por reimportação. */
function statusTerminalOuPago(status: string | null | undefined): boolean {
  const s = normalizeReceberStatus(status)
  return (
    s === RECEBER_STATUS.PAGO ||
    s === RECEBER_STATUS.PARCIAL ||
    s === RECEBER_STATUS.CANCELADO ||
    s === RECEBER_STATUS.ESTORNADO
  )
}

type TipoTitulo = "atraso" | "avencer"

async function upsertTituloSmart(
  storeId: string,
  c: SmartContaReceberNormalizada,
  tipo: TipoTitulo,
  out: SmartPersistResultado,
): Promise<void> {
  const valor = tipo === "atraso" ? c.emAtraso : c.aVencer
  if (!(valor > 0)) return // regra 3: valor zero → não cria aquele título

  const localKey = `imp-smart:${storeId}:cr:${chaveCliente(c)}:${tipo}`
  const descricao =
    tipo === "atraso"
      ? "SALDO MIGRADO SMARTGENIUS - EM ATRASO"
      : "SALDO MIGRADO SMARTGENIUS - A VENCER"
  const status = tipo === "atraso" ? RECEBER_STATUS.VENCIDO : RECEBER_STATUS.PENDENTE
  const chaveLog = `${c.cliente} [${tipo}]`

  try {
    // Não rebaixar título já pago/parcial/cancelado/estornado em reimportação.
    const existente = await getContaReceberByLocalKey(storeId, localKey)
    if (existente && statusTerminalOuPago(existente.status)) {
      out.pulados++
      out.log.push({
        chave: chaveLog,
        acao: "pulado",
        detalhe: `título já em "${existente.status}" — não rebaixado`,
      })
      return
    }
    const jaExistia = Boolean(existente)

    await upsertContaReceber({
      storeId,
      localKey,
      descricao,
      cliente: c.cliente,
      valor, // PRINCIPAL — sem reajuste/juros
      vencimento: c.menorVencimento || undefined,
      status,
      payloadPatch: {
        origem: FINANCEIRO_ORIGEM.IMPORTACAO,
        origemSistema: ORIGEM_SISTEMA,
        codigoLegadoSmart: c.codigoLegado || null,
        tipoSaldo: tipo,
        // Observação solicitada: Total / Reaj / Tot. Reaj + código legado.
        observacao: {
          total: c.total,
          reaj: c.reaj,
          totalReaj: c.totalReaj,
          codigoLegadoSmart: c.codigoLegado || null,
        },
        importadoEm: new Date().toISOString(),
      },
    })

    if (jaExistia) {
      out.atualizados++
      out.log.push({ chave: chaveLog, acao: "atualizado" })
    } else {
      out.criados++
      out.log.push({ chave: chaveLog, acao: "criado" })
    }
  } catch (e) {
    out.erros++
    out.log.push({ chave: chaveLog, acao: "erro", detalhe: e instanceof Error ? e.message : String(e) })
  }
}

export async function persistirContasReceberSmart(
  storeId: string,
  contas: SmartContaReceberNormalizada[],
): Promise<SmartPersistResultado> {
  const out = vazio()
  const sid = String(storeId ?? "").trim()
  if (!sid) {
    out.erros++
    out.log.push({ chave: "-", acao: "erro", detalhe: "storeId ausente" })
    return out
  }

  for (const c of contas) {
    await upsertTituloSmart(sid, c, "atraso", out)
    await upsertTituloSmart(sid, c, "avencer", out)
  }

  console.info(
    `[import/smart/contas-receber] storeId=${sid} clientes=${contas.length} ` +
      `criados=${out.criados} atualizados=${out.atualizados} pulados=${out.pulados} erros=${out.erros}`,
  )
  return out
}
