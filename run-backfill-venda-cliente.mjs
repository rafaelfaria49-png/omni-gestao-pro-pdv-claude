/**
 * Backfill seguro: vincula Vendas existentes ao Cliente cadastrado.
 *
 * Critérios (em ordem de prioridade):
 *   1. payload.enterprise.clienteDocument normalizado = Cliente.document (≥ 11 dígitos)
 *   2. payload.enterprise.clienteTelefone normalizado = Cliente.phone (≥ 10 dígitos)
 *
 * Regras de segurança:
 *   - Nunca usa match por nome (risco de colisão)
 *   - Se dois clientes têm o mesmo doc/telefone, nenhum é vinculado
 *   - Só processa vendas com clienteId = null
 *   - Atualiza em batches de 50
 *
 * Uso:
 *   node --env-file=.env run-backfill-venda-cliente.mjs
 *   node --env-file=.env run-backfill-venda-cliente.mjs --dry-run
 */

import { PrismaClient } from "./generated/prisma/index.js"

const prisma = new PrismaClient()
const LOJA_ID = "loja-1"
const DRY_RUN = process.argv.includes("--dry-run")
const BATCH = 50

function normalizeDigits(v) {
  if (!v) return ""
  return String(v).replace(/\D/g, "")
}

async function main() {
  console.log(`\n🔗 Backfill Venda → Cliente — loja: ${LOJA_ID}`)
  if (DRY_RUN) console.log("⚠️  MODO DRY-RUN — nenhuma alteração será salva\n")

  // Carrega todos os clientes da loja para lookup in-memory
  const clientes = await prisma.cliente.findMany({
    where: { storeId: LOJA_ID },
    select: { id: true, name: true, document: true, phone: true },
  })
  console.log(`✔ ${clientes.length} clientes carregados`)

  // Índices normalizados → clienteId (colisão → exclui ambos)
  const docMap = new Map()
  const phoneMap = new Map()
  const COLISAO_DOC = new Set()
  const COLISAO_PHONE = new Set()

  for (const c of clientes) {
    const docNorm = normalizeDigits(c.document)
    const phoneNorm = normalizeDigits(c.phone)

    if (docNorm.length >= 11) {
      if (docMap.has(docNorm)) {
        COLISAO_DOC.add(docNorm)
        docMap.delete(docNorm)
      } else if (!COLISAO_DOC.has(docNorm)) {
        docMap.set(docNorm, c.id)
      }
    }
    if (phoneNorm.length >= 10) {
      if (phoneMap.has(phoneNorm)) {
        COLISAO_PHONE.add(phoneNorm)
        phoneMap.delete(phoneNorm)
      } else if (!COLISAO_PHONE.has(phoneNorm)) {
        phoneMap.set(phoneNorm, c.id)
      }
    }
  }

  if (COLISAO_DOC.size > 0) console.log(`⚠️  ${COLISAO_DOC.size} documento(s) com colisão — ignorados`)
  if (COLISAO_PHONE.size > 0) console.log(`⚠️  ${COLISAO_PHONE.size} telefone(s) com colisão — ignorados`)

  // Busca todas as Vendas sem clienteId
  const vendas = await prisma.venda.findMany({
    where: { storeId: LOJA_ID, clienteId: null },
    select: { id: true, clienteNome: true, payload: true },
  })
  console.log(`\n📦 ${vendas.length} vendas sem clienteId encontradas`)

  let vinculadas = 0
  let porDocumento = 0
  let porTelefone = 0
  let semMatch = 0
  let erros = 0

  for (let i = 0; i < vendas.length; i += BATCH) {
    const lote = vendas.slice(i, i + BATCH)

    await Promise.all(
      lote.map(async (v) => {
        try {
          const enterprise = v.payload?.enterprise ?? null

          const docNorm = normalizeDigits(enterprise?.clienteDocument)
          const phoneNorm = normalizeDigits(enterprise?.clienteTelefone)

          let matchId = null
          let via = null

          if (docNorm.length >= 11 && docMap.has(docNorm)) {
            matchId = docMap.get(docNorm)
            via = "documento"
          } else if (phoneNorm.length >= 10 && phoneMap.has(phoneNorm)) {
            matchId = phoneMap.get(phoneNorm)
            via = "telefone"
          }

          if (matchId) {
            const cliente = clientes.find((c) => c.id === matchId)
            if (DRY_RUN) {
              console.log(`  [DRY] Venda ${v.id.slice(-8)} → Cliente "${cliente?.name}" via ${via}`)
            } else {
              await prisma.venda.update({
                where: { id: v.id },
                data: { clienteId: matchId },
              })
            }
            vinculadas++
            if (via === "documento") porDocumento++
            else porTelefone++
          } else {
            semMatch++
          }
        } catch (e) {
          console.error(`  ✖ Erro na venda ${v.id}:`, e.message)
          erros++
        }
      })
    )
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total de vendas processadas : ${vendas.length}
  Vinculadas                  : ${vinculadas}
    › por documento           : ${porDocumento}
    › por telefone            : ${porTelefone}
  Sem match (clienteId=null)  : ${semMatch}
  Erros                       : ${erros}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Nota: vendas GestaoClick importadas sem payload.enterprise
  ficam com clienteId=null — match por nome não é aplicado.
`)

  if (DRY_RUN) console.log("⚠️  DRY-RUN concluído — nenhuma alteração foi salva.")
  else if (vinculadas > 0) console.log("✅ Backfill concluído com sucesso.")
  else console.log("ℹ️  Nenhuma venda vinculável encontrada (esperado se não há payload.enterprise).")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
