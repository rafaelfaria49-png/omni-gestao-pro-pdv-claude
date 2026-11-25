/** Massa descartável. Chamado pelo runner canônico após o preflight/migrations e antes do app. */
export async function seedP03E2E(db, storeId, storeB) {
  await db.$transaction(async tx => {
    const grade = await tx.vestuarioGrade.create({ data: { storeId, nome: "Adulto P03 QA", nomeKey: "adulto p03 qa", createdBy: "qa-fixture" } })
    const preto = await tx.vestuarioCor.create({ data: { storeId, nome: "Preto P03", nomeKey: "preto p03", createdBy: "qa-fixture" } })
    const azul = await tx.vestuarioCor.create({ data: { storeId, nome: "Azul P03", nomeKey: "azul p03", createdBy: "qa-fixture" } })
    const p = await tx.produto.create({ data: { id: "p03-e2e-camiseta", storeId, name: "Camiseta Algodão P03", price: 49.9, stock: 0,
      metadata: { vestuario: { contract: "omni.vestuario.catalog", version: 1, mode: "COM_GRADE", gradeId: grade.id } } } })
    await tx.vestuarioProdutoGrade.create({ data: { storeId, produtoId: p.id, gradeId: grade.id, createdBy: "qa-fixture" } })
    for (const [ordem, rotulo] of ["P", "M", "G", "GG"].entries()) {
      const tamanho = await tx.vestuarioTamanho.create({ data: { storeId, gradeId: grade.id, rotulo, rotuloKey: rotulo.toLowerCase(), ordem } })
      for (const [cor, nome] of [[preto, "PRE"], [azul, "AZU"]]) await tx.vestuarioVariante.create({ data: {
        storeId, produtoId: p.id, gradeId: grade.id, corId: cor.id, tamanhoId: tamanho.id, sku: `P03-${nome}-${rotulo}`,
        ...(nome === "AZU" && rotulo === "GG" ? { barcodeInterno: "P03-CODIGO-ANTERIOR" } : {}), createdBy: "qa-fixture",
      } })
    }
  })
  await db.produto.create({ data: { storeId: storeB, name: "Produto isolado B P03", sku: "LEGADO-E2E", stock: 3, price: 25 } })
}
