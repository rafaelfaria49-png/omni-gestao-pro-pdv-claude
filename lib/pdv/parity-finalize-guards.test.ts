/**
 * N5-A F-04 — Contrato de finalização compartilhado por superfície.
 *
 * Fonte: audit A.2 #19/#20, §F-04, GAP-P2-06, D-04; motor N1
 * (`lib/pdv-finalize-integrity.ts`) já TESTED — aqui a prova é da BORDA.
 *
 * Prova por superfície oficial (leitura estática do componente):
 * 1. single finalize entry — exatamente um `await finalizeSaleTransaction(`;
 * 2. guard de linhas não resolvidas (`findUnresolvedSaleLines`) ANTES do motor;
 * 3. gap honesto — FAILED (`!result.ok`) tratado entre finalize e pending;
 * 4. pending honesto — guard único `if (result.pending) {` sai antes dos
 *    efeitos definitivos (prova completa por região vive em
 *    `pdv-pending-post-sale-effects.static.test.ts`; aqui se congela a presença);
 * 5. nenhum sucesso definitivo antes de confirmação — vocabulário N1
 *    (`postFinalizeDisposition`) declara CONFIRMED apenas com `{ok:true}` sem
 *    pendência, e retry idempotente emite exatamente uma vez.
 *
 * N5-B1 R2 (GAP-P2-06 CORRIGIDO): a máquina de estados do modal é o contrato
 * compartilhado `lib/pdv/finalize-modal-contract.ts` — fechamento durante o
 * voo é recusado, resultado explícito é exigido das 4 superfícies
 * (`requireExplicitResult`) e PENDING registra identidade estável. A prova
 * COMPORTAMENTAL vive em `parity-finalize-behavior.test.ts`; aqui ficam os
 * drift guards estáticos de wiring. O mutex `claimSaleFinalizeLock` continua
 * exclusivo da Venda Completa (as demais superfícies usam o busy-ref do
 * modal + gate de intenção — não há mutex novo por superfície).
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import ts from "typescript"
import { fixtureFor, OFFICIAL_SURFACE_FIXTURES } from "./parity-fixtures"
import {
  FINALIZE_CONFIRMED,
  FINALIZE_FAILED,
  FINALIZE_PENDING,
  PENDING_SALE_TITLE,
  createConfirmedSaleEmitter,
  postFinalizeDisposition,
} from "../pdv-finalize-integrity"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

const MODAL = "components/dashboard/vendas/payment-modal.tsx"

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

function nodes<T extends ts.Node>(root: ts.Node, matches: (node: ts.Node) => node is T): T[] {
  const found: T[] = []
  function visit(node: ts.Node) {
    if (matches(node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

/** Prova sintática, sem executar o componente: segue o argumento real da chamada
 * até o objeto no mesmo bloco. Comentários, strings e objetos de outro escopo
 * não satisfazem o contrato. Os demais drift guards permanecem independentes. */
