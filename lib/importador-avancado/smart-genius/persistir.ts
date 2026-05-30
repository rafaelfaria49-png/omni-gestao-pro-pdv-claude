// ============================================================
// lib/importador-avancado/smart-genius/persistir.ts
// Persistência server-side dos dois relatórios Smart Genius.
//
// Clientes  → upsert mínimo seguro em `Cliente` (dedupe por nome, multi-loja).
// Contas a Receber → 2 títulos por cliente (atraso=VENCIDO, a vencer=PENDENTE)
//   via `upsertContaReceber` (idempotente por storeId+localKey).
//
// PERFORMANCE (fix 504 Vercel):
//  - Snapshot do banco em LOTE (1 query por chunk de 200) em vez de findFirst/
//    findUnique por linha (N+1). Elimina ~430 round-trips sequenciais.
//  - Escrita em CHUNKS PARALELOS (Promise.all) — não satura o pool.
//
// Invariantes (inalteradas):
//  - storeId obrigatório em TODA query (multi-loja).
//  - Idempotência: reimportar não duplica (dedupe por nome / localKey estável).
//  - Não rebaixa título já pago/parcial/cancelado/estornado.
//  - Importa o PRINCIPAL ("Em atraso"/"A vencer"); "Reaj"/"Total"/"Tot. Reaj"
//    ficam apenas na observação (payload). Nunca soma juros ao principal.
// ============================================================

import { prisma } from "@/lib/prisma"
import { upsertContaReceber } from "@/lib/financeiro/services/contas-receber-service"
import { RECEBER_STATUS, normalizeReceberStatus, type ReceberStatusCanon } from "@/lib/financeiro/contracts/status"
import { FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem"
import type { SmartClienteNormalizado, SmartContaReceberNormalizada } from "./tipos"

const ORIGEM_SISTEMA = "smart-genius" as const

/** Concorrência de escrita por chunk. Espelha o importador de produtos (pool-safe). */
const CONCORRENCIA = 10
/** Tamanho do chunk de leitura `IN (...)` no snapshot. */
const SNAPSHOT_CHUNK = 200

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

/** Executa `fn` sobre os itens em chunks paralelos de tamanho fixo. */
async function emChunks<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < itens.length; i += tamanho) {
    const chunk = itens.slice(i, i + tamanho)
    await Promise.all(chunk.map(fn))
  }
}

/** Fatia um array em pedaços de tamanho fixo (para queries `IN`). */
function fatiar<T>(itens: T[], tamanho: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho))
  return out
}

// ── Clientes ─────────────────────────────────────────────────

