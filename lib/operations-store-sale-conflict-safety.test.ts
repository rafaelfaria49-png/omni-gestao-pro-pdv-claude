/**
 * Contrato estático do cliente PDV para conflitos permanentes de identidade.
 *
 * O helper puro cobre a política; este teste garante que as superfícies que disparam
 * efeitos realmente consultem essa política antes de qualquer persist/ação destrutiva.
 *
 * Arquitetura atual (Writer V2 / quarentena):
 * - auto-retry e reenvio passam por `persistPendingSale` (não por `fetch(vendaPersistUrl)` direto);
 * - conflito vira quarentena e só sai com evidência server-side: recovery administrado
 *   (`recoverQuarantinedSale`/lote) ou reconciliação automática pela rota própria;
 * - o ocupante remoto não é sobrescrito nem troca de número automaticamente.
 */
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = resolve(__dirname, "..")

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8")
}

// Cada asserção lê a declaração que implementa a operação. Inserir, remover ou
// reordenar outras operações do provider não muda o escopo analisado.
function operationsCallbacks(source: string) {
  const ast = ts.createSourceFile("operations-store.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const provider = ast.statements.filter(ts.isFunctionDeclaration).find((node) => node.name?.text === "OperationsProvider")
  if (!provider?.body) throw new Error("OperationsProvider não encontrado")

  const declarations = provider.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])

  return (name: string): string => {
    const matches = declarations.filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name)
    expect(matches, `declaração de ${name} no OperationsProvider`).toHaveLength(1)
    const initializer = matches[0]?.initializer
    if (!initializer) throw new Error(`Inicializador de ${name} não encontrado`)
    return initializer.getText(ast)
  }
}