function expectSharedFinalize(source: string) {
  const file = ts.createSourceFile("surface.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, types: [] }
  const checker = ts.createProgram([file.fileName], options, {
    ...ts.createCompilerHost(options),
    getSourceFile: (name) => name === file.fileName ? file : undefined,
    // O checker serve apenas para identidade lexical; não resolve dependências
    // do componente nem consulta o filesystem a cada mutação negativa.
    fileExists: () => false,
    readFile: () => undefined,
    directoryExists: () => false,
    getDirectories: () => [],
    getCurrentDirectory: () => "/",
    resolveModuleNames: (names) => names.map(() => undefined),
  }).getTypeChecker()
  const text = (node: ts.Node) => node.getText(file).replace(/\s+/g, "")
  const calls = nodes(file, ts.isCallExpression).filter((node) =>
    ts.isIdentifier(node.expression) && node.expression.text === "finalizeSaleTransaction",
  )
  assert.equal(calls.length, 1, "entrada única do motor")
  const call = calls[0]
  assert(ts.isAwaitExpression(call.parent), "motor aguardado com await")
  const result = call.parent.parent
  assert(ts.isVariableDeclaration(result) && text(result.name) === "result", "resultado real do motor")
  const statement = result.parent.parent
  assert(ts.isVariableStatement(statement) && ts.isBlock(statement.parent), "finalize no bloco do handler")
  const block = statement.parent
  const declarations = block.statements.filter(ts.isVariableStatement).flatMap((s) => [...s.declarationList.declarations])
  function localConst(name: string, before: number) {
    const matches = declarations.filter((d) => ts.isIdentifier(d.name) && d.name.text === name)
    assert.equal(matches.length, 1, `${name}: construção local única`)
    const declaration = matches[0]
    assert(declaration.end < before && (declaration.parent.flags & ts.NodeFlags.Const), `${name}: const anterior ao uso`)
    assert(declaration.initializer, `${name}: construção explícita`)
    return declaration
  }
  function property(object: ts.ObjectLiteralExpression, name: string, allowSpreads = false): ts.Expression {
    // Spreads poderiam sobrescrever silenciosamente linhas/total/pagamentos.
    assert(allowSpreads || !object.properties.some(ts.isSpreadAssignment), "payload sem sobrescrita por spread")
    const matches = object.properties.filter((p) => p.name && text(p.name) === name)
    assert.equal(matches.length, 1, `${name}: propriedade explícita única`)
    const prop = matches[0]
    assert(ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop), `${name}: valor de dados`)
    return ts.isPropertyAssignment(prop) ? prop.initializer : prop.name
  }
  const importsStore = file.statements.filter(ts.isImportDeclaration).some((node) =>
    ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/lib/operations-store" &&
    node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) &&
    node.importClause.namedBindings.elements.some((entry) => text(entry.name) === "useOperationsStore" && !entry.propertyName),
  )
  assert(importsStore, "hook do operations-store real")
  const bindings = nodes(file, ts.isBindingElement).filter((b) => text(b.name) === "finalizeSaleTransaction")
  assert.equal(bindings.length, 1, "motor obtido uma vez do store")
  const binding = bindings[0]
  const store = binding.parent.parent
  assert(ts.isObjectBindingPattern(binding.parent) && !binding.propertyName && ts.isVariableDeclaration(store), "binding do motor real")
  assert(store.initializer && text(store.initializer) === "useOperationsStore()", "origem do motor compartilhado")
  const scopes: ts.Node[] = []
  for (let node: ts.Node | undefined = call; node; node = node.parent) scopes.push(node)
  assert(scopes.includes(store.parent.parent.parent) && store.end < call.getStart(file), "store no escopo da chamada")
  assert(checker.getSymbolAtLocation(call.expression) === checker.getSymbolAtLocation(binding.name), "motor sem sombra local")

  assert.equal(call.arguments.length, 1, "um payload do motor")
  let payload = call.arguments[0]
  let input: ts.VariableDeclaration | undefined
  if (ts.isIdentifier(payload)) {
    input = localConst(payload.text, statement.getStart(file))
    assert(input.type && text(input.type) === "Parameters<typeoffinalizeSaleTransaction>[0]", "payload tipado pelo motor")
    const inputSymbol = checker.getSymbolAtLocation(input.name)
    // Sem escape, alias ou mutação entre a construção e o envio do objeto.
    assert(!nodes(block, ts.isIdentifier).some((node) => node.pos >= input!.end && node.end < call.getStart(file) &&
      checker.getSymbolAtLocation(node) === inputSymbol), "payload sem uso intermediário")
    payload = input.initializer!
  }
  assert(ts.isObjectLiteralExpression(payload), "payload construído como objeto")
  let lines = property(payload, "lines")
  if (ts.isIdentifier(lines)) lines = localConst(lines.text, payload.getStart(file)).initializer!
  assert(ts.isCallExpression(lines) && ts.isPropertyAccessExpression(lines.expression) &&
    text(lines.expression) === "cart.map", "linhas originadas do carrinho")
  const mapper = lines.arguments[0]
  assert(mapper && ts.isArrowFunction(mapper), "mapeamento explícito das linhas")
  let row = mapper.body
  if (ts.isParenthesizedExpression(row)) row = row.expression
  assert(ts.isObjectLiteralExpression(row), "payload de cada linha")
  const parameter = mapper.parameters[0]?.name
  assert(parameter && ts.isIdentifier(parameter), "identidade da linha mapeada")
  // Spreads opcionais das linhas são legítimos (serviço/avulso/acessórios).
  for (const [name, fields] of [
    ["inventoryId", ["inventoryId"]], ["quantity", ["quantity", "qty"]],
    ["unitPrice", ["price"]], ["name", ["name", "title"]],
  ] as const) {
    const value = property(row, name, true)
    assert(nodes(value, ts.isPropertyAccessExpression).some((access) =>
      (fields as readonly string[]).includes(access.name.text) &&
      checker.getSymbolAtLocation(access.expression) === checker.getSymbolAtLocation(parameter)), `${name}: origem na linha do carrinho`)
  }
  assert.equal(text(property(payload, "total")), "total", "total calculado da venda")
  let payments = property(payload, "paymentBreakdown")
  if (ts.isIdentifier(payments)) payments = localConst(payments.text, payload.getStart(file)).initializer!
  assert(ts.isObjectLiteralExpression(payments), "breakdown construído no handler")
  for (const name of ["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "aPrazo", "creditoVale"]) {
    assert.equal(text(property(payments, name)), name, `${name}: valor do pagamento`)
  }

  const unresolved = declarations.filter((d) => d.initializer && ts.isCallExpression(d.initializer) &&
    text(d.initializer.expression) === "findUnresolvedSaleLines")
  assert.equal(unresolved.length, 1, "validação unresolved no mesmo bloco")
  assert(unresolved[0].end < call.getStart(file), "unresolved antes do motor")
  const validation = unresolved[0].initializer as ts.CallExpression
  assert.equal(validation.arguments.length, 2, "unresolved recebe linhas e inventário")
  const checkedLines = validation.arguments[0]
  assert(ts.isCallExpression(checkedLines) && ts.isPropertyAccessExpression(checkedLines.expression) &&
    text(checkedLines.expression) === "cart.map" &&
    checker.getSymbolAtLocation(checkedLines.expression.expression) === checker.getSymbolAtLocation(lines.expression.expression),
  "unresolved valida o mesmo carrinho")
  const inventory = validation.arguments[1]
  assert(ts.isCallExpression(inventory) && text(inventory.expression) === "inventory.map", "unresolved recebe o inventário")
  const guards = block.statements.filter(ts.isIfStatement)
  function guard(condition: string, returnValue: string) {
    const matches = guards.filter((g) => text(g.expression) === condition)
    assert.equal(matches.length, 1, `${condition}: guard único no handler`)
    const found = matches[0]
    assert(ts.isBlock(found.thenStatement) && found.thenStatement.statements.some((s) =>
      ts.isReturnStatement(s) && s.expression && text(s.expression) === returnValue), `${condition}: saída explícita`)
    return found
  }
  const unresolvedGuard = guard(`${text(unresolved[0].name)}.length>0`, "false")
  assert(unresolvedGuard.getStart(file) > unresolved[0].end && unresolvedGuard.end < call.getStart(file), "bloqueio unresolved pré-motor")
  const failed = guard("!result.ok", "false")
  const pending = guard("result.pending", "true")
  assert(failed.getStart(file) > statement.end && pending.getStart(file) > failed.end, "FAILED e PENDING após o motor, em ordem")
  return { file, call, statement, payload, input, mapper, validation }
}