/** Chave case-insensitive (espelha `equals … mode:"insensitive"` do Prisma). */
function ciKey(s: string): string {
  return s.trim().toLowerCase()
}

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

  // 1. Dedupe no arquivo por nome (case-insensitive). Evita race de creates
  //    do mesmo nome quando rodando em paralelo (Cliente não tem unique de nome).
  const porNome = new Map<string, SmartClienteNormalizado>()
  for (const c of clientes) {
    const nome = c.nome.trim()
    if (!nome) {
      out.pulados++
      out.log.push({ chave: `linha ${c.linha}`, acao: "pulado", detalhe: "nome vazio" })
      continue
    }
    const k = ciKey(nome)
    if (!porNome.has(k)) porNome.set(k, c)
  }
  const unicos = [...porNome.values()]

  // 2. Snapshot do banco em lote: nome(ci) → id. 1 query por chunk de 200.
  const idPorNome = new Map<string, string>()
  for (const chunk of fatiar(unicos.map((c) => c.nome.trim()), SNAPSHOT_CHUNK)) {
    const rows = await prisma.cliente.findMany({
      where: { storeId: sid, name: { in: chunk, mode: "insensitive" } },
      select: { id: true, name: true, storeId: true },
    })
    for (const r of rows) {
      if (r.storeId !== sid) continue // defesa em profundidade multi-loja
      idPorNome.set(ciKey(r.name), r.id)
    }
  }

  // 3. Escrita em chunks paralelos.
  await emChunks(unicos, CONCORRENCIA, async (c) => {
    const nome = c.nome.trim()
    try {
      const id = idPorNome.get(ciKey(nome))
      if (id) {
        // Update conservador: só sobrescreve quando vier preenchido (não apaga).
        await prisma.cliente.update({
          where: { id },
          data: { phone: c.telefone || undefined, city: c.cidade || undefined },
        })
        out.atualizados++
        out.log.push({ chave: nome, acao: "atualizado" })
      } else {
        await prisma.cliente.create({
          data: { storeId: sid, name: nome, kind: "PF", phone: c.telefone || null, city: c.cidade || "" },
        })
        out.criados++
        out.log.push({ chave: nome, acao: "criado" })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Race rara (criado em paralelo por outra request) → conta como pulado, não falha o lote.
      if (msg.includes("Unique") || msg.includes("P2002")) {
        out.pulados++
        out.log.push({ chave: nome, acao: "pulado", detalhe: "duplicata (race)" })
      } else {
        out.erros++
        out.log.push({ chave: nome, acao: "erro", detalhe: msg })
      }
    }
  })

  console.info(
    `[import/smart/clientes] storeId=${sid} arquivo=${clientes.length} unicos=${unicos.length} ` +
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

/** Intent de gravação de UM título (já com localKey/descrição/status resolvidos). */
export type IntentTituloSmart = {
  localKey: string
  tipo: TipoTitulo
  valor: number
  descricao: string
  status: ReceberStatusCanon
  cliente: string
  vencimento: string
  conta: SmartContaReceberNormalizada
}

/**
 * Constrói a lista de títulos a gravar a partir das contas (PURO — sem DB).
 * Regras de negócio (inalteradas):
 *  - "Em atraso" > 0 → título VENCIDO; "A vencer" > 0 → título PENDENTE.
 *  - valor zero → não cria aquele título.
 *  - localKey estável por (storeId, código|nome, tipo) → idempotência.
 *  - dedupe por localKey dentro do arquivo (mantém o primeiro — estável).
 */
export function construirIntentsContas(
  storeId: string,
  contas: SmartContaReceberNormalizada[],
): IntentTituloSmart[] {
  const intents = new Map<string, IntentTituloSmart>()
  const tipos: TipoTitulo[] = ["atraso", "avencer"]
  for (const c of contas) {
    for (const tipo of tipos) {
      const valor = tipo === "atraso" ? c.emAtraso : c.aVencer
      if (!(valor > 0)) continue
      const localKey = `imp-smart:${storeId}:cr:${chaveCliente(c)}:${tipo}`
      if (intents.has(localKey)) continue
      intents.set(localKey, {
        localKey,
        tipo,
        valor,
        descricao:
          tipo === "atraso"
            ? "SALDO MIGRADO SMARTGENIUS - EM ATRASO"
            : "SALDO MIGRADO SMARTGENIUS - A VENCER",
        status: tipo === "atraso" ? RECEBER_STATUS.VENCIDO : RECEBER_STATUS.PENDENTE,
        cliente: c.cliente,
        vencimento: c.menorVencimento || "",
        conta: c,
      })
    }
  }
  return [...intents.values()]
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

  // 1. Intents (puro) — 2 títulos/cliente conforme regra; dedupe por localKey.
  const intents = construirIntentsContas(sid, contas)

  // 2. Snapshot do banco em lote: localKey → status atual. 1 query por chunk.
  const statusPorKey = new Map<string, string>()
  for (const chunk of fatiar(intents.map((i) => i.localKey), SNAPSHOT_CHUNK)) {
    const rows = await prisma.contaReceberTitulo.findMany({
      where: { storeId: sid, localKey: { in: chunk } },
      select: { localKey: true, status: true, storeId: true },
    })
    for (const r of rows) {
      if (r.storeId !== sid || !r.localKey) continue
      statusPorKey.set(r.localKey, r.status)
    }
  }

  // 3. Upsert em chunks paralelos.
  await emChunks(intents, CONCORRENCIA, async (it) => {
    const chaveLog = `${it.cliente} [${it.tipo}]`
    try {
      const prevStatus = statusPorKey.get(it.localKey)
      const jaExistia = prevStatus !== undefined
      // Não rebaixar título já pago/parcial/cancelado/estornado em reimportação.
      if (jaExistia && statusTerminalOuPago(prevStatus)) {
        out.pulados++
        out.log.push({ chave: chaveLog, acao: "pulado", detalhe: `título já em "${prevStatus}" — não rebaixado` })
        return
      }

      await upsertContaReceber({
        storeId: sid,
        localKey: it.localKey,
        descricao: it.descricao,
        cliente: it.cliente,
        valor: it.valor, // PRINCIPAL — sem reajuste/juros
        vencimento: it.vencimento || undefined,
        status: it.status,
        payloadPatch: {
          origem: FINANCEIRO_ORIGEM.IMPORTACAO,
          origemSistema: ORIGEM_SISTEMA,
          codigoLegadoSmart: it.conta.codigoLegado || null,
          tipoSaldo: it.tipo,
          // Observação solicitada: Total / Reaj / Tot. Reaj + código legado.
          observacao: {
            total: it.conta.total,
            reaj: it.conta.reaj,
            totalReaj: it.conta.totalReaj,
            codigoLegadoSmart: it.conta.codigoLegado || null,
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
  })

  console.info(
    `[import/smart/contas-receber] storeId=${sid} clientes=${contas.length} titulos=${intents.length} ` +
      `criados=${out.criados} atualizados=${out.atualizados} pulados=${out.pulados} erros=${out.erros}`,
  )
  return out
}
