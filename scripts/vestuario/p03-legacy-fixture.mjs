/** Só pelo preparador que já provou banco vazio + descartável, ANTES da migration P03. */
export async function seedP03LegacyFixture(PrismaClient, url) {
  const db = new PrismaClient({ datasourceUrl: url })
  try {
    await db.store.create({ data: { id: "p03-history", name: "Histórico sintético pré-P03", cnpj: "00.000.000/0000-00", phone: "0" } })
    await db.produto.createMany({ data: [
      { id: "p03-hist-a", storeId: "p03-history", name: "Legado A", sku: "HIST-COLLISION", stock: 7, price: 29.9, metadata: { codigosAlias: [" hist-alias ", "\talias-v\u00a0", 17, null], atributos: { cor: "Azul" } } },
      { id: "p03-hist-b", storeId: "p03-history", name: "Legado B", barcode: "HIST-COLLISION", stock: 3, price: 19.9, metadata: { codigosAlias: ["hist-alias"] } },
    ] })
    console.log("P03_LEGACY_FIXTURE_BEFORE_MIGRATION_OK (somente dados sintéticos)")
  } finally { await db.$disconnect() }
}