function expectFinalizeCompatibility(source: string, surfaceId: string) {
  const proof = expectSharedFinalize(source)
  // Exercita ambas as formas e suas negativas em memória, sem editar as
  // superfícies nem substituir o motor em testes comportamentais.
  const replace = (node: ts.Node, value: string) =>
    source.slice(0, node.getStart(proof.file)) + value + source.slice(node.end)
  let alternate: string
  if (proof.input) {
    alternate = replace(proof.call.arguments[0], proof.payload.getText(proof.file))
      .replace(proof.input.parent.parent.getText(proof.file), "")
  } else {
    const withReference = replace(proof.call.arguments[0], "finalizeInput")
    const start = proof.statement.getStart(proof.file)
    alternate = withReference.slice(0, start) +
      `const finalizeInput: Parameters<typeof finalizeSaleTransaction>[0] = ${proof.payload.getText(proof.file)};\n` +
      withReference.slice(start)
  }
  for (const variant of [source, alternate]) {
    const parsed = expectSharedFinalize(variant)
    const mutate = (node: ts.Node, value: string) =>
      variant.slice(0, node.getStart(parsed.file)) + value + variant.slice(node.end)
    expect(() => expectSharedFinalize(mutate(parsed.call, '{ ok: true } /* await finalizeSaleTransaction({}) */')),
      `${surfaceId}: chamada ausente, mesmo com comentário isca`).toThrow("entrada única do motor")
    expect(() => expectSharedFinalize(mutate(parsed.call.arguments[0], "{}")),
      `${surfaceId}: objeto alheio não substitui o payload real`).toThrow("lines: propriedade explícita única")
    expect(() => expectSharedFinalize(mutate(parsed.statement,
      `const finalizeSaleTransaction = async () => ({ok: true}); ${parsed.statement.getText(parsed.file)}`)),
    `${surfaceId}: motor local não substitui o store`).toThrow("motor sem sombra local")
    expect(() => expectSharedFinalize(mutate(parsed.mapper.body,
      '({inventoryId: "fake", quantity: 1, unitPrice: 1, name: "fake"})')),
    `${surfaceId}: nomes de propriedades não bastam como origem`).toThrow("inventoryId: origem na linha do carrinho")
    expect(() => expectSharedFinalize(mutate(parsed.validation.arguments[0], "[]")),
      `${surfaceId}: unresolved não pode validar lista vazia`).toThrow("unresolved valida o mesmo carrinho")
    for (const name of ["lines", "total", "paymentBreakdown"]) {
      const prop = parsed.payload.properties.find((p) => p.name?.getText(parsed.file) === name)!
      expect(() => expectSharedFinalize(mutate(prop.name!, `missing_${name}`)),
        `${surfaceId}: payload sem ${name}`).toThrow(`${name}: propriedade explícita única`)
    }
    const input = parsed.input
    if (input) {
      expect(() => expectSharedFinalize(mutate(input.type!, "unknown")),
        `${surfaceId}: objeto sem o tipo do motor`).toThrow("payload tipado pelo motor")
      expect(() => expectSharedFinalize(mutate(input.initializer!, "externalPayload")),
        `${surfaceId}: objeto não construído no handler`).toThrow("payload construído como objeto")
      expect(() => expectSharedFinalize(mutate(parsed.statement,
        `${input.name.getText(parsed.file)}.lines = []; ${parsed.statement.getText(parsed.file)}`)),
      `${surfaceId}: payload não pode mudar antes da chamada`).toThrow("payload sem uso intermediário")
    }
  }
}

