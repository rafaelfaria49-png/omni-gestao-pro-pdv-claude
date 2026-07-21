# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Merge-readiness do reparo do fixture positivo

**Data:** 2026-07-20 · **Auditoria (read-only):** commit `ce8b7b4` vs `origin/main` atual
**Branch de auditoria:** `audit/fiscal-dry-run-005b-positive-fixture-readiness` (base `ce8b7b4`)

## Classificação: **A (PR direto seguro)** — e **A2** também vale (reaplicação limpa sobre a main atual)

O reparo do fixture positivo é seguro para PR direto e para novo dispatch H3. A main avançou 1 commit
(Contador/Prisma) sem **nenhuma** interseção de arquivos com o fix; a simulação de merge é
**conflict-free**, então o PR fecha por 3-way merge limpo **sem rebase** (A2 satisfeito). Nenhuma
correção material (C) nem ajuste (B) é necessário; nada bloqueia (não é D).

## Referências

| Item | Valor |
|---|---|
| origin/main auditada | `2d808c442428f41bc1417917421ac8b6c29ab6e6` ("feat(contador): criar schema nucleo do dominio contador") |
| Commit auditado | `ce8b7b4725a6d72c3a0fed97edbcb041b1b713ae` ("fix(fiscal): corrigir fixture positivo do dry-run 005B") |
| Branch do fix | `origin/fix/fiscal-dry-run-005b-positive-fixture` (= `ce8b7b4`) |
| Run original com falha | `29791958304` (Gate H3, `Failure`) |

## Topologia Git

