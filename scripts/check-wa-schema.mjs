/**
 * Script diagnóstico: verifica schema real das tabelas WhatsApp no Supabase.
 * Executa: node scripts/check-wa-schema.mjs
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'whatsapp_conversations',
        'whatsapp_messages',
        'whatsapp_contacts',
        'whatsapp_automations',
        'whatsapp_quick_replies',
        'whatsapp_automation_logs'
      )
    ORDER BY table_name, ordinal_position
  `

  /** @type {Map<string, string[]>} */
  const byTable = new Map()
  for (const r of rows) {
    const t = r.table_name
    if (!byTable.has(t)) byTable.set(t, [])
    byTable.get(t).push(`  ${r.column_name} (${r.data_type}) nullable=${r.is_nullable}`)
  }

  for (const [table, cols] of byTable) {
    console.log(`\n=== ${table} ===`)
    cols.forEach((c) => console.log(c))
  }

  // Check for clienteId specifically
  const hasClienteId = rows.some(
    (r) => r.table_name === "whatsapp_conversations" && r.column_name === "clienteId"
  )
  console.log(`\n>>> clienteId in whatsapp_conversations: ${hasClienteId ? "✓ EXISTS" : "✗ MISSING"}`)

  // Check indexes
  const indexes = await prisma.$queryRaw`
    SELECT
      indexname,
      tablename,
      indexdef
    FROM pg_indexes
    WHERE tablename IN (
      'whatsapp_conversations',
      'whatsapp_messages'
    )
    ORDER BY tablename, indexname
  `
  console.log("\n=== INDEXES ===")
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`)
  }

  // Check FK constraints
  const fks = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name LIKE 'whatsapp%'
    ORDER BY tc.table_name, tc.constraint_name
  `
  console.log("\n=== FOREIGN KEYS ===")
  for (const fk of fks) {
    console.log(`  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table} (${fk.constraint_name})`)
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
