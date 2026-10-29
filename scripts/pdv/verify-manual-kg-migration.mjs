/** Executable old-client/RLS proof. This file refuses every nonlocal datasource. */
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { PrismaClient } from "../../generated/prisma/index.js"
const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
if (process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.MIGRATION_AUTHORITY_ENABLED !== "false") throw Error("DISPOSABLE_DATABASE_REQUIRED")
const db = new PrismaClient({ datasourceUrl: url }), evidence = { oldHead: "104d768d7b7497fe34e2872f4253c4fd97feb5bb", productionWrites: 0, checks: {} }
function check(name, value) { assert(value, name); evidence.checks[name] = true }
async function denied(name, fn) { let error; try { await fn() } catch (e) { error = e } check(name, !!error); return error.code ?? error.name }
const generation = ".local-kg/prisma-315"
await mkdir(generation, { recursive: true })
const original = spawnSync("git", ["show", evidence.oldHead + ":prisma/schema.prisma"], { encoding: "utf8", windowsHide: true })
assert.equal(original.status, 0)
let schema = original.stdout.replace(/(generator client \{[\s\S]*?output\s*=\s*)"[^"]+"/, '$1"./client"')
assert(schema.includes('output') && schema.includes('model ItemVenda'))
await writeFile(generation + "/schema.prisma", schema)
const generated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--schema", generation + "/schema.prisma"], { encoding: "utf8", env: process.env, windowsHide: true })
if (generated.status !== 0) throw Error("OLD_CLIENT_GENERATION_FAILED: " + generated.stderr.slice(-400))
const { PrismaClient: OldClient } = await import(pathToFileURL(path.resolve(generation + "/client/index.js")).href)
const old = new OldClient({ datasourceUrl: url })
try {
  const [identity] = await db.$queryRawUnsafe("SELECT current_database() db, current_user role, inet_server_port() port, host(inet_server_addr()) host")
  check("isolatedIdentity", identity.db === "manual_kg_sale_isolated" && identity.role === "manual_kg" && identity.port === 55479 && identity.host === "127.0.0.1")
  check("historicalMaxIntReadBy315", (await old.itemVenda.findUnique({ where: { id: "kg-historical-item" } })).quantidade === 2147483647)
  const un = await old.itemVenda.create({ data: { vendaId: "kg-historical-sale", nome: "UN client315", quantidade: 2 } })
  await old.itemVenda.update({ where: { id: un.id }, data: { quantidade: { increment: 1 } } })
  check("un315IncrementExact", (await db.itemVenda.findUnique({ where: { id: un.id } })).quantidade === 3)
  const store = await db.store.create({ data: { id: "kg-compat-probe", name: "Compatibility synthetic" } })
  const product = await db.produto.create({ data: { storeId: store.id, name: "KG synthetic", price: 20, stock: 10, metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } } })
  const sale = await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT set_config('omni.manual_kg_writer','additive-v2',true)")
    return tx.venda.create({ data: { storeId: store.id, pedidoId: "KG-COMPAT-PROBE", total: 7, at: new Date(), payload: { manualKgSale: "classic-manual-kg-v1" }, itens: { create: { inventoryId: product.id, nome: product.name, quantidade: null, quantidadeKg: "0.35", precoUnitario: 20, lineTotal: 7 } } }, include: { itens: true } })
  })
  evidence.requiredIntReadFailure = await denied("kg315RequiredIntFailsClosed", () => old.itemVenda.findUnique({ where: { id: sale.itens[0].id } }))
  check("kg315ReadFailureP2032", evidence.requiredIntReadFailure === "P2032")
  await db.$transaction(async (tx) => { await tx.$queryRawUnsafe("SELECT set_config('omni.manual_kg_writer','additive-v2',true)"); await tx.itemVenda.update({ where: { id: sale.itens[0].id }, data: { quantidadeKg: "1" } }) })
  await denied("integerKgAlsoFailsClosedFor315", () => old.itemVenda.findUnique({ where: { id: sale.itens[0].id } }))
  check("payloadOnlyQueriesRemainReadable", (await old.venda.findUnique({ where: { id: sale.id }, select: { total: true } })).total === 7)
  const aggregate = await old.itemVenda.aggregate({ where: { vendaId: sale.id }, _sum: { quantidade: true }, _count: true })
  check("legacyAggregateIgnoresKgAndMustBeDrained", aggregate._sum.quantidade === null && aggregate._count === 1)
  for (const [name, operation] of [
    ["oldPayloadRemovalBlocked", () => old.venda.update({ where: { id: sale.id }, data: { payload: {} } })],
    ["oldStatusBlocked", () => old.venda.update({ where: { id: sale.id }, data: { status: "cancelada" } })],
    ["oldDeleteCascadeBlocked", () => old.venda.delete({ where: { id: sale.id } })],
    ["oldItemDeleteBlocked", () => old.itemVenda.deleteMany({ where: { vendaId: sale.id } })],
    ["oldSaleLedgerBlocked", () => old.movimentacaoEstoque.create({ data: { storeId: store.id, produtoId: product.id, produtoNome: product.name, tipo: "entrada", origem: "cancelamento_pdv", documento: sale.pedidoId, quantidade: .35, estoqueAntes: 10, estoqueDepois: 10.35 } })],
    ["oldFinanceBlocked", () => old.movimentacaoFinanceira.create({ data: { storeId: store.id, tipo: "saida", origem: "cancelamento_pdv", referenciaId: sale.pedidoId, valor: 7 } })],
    ["oldSeparateTitleCreationBlocked", () => old.contaReceberTitulo.create({ data: { storeId: store.id, localKey: "pdv-aprazo-" + sale.pedidoId, valor: 7 } })],
    ["oldTitlePayloadReferenceBlocked", () => old.contaReceberTitulo.create({ data: { storeId: store.id, localKey: "CUSTOM-TITLE", valor: 7, payload: { vendas: [{ saleId: sale.pedidoId }] } } })],
    ["oldLinkedReturnBlocked", () => old.devolucaoVenda.create({ data: { storeId: store.id, localId: "DEV-KG-LINK", tipo: "somente_estoque", vendaLocalId: sale.pedidoId } })],
  ]) await denied(name, operation)
  const header = await old.devolucaoVenda.create({ data: { storeId: store.id, localId: "DEV-KG-NO-REFERENCE", tipo: "somente_estoque" } })
  for (const [label, metadata] of [["legacyRoot", { vendaPorPeso: true }], ["legacyAttribute", { atributos: { vendaPorPeso: true } }]]) {
    const legacy = await db.produto.create({ data: { storeId: store.id, name: label, stock: 10, metadata } })
    await denied("oldUnlinkedReturnBlocked_" + label, () => old.itemDevolucaoVenda.create({ data: { devolucaoId: header.id, inventoryId: legacy.id, quantidade: 1 } }))
  }
  await denied("oldUnlinkedKgReturnLineBlocked", () => old.itemDevolucaoVenda.create({ data: { devolucaoId: header.id, inventoryId: product.id, quantidade: 1 } }))
  await denied("oldTransactionalStockRollback", () => old.$transaction(async (tx) => {
    await tx.produto.update({ where: { id: product.id }, data: { stock: { increment: 1 } } })
    await tx.venda.update({ where: { id: sale.id }, data: { total: 1 } })
  }))
  check("stockUntouchedAfterBlockedWriter", (await db.produto.findUnique({ where: { id: product.id } })).stock === 10)
  check("noOrphanTitle", await db.contaReceberTitulo.count({ where: { storeId: store.id } }) === 0)
  for (const [label, quantity] of [["fourDecimals", "0.3501"], ["zero", "0"], ["negative", "-1"], ["overflow", "2000000000.001"]]) {
    await denied("checkRejects_" + label, () => db.$transaction(async (tx) => { await tx.$queryRawUnsafe("SELECT set_config('omni.manual_kg_writer','additive-v2',true)"); await tx.itemVenda.update({ where: { id: sale.itens[0].id }, data: { quantidadeKg: quantity } }) }))
  }
  await denied("checkRejectsBothNull", () => db.$transaction(async (tx) => { await tx.$queryRawUnsafe("SELECT set_config('omni.manual_kg_writer','additive-v2',true)"); await tx.itemVenda.update({ where: { id: sale.itens[0].id }, data: { quantidadeKg: null } }) }))
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE vendas (LIKE public.vendas)')
    const [answer] = await tx.$queryRawUnsafe('SELECT public.manual_kg_reference_protected($1,$2) protected', store.id, sale.pedidoId)
    check("tempShadowCannotHideProtectedSale", answer.protected === true)
  })
  const marker = await db.$queryRawUnsafe("SELECT current_setting('omni.manual_kg_writer',true) marker")
  check("transactionMarkerDoesNotLeak", marker[0].marker !== "additive-v2")
  const precondition = (await readFile("prisma/migrations/20261029120000_manual_kg_sale_quantity/migration.sql", "utf8")).match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)[0]
  let pilotError
  try { await db.$transaction(async (tx) => { await tx.$executeRawUnsafe('ALTER TABLE public.venda_itens ALTER COLUMN quantidade TYPE DOUBLE PRECISION USING quantidade::double precision'); await tx.$executeRawUnsafe(precondition) }) } catch (e) { pilotError = e }
  check("floatPilotRefusedWithoutTruncation", String(pilotError?.message).includes("KG_ADDITIVE_REQUIRES_LEGACY_INTEGER"))
  evidence.pilotError = "KG_ADDITIVE_REQUIRES_LEGACY_INTEGER"
  // RLS probe: the runtime cannot SELECT the sale; SECURITY DEFINER still prevents its economic write.
  let runtime
  try {
    await db.$executeRawUnsafe('CREATE ROLE kg_runtime_probe NOINHERIT LOGIN')
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO kg_runtime_probe')
    await db.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kg_runtime_probe')
    await db.$executeRawUnsafe('ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY')
    await db.$executeRawUnsafe('CREATE POLICY kg_probe_hide ON public.vendas FOR ALL TO kg_runtime_probe USING (false) WITH CHECK (false)')
    runtime = new OldClient({ datasourceUrl: url.replace('manual_kg@', 'kg_runtime_probe@') })
    check("rlsProbeReallyHidesSale", await runtime.venda.findUnique({ where: { id: sale.id } }) === null)
    await denied("rlsHiddenSaleStillBlocksEconomicWriter", () => runtime.movimentacaoFinanceira.create({ data: { storeId: store.id, origem: "venda", referenciaId: sale.pedidoId, valor: 7 } }))
  } finally {
    await runtime?.$disconnect()
    await db.$executeRawUnsafe('DROP POLICY IF EXISTS kg_probe_hide ON public.vendas')
    await db.$executeRawUnsafe('ALTER TABLE public.vendas DISABLE ROW LEVEL SECURITY')
    await db.$executeRawUnsafe('DROP OWNED BY kg_runtime_probe')
    await db.$executeRawUnsafe('DROP ROLE kg_runtime_probe')
  }
  await db.$executeRawUnsafe('CREATE SCHEMA kg_unsafe_float_probe')
  let unsafe
  try {
    await db.$executeRawUnsafe('CREATE TABLE kg_unsafe_float_probe.venda_itens (id text PRIMARY KEY, "vendaId" text, "inventoryId" text, nome text DEFAULT \'\', quantidade DOUBLE PRECISION NOT NULL DEFAULT 1, "precoUnitario" DOUBLE PRECISION DEFAULT 0, "lineTotal" DOUBLE PRECISION DEFAULT 0)')
    unsafe = new OldClient({ datasourceUrl: url + '?schema=kg_unsafe_float_probe' })
    let failure
    try { await unsafe.itemVenda.create({ data: { id: "unsafe", vendaId: "synthetic", quantidade: 13 } }) } catch (e) { failure = e.code }
    const rows = await db.$queryRawUnsafe('SELECT quantidade::text value FROM kg_unsafe_float_probe.venda_itens WHERE id=\'unsafe\'')
    evidence.unsafeFloatWrite = { failure: failure ?? null, actual: rows[0]?.value ?? null }
    check("oldIntWriterUnsafeAgainstFloat", !!failure || rows[0]?.value !== "13")
  } finally { await unsafe?.$disconnect(); await db.$executeRawUnsafe('DROP SCHEMA kg_unsafe_float_probe CASCADE') }
  check("quantityOidStillInt4", (await db.$queryRawUnsafe("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='venda_itens' AND column_name='quantidade'"))[0].data_type === "integer")
  await writeFile("test-results/manual-kg/migration-compatibility.json", JSON.stringify(evidence, null, 2))
  process.stdout.write("Migration / Prisma315 / RLS compatibility: " + Object.keys(evidence.checks).length + " checks PASS\n")
} finally { await old.$disconnect(); await db.$disconnect() }
