# Reprodução diagnóstica rev5

Data: 20/10/2026 (America/Sao_Paulo). Autorização: `PDV-N5-C-REV5-REGRESSION-REOPEN-006`.
Somente diagnóstico; nenhuma correção de produção ou dos testes herdados aplicada.

## Checkouts e comandos executados

Base detached: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-rev5-base-diagnostic`, SHA `16c496ad2ffe56fc6a89de237b204842494b8cbb`.
Candidato detached: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-rev5-candidate-diagnostic`, SHA `cdda74979e6008e5391a9defe6af1efdca6b7e4e`.
Worktree original preservada: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`, HEAD `01b9c0e94dc3867744b54764ee2d36620e10769d`.

O runner abaixo foi salvo fora do repositório, na raiz de visualização desta sessão. Os três comandos completos, SHAs, contagens, casos e hashes dos relatórios JSON brutos estão em [diagnostic-results.json](diagnostic-results.json). Os relatórios brutos e logs permanecem na mesma raiz de visualização, nomes `base.json`, `candidate.json`, `remount.json` e respectivos `.log`.

Node `v24.14.1`; Vitest `4.1.4`; dependências já instaladas, sem instalação ou postinstall. O runner importa a configuração canônica de cada checkout e só altera root/envDir/cacheDir e opções de relatórios, cache e paralelismo. Os aliases e ambientes originais são preservados, inclusive jsdom definido pelo cabeçalho do teste. Root/envDir não têm credenciais. Ambiente do processo filho reduzido; URLs de banco inertes em loopback. Nenhum cliente Prisma gerado ou writer produtivo executado. Os testes isolam todos os transportes; SyntheticBackend recusa requests não previstos. Sem E2E nesta sessão.

```javascript
import fs from "node:fs"
import path from "node:path"
import { spawnSync, execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const outputRoot = path.dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
const checkout = path.resolve(process.argv[3])
const files = process.argv.slice(4)
if (!label || !files.length) throw new Error("Missing diagnostic label or test paths")
if (fs.readdirSync(checkout).some((name) => /^\.env(?:$|\.(?:local|test|development|production)(?:\.|$))/.test(name))) throw new Error("Unexpected environment file in isolated checkout")
const report = path.join(outputRoot, `${label}.json`)
const config = path.join(outputRoot, `${label}.config.mjs`)
fs.writeFileSync(config, `import original from ${JSON.stringify(pathToFileURL(path.join(checkout, "vitest.config.ts")).href)}\nexport default {...original, root:${JSON.stringify(checkout)}, envDir:${JSON.stringify(outputRoot)}, cacheDir:${JSON.stringify(path.join(outputRoot, `cache-${label}`))}, test:{...original.test, cache:false, fileParallelism:false, reporters:["json"], outputFile:${JSON.stringify(report)}}}\n`)
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"].includes(key.toUpperCase())))
Object.assign(environment, { NODE_ENV: "test", CI: "1", NO_COLOR: "1", DATABASE_URL: "postgresql://isolated:isolated@127.0.0.1:1/diagnostic", DIRECT_URL: "postgresql://isolated:isolated@127.0.0.1:1/diagnostic" })
const argumentsList = ["C:/Projetos/omni-gestao/node_modules/vitest/vitest.mjs", "run", ...files, "--root", checkout, "--config", config, "--configLoader", "runner", "--no-cache", "--no-file-parallelism"]
const outcome = spawnSync(process.execPath, argumentsList, { cwd: checkout, env: environment, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 })
fs.writeFileSync(path.join(outputRoot, `${label}.log`), outcome.stdout + outcome.stderr)
if (!fs.existsSync(report)) {
  console.log(outcome.stdout + outcome.stderr)
  process.exit(outcome.status ?? 1)
}
const result = JSON.parse(fs.readFileSync(report, "utf8"))
const summary = {
  label,
  checkout,
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim(),
  command: [process.execPath, ...argumentsList],
  node: process.version,
  exitCode: outcome.status,
  passed: result.numPassedTests,
  failed: result.numFailedTests,
  pending: result.numPendingTests,
  tests: result.testResults.flatMap((suite) => suite.assertionResults.map((assertion) => ({
    file: path.relative(checkout, suite.name).replaceAll("\\", "/"),
    name: assertion.fullName,
    status: assertion.status,
    error: assertion.failureMessages?.[0]?.replaceAll(/\u001b\[[0-9;]*m/g, "").slice(0, 2200) ?? null,
  }))),
}
fs.writeFileSync(path.join(outputRoot, `${label}.summary.json`), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify({ ...summary, tests: summary.tests.filter((test) => test.status !== "passed") }, null, 2))
process.exit(outcome.status ?? 1)
```

Exemplo de configuração gerada para a base:

```javascript
import original from "file:///C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-rev5-base-diagnostic/vitest.config.ts"
export default {...original, root:"C:\\Projetos\\omni-gestao\\.worktrees\\pdv-n5-c-rev5-base-diagnostic", envDir:"C:\\Users\\rafae\\.codex\\visualizations\\2026\\10\\21\\01a15c4e-4445-7152-93fe-1191d53aa632", cacheDir:"C:\\Users\\rafae\\.codex\\visualizations\\2026\\10\\21\\01a15c4e-4445-7152-93fe-1191d53aa632\\cache-base", test:{...original.test, cache:false, fileParallelism:false, reporters:["json"], outputFile:"C:\\Users\\rafae\\.codex\\visualizations\\2026\\10\\21\\01a15c4e-4445-7152-93fe-1191d53aa632\\base.json"}}
```

## Extensão RED temporária da Assistência

Aplicada exclusivamente ao teste já autorizado no checkout detached do candidato, depois de reproduzir as duas suítes herdadas sem editá-las. Os cinco testes existentes ficam intactos. Nenhum componente/handler/provider/PaymentModal/retry/audit-log real é substituído; os transportes e providers periféricos usam o harness sintético existente.

O provider continua montado enquanto a superfície é trocada por um consumidor neutro. O retry real confirma antes do retorno à superfície. Antes da asserção que falha, foram comprovados dois POSTs da mesma clientSaleId, uma venda canônica CONFIRMED, total 190 e draft alterado. Resultado: 5 PASS, 1 FAIL, zero skip; esperado um sale_finalized, observado zero. Asserções posteriores ao waitFor falho são NOT_REACHED; não comprovam deduplicação ou payload após correção.

```diff
diff --git a/lib/pdv/parity-assistencia-finalize-audit.component.test.ts b/lib/pdv/parity-assistencia-finalize-audit.component.test.ts
index 5114c9a..7287d56 100644
--- a/lib/pdv/parity-assistencia-finalize-audit.component.test.ts
+++ b/lib/pdv/parity-assistencia-finalize-audit.component.test.ts
@@ -137,4 +137,48 @@ describe("N5-C Assistência — motor, handler e log reais", () => {
     expect(backend.posts).toHaveLength(1)
     expect(finalized()).toHaveLength(1)
   })
+  it("REV5 diagnóstico: retry confirma com Assistência desmontada e remount audita o snapshot uma vez", async () => {
+    function ProviderProbe() {
+      runtime.ops = useOperationsStore()
+      return null
+    }
+    const tree = (showSurface: boolean) => createElement(
+      OperationsProvider,
+      { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>,
+      createElement(showSurface ? App : ProviderProbe),
+    )
+    backend.failWrites = true
+    const view = render(tree(true))
+    await waitFor(() => expect(runtime.payment?.total).toBe(190))
+    await act(async () => {})
+    expect(await confirm()).toBe(true)
+    const identity = runtime.ops!.sales[0].clientSaleId!
+    expect(finalized()).toHaveLength(0)
+    view.rerender(tree(false))
+    backend.failWrites = false
+    await act(async () => {
+      expect(await runtime.ops!.retrySyncSale(identity)).toEqual({ ok: true })
+    })
+    expect(runtime.ops!.sales).toHaveLength(1)
+    expect(runtime.ops!.sales[0]).toMatchObject({
+      id: "VDA-N5C-1", clientSaleId: identity, syncPending: false, total: 190,
+    })
+    expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
+    expect(finalized()).toHaveLength(0)
+    const key = `omnigestao:pdv-assistencia-cart:${STORE}`
+    const draft = JSON.parse(localStorage.getItem(key)!)
+    draft.cart[0].price = 999
+    localStorage.setItem(key, JSON.stringify(draft))
+    view.rerender(tree(true))
+    await waitFor(() => expect(runtime.payment!.total).toBeGreaterThan(190))
+    await waitFor(() => expect(finalized()).toHaveLength(1))
+    expect(finalized()[0].detail).toContain(`Venda VDA-N5C-1 | Loja ${STORE} | Total `)
+    expect(finalized()[0].detail).toContain("190,00")
+    expect(finalized()[0].detail).not.toContain("999")
+    view.rerender(tree(false))
+    view.rerender(tree(true))
+    await act(async () => { expect((await runtime.ops!.retrySyncSale(identity)).ok).toBe(false) })
+    expect(finalized()).toHaveLength(1)
+    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
+  })
 })
```

Após merge humano, a implementação rev5 deverá incorporar a reprodução à suíte real, corrigir apenas os paths autorizados e obter nova execução verde. Esta evidência não implementa nem aceita o corretivo.
