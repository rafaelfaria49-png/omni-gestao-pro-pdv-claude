/**
 * import-os-csv.mjs
 * Importação segura e idempotente de OS legadas (os_orig.csv) para Prisma.
 *
 * Uso:
 *   node scripts/import-os-csv.mjs          → dry-run (preview, sem insert)
 *   node scripts/import-os-csv.mjs --exec   → importação real
 */

import { PrismaClient } from '../generated/prisma/index.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--exec')
const STORE_ID = 'loja-1'
const CSV_PATH = join(__dirname, '..', 'os_orig.csv')

const prisma = new PrismaClient()

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseBrlFloat(s) {
  if (!s) return 0
  return parseFloat(s.trim().replace('.', '').replace(',', '.')) || 0
}

function normName(s) {
  return (s ?? '').trim().toUpperCase()
}

function mapStatus(situacao) {
  const s = normName(situacao)
  if (s === 'FINALIZADO') return { prisma: 'Entregue', operacaoStatus: 'entregue' }
  if (s === 'EM ANDAMENTO') return { prisma: 'EmAnalise', operacaoStatus: 'em_execucao' }
  if (s === 'PRONTO') return { prisma: 'Pronto', operacaoStatus: 'pronto' }
  return { prisma: 'Aberto', operacaoStatus: 'aberta' }
}

function makeCodigoOS(numero) {
  const n = String(numero).padStart(5, '0')
  return `OS-IMP-${n}`
}

/**
 * Resolve clienteId via cascade:
 * 1. exact name match (case-insensitive)
 * 2. DB name starts with CSV name
 * 3. CSV name starts with DB name
 * Returns { id, nome, telefone } | null
 */
function resolveCliente(csvNome, clienteMap) {
  const key = normName(csvNome)
  // 1. exact
  if (clienteMap.exact.has(key)) return clienteMap.exact.get(key)
  // 2. starts-with cascade
  for (const [dbName, rec] of clienteMap.all) {
    if (dbName.startsWith(key) || key.startsWith(dbName)) return rec
  }
  return null
}

// ─── parse CSV ────────────────────────────────────────────────────────────────

function parseCSV(path) {
  const raw = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').filter(l => l.trim())
  const [header, ...rows] = lines
  const cols = header.split(';').map(c => c.trim())

  return rows.map(line => {
    const vals = line.split(';')
    const obj = {}
    cols.forEach((col, i) => { obj[col] = (vals[i] ?? '').trim() })
    return obj
  })
}

// ─── build payload ────────────────────────────────────────────────────────────