describe("F-04 — single entry e guards de borda por superfície", () => {
  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: um ponto de finalize, guard unresolved antes, FAILED e PENDING honestos`, () => {
      const source = read(fixture.componentPath)

      // 1. Single finalize entry.
      const FINALIZE = "await finalizeSaleTransaction("
      const finalizeCount = source.split(FINALIZE).length - 1
      expect(finalizeCount, `${fixture.surfaceId}: entrada única do motor`).toBe(1)
      const finalizeIdx = source.indexOf(FINALIZE)

      // 2. Guard unresolved ANTES do motor (fail-closed por linhas fantasmas).
      const unresolvedIdx = source.indexOf("findUnresolvedSaleLines(")
      expect(unresolvedIdx, `${fixture.surfaceId}: guard unresolved presente`).toBeGreaterThan(-1)
      expect(unresolvedIdx, `${fixture.surfaceId}: unresolved antes do finalize`).toBeLessThan(finalizeIdx)

      // 3. Gap FAILED honesto.
      expect(source, `${fixture.surfaceId}: trata !result.ok`).toContain("!result.ok")

      // 4. Guard PENDING único após o finalize (prova de região no static N1).
      const GUARD = "if (result.pending) {"
      expect(source.split(GUARD).length - 1, `${fixture.surfaceId}: guard pending único`).toBe(1)
      const guardIdx = source.indexOf(GUARD)
      expect(guardIdx, `${fixture.surfaceId}: pending depois do finalize`).toBeGreaterThan(finalizeIdx)
      expectFinalizeCompatibility(source, fixture.surfaceId)
    })

    it(`${fixture.surfaceId}: venda confirmada registra audit sale_finalized (literal ou via motor)`, () => {
      const source = read(fixture.componentPath)
      if (fixture.surfaceId === "assistencia") {
        // Assistência delega o registro ao motor compartilhado via auditMeta
        // (GAP-P3-15 registra a divergência de formato — N5-A não muda).
        expect(source).toContain("auditMeta: {")
      } else {
        expect(source, `${fixture.surfaceId}: audit de venda finalizada`).toContain("sale_finalized")
      }
    })
  }

  it("GAP-P2-06 (R2): mutex claimSaleFinalizeLock continua exclusivo da Venda Completa", () => {
    const vc = read(fixtureFor("venda-completa").componentPath)
    expect(vc).toContain("claimSaleFinalizeLock(isProcessingRef)")
    expect(vc).toContain("releaseSaleFinalizeLock(isProcessingRef)")

    for (const surfaceId of ["classic", "assistencia", "supermercado"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(
        source,
        `${surfaceId}: sem mutex novo (busy da finalização vive no modal compartilhado)`,
      ).not.toContain("claimSaleFinalizeLock")
    }
  })

  it("GAP-P2-06 (R2): as 4 bordas exigem resultado explícito do modal (requireExplicitResult)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: requireExplicitResult no PaymentModal`).toContain(
        "requireExplicitResult",
      )
    }
  })

  it("GAP-P2-06 (R2): modal recusa fechamento durante o voo (contrato compartilhado importado)", () => {
    const modal = read(MODAL)
    expect(modal).toContain("refuseModalCloseWhileConfirming")
    expect(modal).toContain("resolveConfirmOutcome")
    expect(modal).toContain("attemptCloseWhileConfirming")
    // Busy síncrono cobre a janela entre o clique e o re-render.
    expect(modal).toContain("finalConfirmBusyRef.current")
  })

  it("GAP-P2-06 (R2): identidade PENDING registrada nas 4 bordas (guarda de reconfirmação)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: guard de identidade PENDING`).toContain(
        "pendingSaleIdentityRef",
      )
      expect(source, `${fixture.surfaceId}: registra identidade no PENDING`).toContain(
        "pendingSaleIdentityRef.current?.register(",
      )
    }
  })

  it("GAP-P2-06 (R2): Venda Completa: F1 respeita o mutex (isSaleFinalizeBusy)", () => {
    const vc = read(fixtureFor("venda-completa").componentPath)
    const f1Case = vc.slice(vc.indexOf('case "F1":'), vc.indexOf("case \"F2\":"))
    expect(f1Case).toContain("isSaleFinalizeBusy(isProcessingRef)")
  })
})