- **merge-base(`ce8b7b4`, `origin/main`) = `7e92194`** (o merge do PR #16).
- **ahead/behind:** `ce8b7b4` está **1 à frente / 1 atrás** de `origin/main` (divergência clássica a
  partir de `7e92194`).
- Commit exclusivo do fix: `ce8b7b4`. Commit exclusivo da main: `2d808c4` (Contador).
- **Interseção de arquivos entre os dois change-sets: VAZIA.**
  - Fix (`7e92194..ce8b7b4`): `tools/fiscal-dry-run-integrity-proof/{fixtures.ts, proof.ts, proof.test.ts, matrix.test.ts, evidence/manifest.json}` + `docs/fiscal/…REPAIR.md`.
  - Main (`7e92194..2d808c4`): `prisma/schema.prisma`, `prisma/migrations/0014_contador_hub_nucleo/migration.sql`, `lib/contador/db/competencia.ts`, `lib/contador/__tests__/db-competencia.test.ts`.
- **`git merge-tree --write-tree origin/main ce8b7b4` → exit 0, árvore limpa `81ac71e…`, zero conflitos.**

### Impacto do avanço da main (Contador/Prisma)
**Nulo sobre o fix.** O avanço `2d808c4` mexe só em Prisma/schema + domínio Contador — domínios
ortogonais ao harness fiscal (`tools/fiscal-dry-run-integrity-proof`). Sem arquivo compartilhado, sem
conflito de merge, sem dependência cruzada. O fix não toca Prisma/Contador; o Contador não toca o
harness.

## Revisão dos 6 arquivos do fix

| Verificação | Resultado |
|---|---|
| Única causa raiz = `verProc` > 20 | ✅ diff só altera `versaoAplicativo` (fixtures.ts); nenhuma outra mudança de dado |
| Nova string com 18 chars | ✅ `"OmniGestaoProof005"` (18 ≤ 20); const `VER_PROC_MAX_LENGTH = 20` documenta o facet |
| Builder compartilhado não alterado | ✅ `nfce-xml-builder.ts` intocado (não está no diff) |
| XSD / worker / lock intocados | ✅ `lib/fiscal/xsd/schemas/**`, `workers/fiscal-xsd/**`, `supply-chain.lock.json` fora do diff |
| Fixture continua sintético | ✅ valor sintético, sem CNPJ/IE/dado real; `assertSyntheticSafety` verde (P-15) |
| Diagnóstico do xmllint preservado | ✅ registrado no REPAIR.md; `matrix.test.ts` passa a exibir `xsdDiagnostics` normalizados |
| Regressão P-16 trava a causa | ✅ extrai `<verProc>` do XML gerado e da fonte (`syntheticXmlContext`); falha se qualquer um exceder 20 |

`proof.ts`: acréscimo **aditivo** de `xsdDiagnostics: readonly string[]` no resultado — não altera
manifesto (não é serializado por `buildManifestFromProof`) nem lógica de veredito.

## Hashes e golden

`verProc` pertence a `infNFe`; muda todo o fluxo XML, **exceto** `snapshotSha256` (o snapshot não
carrega `verProc`). `chaveAcesso`/`referenciaId` também invariantes. Os valores da golden
(`evidence/manifest.json`) e os hardcoded do teste (`proof.test.ts` · XSD-H16) são **mutuamente
consistentes**.

| Hash | Antigo | Novo (golden = XSD-H16) |
|---|---|---|
| snapshotSha256 | `efd6f54c…bae2e` | **igual (invariante)** |
| unsignedXmlSha256 | `5773978…d488` | `ca8adf9772fde2723d7e173511ae48b43a60103ef1b80412ba2e40418e91533f` |
| referencedNodeC14nSha256 | `5126ad4…33f7` | `5b2914270bb0363ad2ba61b3ac59af8f300bdac27d6faef2d40e0aa71b6cbe34` |
| signedInfoSha256 | `449cc74…1b69` | `aa1d73a8c58f9bb1b6da172984579652120230cbe0ebcf2e1548a12603ce97b4` |
| signedXmlSha256 | `d9a3eea…84a2` | `da650b7053e1c7462780c43d248890b6da6c45c4f077408975e9f91acf43ccb9` |
| digestValue | `C2JM/I4Y6H7n1G7YopYEiVLuASw=` | `5U16o3plF2m+5in/+7nm4Zq9ZmM=` |

**Re-verificação independente (regeneração a partir de `ce8b7b4`):** o XML positivo regenerado produz
exatamente esses hashes **e** valida no motor real libxml2/`xmllint` (via `xmllint-wasm`, mesmos XSDs de
`lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/`): `verProc="OmniGestaoProof005"` (len 18) → **`input.xml
validates`**. Ou seja, a golden não é só auto-consistente: corresponde a um XML de fato conforme ao XSD.

## Manifesto — segue PARCIAL

Golden regenerado pelo caminho oficial local (composition-gate). Estado no `ce8b7b4`:

- `proofState = "partial"` ✅
- `verification.xsd = false` ✅
- `verification.xsdWorkerReal = false` ✅
- `blockingReasons = ["XSD_WORKER_REAL_UNAVAILABLE"]` ✅
- `verification.xsdEngineName = "composition-gate"` · `verification.xsdContract = true` · `xsdStatus = "composition-gate"` ✅

**Nenhuma elevação H4 antecipada.** O diff do manifesto altera **apenas** hashes + `digestValue`; todo
o bloco de estado/`verification` (partial, xsd:false, worker:false) é idêntico ao golden anterior.

## Negativos e segurança do `xsdDiagnostics`

- **8 negativos preservados:** o corpus `lib/fiscal/xsd/__fixtures__/nfce-xsd-fixtures.ts` **não** foi
  tocado pelo fix (0 ocorrências no diff). Taxonomia determinística + N-01..N-14 verdes.
- **`xsdDiagnostics` não vaza XML/segredo/dado real:** origem = `xsd.violacoes`, que
  `dry-run-validation.ts:116` popula como `result.issues.map(i => sanitizeIssue(i.message))`; o worker
  já sanitiza via `sanitizeMessage` (strip de `<…>` → `[xml-omitido]`, caminhos e identificadores
  longos). Não é serializado no manifesto (`buildManifestFromProof` não o inclui). `P-15`
  (`assertSyntheticSafety` sobre a view pública, que já inclui o campo) verde.

## Validações reexecutadas (contra `ce8b7b4`)

| Gate | Resultado |
|---|---|
| `proof.test.ts` + `matrix.test.ts` | **88 passed / 12 skipped** (skipped = suíte worker real, sem `FISCAL_XSD_WORKER_URL`) |
| `test:fiscal-xsd:unit` (validator, xsd-worker, dry-run, pipeline, nfce-xml-builder) | **41 passed / 1 skipped** |
| `npx tsc --noEmit` | **0 erros** |
| ESLint (arquivos alterados) | **limpo** |
| `git diff --check 7e92194 ce8b7b4` | **limpo** |
| Re-validação XSD real (xmllint-wasm) do positivo regenerado | **`input.xml validates`** |

### Build — waiver explícito
`npm run build` **não executado**. Justificativa por diff: os arquivos do fix estão **inteiramente
fora do grafo produtivo do Next.js** — `grep -rn "fiscal-dry-run-integrity-proof" app components lib`
retorna **vazio** (nenhuma rota/layout/página/Server Action importa o harness); as mudanças são
CLI/testes (`tools/`), evidência JSON e docs. Nenhuma rota/layout/config/Prisma tocada. O
`tsc --noEmit` já checou o projeto inteiro (0 erros). Acresce que o host sofre OOM no webpack build
independentemente da mudança. **Waiver de build concedido.**

## Estratégia recomendada e próximo passo

1. **Abrir PR** de `fix/fiscal-dry-run-005b-positive-fixture` → `main`. Fecha por **3-way merge limpo
   sem rebase** (zero conflitos; zero interseção de arquivos com `2d808c4`). Rebase sobre `2d808c4`
   também aplica limpo, se preferir histórico linear — opcional, não necessário.
2. Após o merge, **re-disparar o Gate H3** (passo autorizado à parte — esta auditoria **não** dispara
   workflow/rerun/dispatch). Expectativa: `proof-offline` verde, `positive:{xsd:true,
   status:"xsd_ok", workerReal:true}`, matriz 1+8 aprovada, manifesto seguindo parcial até a
   elevação H4 autorizada.

**Confiança: alta.** Causa única e determinística, corrigida na fonte (fixture), com o mesmo motor
libxml2 aprovando o XML byte-idêntico ao que o worker validará; infra/segurança e 8/8 negativos já
verdes no run `29791958304`.

> Escopo desta auditoria: somente este relatório foi criado. Nenhum arquivo de fix, manifesto,
> workflow, worker, schema, lock, Prisma ou main foi alterado; nenhum dispatch/rerun/merge/rebase/
> force-push realizado.