function buildPayload({ id, codigo, numero, csvRow, clienteRec, statusMap, valor, now }) {
  const { Equipamento, Marca, Modelo, Defeitos, Solução: Solucao } = csvRow
  const clienteSnap = clienteRec
    ? { id: clienteRec.id, nome: clienteRec.nome, telefone: clienteRec.telefone ?? undefined }
    : { id: '', nome: normName(csvRow.Cliente) }

  return {
    id,
    codigo,
    storeId: STORE_ID,
    clienteId: clienteRec?.id ?? '',
    operacaoStatus: statusMap.operacaoStatus,
    status: statusMap.operacaoStatus,
    prioridade: 'media',
    origem: 'importacao',
    cliente: clienteSnap,
    equipamento: {
      id: `eq_${id}`,
      tipo: normName(Equipamento) || 'Celular',
      marca: normName(Marca),
      modelo: normName(Modelo),
      defeitoRelatado: normName(Defeitos),
      acessorios: '',
      numeroSerie: '',
    },
    servicosCatalogo: [
      {
        servicoId: `imp_${numero}`,
        descricao: normName(Solucao) || normName(Defeitos),
        valorVenda: valor,
        custoInterno: 0,
        prazoGarantiaDias: 90,
        termoGarantia: 'Garantia de 90 dias no serviço executado.',
      },
    ],
    pecas: [],
    observacoes: [],
    anexos: [],
    timeline: [
      {
        id: `ev_${id}`,
        tipo: 'criacao',
        autor: 'Importação CSV',
        autorTipo: 'sistema',
        conteudo: `OS importada da planilha legada (OS nº ${numero}).`,
        criadoEm: now,
      },
    ],
    garantia: { ativa: false },
    sla: {
      prazo: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      status: statusMap.prisma === 'Entregue' ? 'ok' : 'ok',
    },
    tags: ['importado'],
    criadoEm: now,
    atualizadoEm: now,
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  import-os-csv.mjs — modo: ${DRY_RUN ? '🔍 DRY-RUN (sem insert)' : '🚀 EXECUÇÃO REAL'}`)
  console.log(`${'='.repeat(60)}\n`)

  // 1. Load CSV
  const rows = parseCSV(CSV_PATH)
  console.log(`📄 CSV carregado: ${rows.length} linhas\n`)

  // 2. Load clientes from DB
  const dbClientes = await prisma.cliente.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, name: true, phone: true },
  })
  const clienteMap = {
    exact: new Map(dbClientes.map(c => [normName(c.name), { id: c.id, nome: c.name, telefone: c.phone }])),
    all: new Map(dbClientes.map(c => [normName(c.name), { id: c.id, nome: c.name, telefone: c.phone }])),
  }
  console.log(`👥 Clientes carregados do banco: ${dbClientes.length}\n`)

  // 3. Load existing OS (for upsert logic)
  const existingOS = await prisma.ordemServico.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, numero: true },
  })
  const existingMap = new Map(existingOS.map(o => [o.numero, o.id]))
  console.log(`📦 OS já existentes no banco: ${existingOS.length}\n`)

  // 4. Build import records
  const stats = { created: 0, updated: 0, noCliente: 0, errors: [] }
  const records = []

  for (const row of rows) {
    const numero = row['Nº da OS']
    const situacao = row['Situação']
    const valor = parseBrlFloat(row['Valor total'])
    const statusMap = mapStatus(situacao)
    const clienteRec = resolveCliente(row.Cliente, clienteMap)
    if (!clienteRec) stats.noCliente++

    const existingId = existingMap.get(numero)
    const id = existingId ?? randomUUID()
    const codigo = makeCodigoOS(numero)
    const now = new Date().toISOString()
    const equipStr = [row.Equipamento, row.Marca, row.Modelo].filter(Boolean).join(' ')

    const payload = buildPayload({ id, codigo, numero, csvRow: row, clienteRec, statusMap, valor, now })

    records.push({
      id,
      numero,
      codigo,
      clienteNome: row.Cliente,
      clienteId: clienteRec?.id ?? null,
      equipamento: equipStr,
      defeito: row.Defeitos,
      laudoTecnico: row['Solução'],
      valorTotal: valor,
      valorBase: valor,
      status: statusMap.prisma,
      payload,
      isUpdate: !!existingId,
    })
  }

  // 5. Preview (always shown)
  console.log('─'.repeat(60))
  console.log('PREVIEW — primeiras 5 OS a importar:')
  console.log('─'.repeat(60))
  for (const r of records.slice(0, 5)) {
    console.log(`  OS ${r.numero.padStart(3)} | ${r.clienteNome.padEnd(22)} | ${r.equipamento.padEnd(30)} | R$ ${r.valorTotal.toFixed(2).padStart(7)} | ${r.status} | cliente: ${r.clienteId ? '✅' : '❌ SEM MATCH'}`)
  }
  console.log()

  console.log('─'.repeat(60))
  console.log('Clientes SEM match no banco:')
  console.log('─'.repeat(60))
  const semMatch = records.filter(r => !r.clienteId)
  if (semMatch.length === 0) {
    console.log('  ✅ Todos os clientes foram encontrados!')
  } else {
    for (const r of semMatch) {
      console.log(`  ❌ OS ${r.numero} — "${r.clienteNome}" não encontrado no banco`)
    }
  }
  console.log()

  if (DRY_RUN) {
    console.log('─'.repeat(60))
    console.log('🔍 DRY-RUN: nenhum dado foi gravado.')
    console.log(`   Total que seria importado: ${records.length}`)
    console.log(`   Creates: ${records.filter(r => !r.isUpdate).length}`)
    console.log(`   Updates: ${records.filter(r => r.isUpdate).length}`)
    console.log(`   Sem cliente: ${stats.noCliente}`)
    console.log('   Execute com --exec para importar.')
    console.log('─'.repeat(60))
    return
  }

  // 6. Upsert
  console.log('─'.repeat(60))
  console.log('🚀 Iniciando upsert...')
  console.log('─'.repeat(60))

  for (const r of records) {
    try {
      if (r.isUpdate) {
        await prisma.ordemServico.update({
          where: { id: r.id },
          data: {
            clienteId: r.clienteId,
            equipamento: r.equipamento,
            defeito: r.defeito,
            laudoTecnico: r.laudoTecnico,
            valorTotal: r.valorTotal,
            valorBase: r.valorBase,
            status: r.status,
            payload: r.payload,
          },
        })
        stats.updated++
        console.log(`  ↺ UPDATE OS ${r.numero} — ${r.clienteNome}`)
      } else {
        await prisma.ordemServico.create({
          data: {
            id: r.id,
            storeId: STORE_ID,
            numero: r.numero,
            clienteId: r.clienteId,
            equipamento: r.equipamento,
            defeito: r.defeito,
            laudoTecnico: r.laudoTecnico,
            valorTotal: r.valorTotal,
            valorBase: r.valorBase,
            status: r.status,
            payload: r.payload,
          },
        })
        stats.created++
        console.log(`  ✅ CREATE OS ${r.numero} — ${r.clienteNome} | ${r.equipamento} | R$ ${r.valorTotal.toFixed(2)}`)
      }
    } catch (err) {
      stats.errors.push({ numero: r.numero, error: err.message })
      console.error(`  ❌ ERRO OS ${r.numero}: ${err.message}`)
    }
  }

  // 7. Final report
  console.log()
  console.log('='.repeat(60))
  console.log('RELATÓRIO FINAL')
  console.log('='.repeat(60))
  console.log(`  ✅ Criadas:         ${stats.created}`)
  console.log(`  ↺  Atualizadas:     ${stats.updated}`)
  console.log(`  ⚠️  Sem cliente:     ${stats.noCliente}`)
  console.log(`  ❌ Erros:           ${stats.errors.length}`)
  if (stats.errors.length > 0) {
    console.log('\nDetalhes dos erros:')
    stats.errors.forEach(e => console.log(`  OS ${e.numero}: ${e.error}`))
  }

  // 8. Validate count
  const totalFinal = await prisma.ordemServico.count({ where: { storeId: STORE_ID } })
  const byStatus = await prisma.ordemServico.groupBy({
    by: ['status'],
    where: { storeId: STORE_ID },
    _count: { id: true },
  })
  console.log(`\n📊 Total em ordemServico (storeId="${STORE_ID}"): ${totalFinal}`)
  console.log('   Por status:')
  byStatus.forEach(s => console.log(`     ${s.status}: ${s._count.id}`))
  console.log('='.repeat(60))
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