describe("F-04 — vocabulário N1 compartilhado (nenhum sucesso antes da confirmação)", () => {
  it("disposição CONFIRMED/PENDING/FAILED é inequívoca e compartilhada", () => {
    expect(postFinalizeDisposition({ ok: true })).toBe(FINALIZE_CONFIRMED)
    expect(postFinalizeDisposition({ ok: true, pending: true })).toBe(FINALIZE_PENDING)
    expect(postFinalizeDisposition({ ok: false })).toBe(FINALIZE_FAILED)
  })

  it("copy de PENDING é honesta (nunca promete venda concluída)", () => {
    expect(PENDING_SALE_TITLE).toContain("PENDENTE")
    const lowered = PENDING_SALE_TITLE.toLowerCase()
    expect(lowered).not.toContain("concluída")
    expect(lowered).not.toContain("finalizada")
  })

  it("retry idempotente: confirmação da MESMA identidade emite exatamente uma vez", () => {
    let emissions = 0
    const emitConfirmedSale = createConfirmedSaleEmitter(() => {
      emissions += 1
    })
    // Chave estável = clientSaleId (quando houver), senão id.
    const identity = { id: "sale-1", clientSaleId: "client-sale-1" }
    expect(emitConfirmedSale(identity), "1ª confirmação emite").toBe(true)
    expect(emitConfirmedSale(identity), "retry da mesma identidade não duplica").toBe(false)
    expect(emitConfirmedSale({ id: "sale-9", clientSaleId: "client-sale-1" }), "mesma chave estável não duplica").toBe(false)
    expect(emissions).toBe(1)
    expect(emitConfirmedSale({ id: "sale-2" }), "venda nova emite").toBe(true)
    expect(emissions).toBe(2)
  })

  it("todas as 4 bordas usam o mesmo motor (finalizeSaleTransaction do operations-store)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expectSharedFinalize(source)
    }
  })
})