describe("PDV-V1-ATOMIC-REPLAY-CONFLICT-HARDEN-001 — quarentena client-side", () => {
  const store = read("lib/operations-store.tsx")
  const archive = read("components/dashboard/vendas/vendas-arquivo-geral.tsx")
  const operation = operationsCallbacks(store)

  const persistPending = operation("persistPendingSale")
  const flush = operation("flushPendingSales")
  const retry = operation("doRetrySyncSale")
  const recoverIndividual = operation("recoverQuarantinedSale")
  const recover = [
    recoverIndividual,
    operation("collectQuarantinedCandidates"),
    operation("reconcileRecoveredSales"),
    operation("previewQuarantineRecovery"),
    operation("recoverQuarantinedSalesBatch"),
    operation("autoReconcileQuarantinedSales"),
    operation("refreshInventoryFromServer"),
  ].join("\n")
  const individual = operation("discardLocalPendingSale")
  const bulk = operation("bulkDiscardLocalPendingSales")

  it("auto-retry ignora o conflito antes do persist e não recupera sozinho", () => {
    const conflictGate = flush.indexOf("persistedSaleIdentityConflictCode(storageKey, sale)")
    const persist = flush.indexOf("persistPendingSale(")
    expect(conflictGate).toBeGreaterThanOrEqual(0)
    expect(persist).toBeGreaterThan(conflictGate)
    expect(flush).toMatch(
      /persistedSaleIdentityConflictCode\(storageKey, sale\)\)\s+continue[\s\S]*persistPendingSale\(/,
    )
    expect(flush).not.toContain("recoverQuarantinedSale")
    expect(flush).not.toContain("recoverQuarantinedSaleUrl")
  })

  it("reenvio manual e retroativo compartilham o bloqueio anterior ao persist", () => {
    const conflictGate = retry.indexOf("persistedSaleIdentityConflictCode(storageKey, sale)")
    const persist = retry.indexOf("persistPendingSale(")
    expect(conflictGate).toBeGreaterThanOrEqual(0)
    expect(persist).toBeGreaterThan(conflictGate)
    expect(retry).toContain("SALE_IDENTITY_CONFLICT_TITLE")
    expect(retry).toContain("SALE_IDENTITY_CONFLICT_GUIDANCE")
    expect(retry).not.toContain("recoverQuarantinedSaleUrl")

    expect(operation("retrySyncSale")).toContain("doRetrySyncSale(saleId, false)")
    expect(operation("retrySyncSaleRetroactive")).toContain("doRetrySyncSale(saleId, true)")
  })

  it("descarte individual e em lote preservam conflitos sem consultar o servidor", () => {
    const conflictGate = individual.indexOf("persistedSaleIdentityConflictCode(storageKey, sale)")
    expect(conflictGate).toBeGreaterThanOrEqual(0)
    expect(individual.indexOf("fetch(")).toBeGreaterThan(conflictGate)
    expect(individual).toContain("SALE_IDENTITY_CONFLICT_TITLE")
    expect(individual).toContain("SALE_IDENTITY_CONFLICT_GUIDANCE")
    expect(individual).not.toContain("recoverQuarantinedSaleUrl")

    expect(bulk).toMatch(
      /persistedSaleIdentityConflictCode\(storageKey, sale\)\)\s*\{[\s\S]*conflicts \+= 1[\s\S]*continue[\s\S]*fetch\(`\/api\/vendas\//,
    )
  })

  it("a UI condiciona reenvio, retroativo e descarte à política de quarentena", () => {
    expect(archive).toContain("pendingSaleSyncActions.canManualRetry &&")
    expect(archive).toContain("pendingSaleSyncActions.canRetroactiveRetry &&")
    expect(archive).toContain("pendingSaleSyncActions.canDiscard &&")
    expect(archive).toContain("saleSyncActionsForCode")
    expect(archive).toContain("LOCAL_QUARANTINED")
    expect(archive).toContain("REMOTE_CONFIRMED")
    expect(archive).toContain("LOCAL_PENDING")
    expect(archive).toContain("O número desta venda já estava em uso. Seus dados foram preservados e nenhuma venda existente foi")
    expect(archive).toContain("A venda antiga permanece intacta")
    expect(archive).toContain("nunca altera a venda que já ocupa o número conflitante")
    expect(archive).not.toContain("A venda será regravada com um número novo")
    expect(archive).not.toContain("predictedNovaVendaId")
  })

  it("recovery administrado é o único caminho que chama recoverQuarantinedSale", () => {
    expect(persistPending).toContain("postV2Sale")
    expect(persistPending).toContain("postV1Sale")
    expect(persistPending).not.toContain("recoverQuarantinedSaleUrl")
    expect(persistPending).not.toContain("predictedNovaVendaId")

    expect(recover).toContain("recoverQuarantinedSaleUrl")
    expect(recover).toContain("isSaleIdentityConflictCode")
    expect(recover).toContain("conflictingPedidoId")
    expect(recover).not.toContain("persistPendingSale(")

    expect(archive).toContain("openRecoverDialog")
    expect(archive).toContain("recoverQuarantinedSale")
    expect(archive).toContain("Recuperar venda")
    expect(archive).toContain("Venda precisa de recuperação")
  })

  it("recovery individual reconcilia só por clientSaleId — nunca pelo VDA antigo", () => {
    expect(recoverIndividual).toContain("buildIndividualRecoveryConfirmations")
    expect(recoverIndividual).toContain("applyRecoveryConfirmations")
    expect(recoverIndividual).not.toContain("markSaleConfirmed")
    expect(recoverIndividual).not.toContain("saleMatches(s, token)")
  })

  it("botão individual fica indisponível com Writer V1 e abre com Writer V2", () => {
    expect(archive).toContain("canStartIndividualQuarantineRecovery")
    expect(archive).toContain("probeSaleWriterCapability")
    expect(archive).toContain("INDIVIDUAL_QUARANTINE_RECOVERY_UNAVAILABLE")
    expect(archive).toContain("disabled={!individualRecoveryEnabled}")
    expect(archive).toContain("openRecoverDialog")
    expect(archive).toMatch(/if \(!canStartIndividualQuarantineRecovery\(writerEnabled\)\) return/)
  })

  it("reconciliação automática usa a rota própria — nunca o reenvio comum", () => {
    const auto = operation("autoReconcileQuarantinedSales")
    expect(auto).toContain("quarantineAutoReconcileUrl")
    expect(auto).toContain("selectAutoReconcileCandidates")
    expect(auto).toContain("persistedClientSaleIds(storageKey)")
    expect(auto).toContain("deriveLegacySaleClientSaleId")
    expect(auto).toContain("buildRecoveryConfirmations")
    expect(auto).not.toContain("persistPendingSale(")
    expect(auto).not.toContain("vendaPersistV2Url")
    expect(auto).not.toContain("generateClientSaleId")
    // Roda no bootstrap e no ciclo de wake (online/foco/30s), ao lado dos demais flushes.
    expect(store.match(/flushPendingCaixaOperations\(\)\s+void autoReconcileQuarantinedSales\(\)/g)).toHaveLength(2)
  })

  it("verificação em lote nunca descarta venda ausente no servidor", () => {
    expect(bulk).not.toContain("discardedIds")
    expect(bulk).toMatch(/res\.status === 404\)\s*\{[\s\S]*kept \+= 1/)
    expect(archive).not.toContain("Não existe → descarta apenas o registro local.")
  })
})
