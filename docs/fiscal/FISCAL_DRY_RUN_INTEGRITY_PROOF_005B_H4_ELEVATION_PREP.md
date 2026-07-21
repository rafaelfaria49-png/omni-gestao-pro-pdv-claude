# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Preparação do Gate H4 (elevação do manifesto)

**Data:** 2026-07-20 · **Branch:** `work/fiscal-dry-run-005b-h4-elevation-prep` (base `origin/main` = `ecc494409ef857391427baf8ce73f0784eff59ce`)
**Base de confiança:** Gate H3 aprovado no run [`29796176577`](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29796176577) · worker artifact `8436826125` · lock `5402dca9…340266e8`

> **Esta tarefa NÃO executou o workflow e NÃO alterou o manifesto golden versionado.**
> O golden segue `proofState:"partial"`, `verification.xsd:false`, `xsdWorkerReal:false`,
> `blockingReasons:["XSD_WORKER_REAL_UNAVAILABLE"]`.

## 1. Arquitetura da elevação

A elevação (H4) foi adicionada ao workflow existente como um **caminho opt-in**, não como um novo
workflow. Isso mantém uma única fonte de verdade para lock/imagem/schemas/rede e evita divergência
entre "provar" (H3) e "elevar" (H4).

Fluxo quando `elevate_manifest=true`:

1. **Gate de autorização (fase conectada, fail-fast).** Barra a elevação mal autorizada **antes** do
   download do bundle de 143 MB.
2. Todo o fluxo H3 roda normalmente (lock → artifact → imagem → worker `--internal` → zero egress →
   prova host com Java 17 → matriz 1+8 → **golden deve estar PARCIAL** → healthcheck).
3. **Reafirmação de pré-condições (fail-closed).** Re-verifica autorização e exige evidência
   materializada: readiness com `xmllint`/libxml2 2.15.3/schemaManifestHash, rede `Internal=true`,
   `image ID` igual ao lock, e a matriz verde (`xsd_ok`, `workerReal:true`, `egressExternal:0`).
   Também exige que o **baseline do golden seja PARCIAL** — não se eleva a partir de estado incerto.
4. **Provisionamento do `tsx` no host** (o executor da elevação roda offline; ver §9).
5. **Elevação:** `run.ts --update-manifest` dentro de um contêiner conectado **somente** à rede
   `--internal` do worker, com `FISCAL_XSD_WORKER_URL=http://worker.internal:8080` real.
   **Nunca composition-gate** — o adapter real é selecionado por ambiente (`resolveXsdAdapterFromEnv`).
6. **Exigência do manifesto COMPLETO** (§4) e **invariantes de hashes** (§6).
7. **Só o manifesto pode ter mudado** no workspace.
8. **Re-execução do dry-run sem `--update-manifest`, exigindo exit code 0** — prova que o manifesto
   elevado é auto-consistente sob o worker real.
9. **Artifact verificável** (§5). O workflow **nunca commita nem faz push**.

### Por que a elevação roda em contêiner e não no host
O `net-guard` do harness só considera destino interno o que é loopback ou `*.internal`. O alias
`worker.internal` só resolve pelo DNS do Docker **dentro** da rede. Rodar no host exigiria alcançar o
worker por IP bruto, que o próprio `net-guard` classificaria como egress externo. Logo, o executor
precisa estar na rede `--internal` — exatamente como a matriz do H3 já faz.

## 2. Inputs e confirmação

| Input | Tipo | Default | Papel |
|---|---|---|---|
| `allow_branch_override` | boolean | `false` | (existente) permite rodar fora da branch do GOAL |
| `elevate_manifest` | boolean | **`false`** | liga o caminho H4 |
| `elevation_confirmation` | string | `""` | precisa ser **exatamente** `ELEVATE-GOAL-005B-H4` |

A frase de confirmação é comparada via variável de ambiente (`env:`), **nunca** interpolada no corpo
do shell — texto controlado pelo operador não vira código (proteção contra script injection).

## 3. Condições fail-closed

A elevação só ocorre com **todas** as condições abaixo; qualquer divergência **falha** (exit 1),
nunca "pula silenciosamente":

1. `elevate_manifest = true`
2. `elevation_confirmation == ELEVATE-GOAL-005B-H4` (comparação exata)
3. `GITHUB_REF == refs/heads/main`
4. `allow_branch_override == true`
5. Worker real pronto: `engine.name=xmllint`, `libxml2Version=2.15.3`, `schemaManifestHash` esperado
6. Matriz 1+8 verde: `"status":"xsd_ok"`, `"workerReal":true`, `"egressExternal":0`
7. Zero egress comprovado: rede com `Internal=true` (+ probes do H3 já executados)
8. Lock, imagem e schemas validados: `image ID` == lock, SHA-256 do Docker archive conferido,
   hashes XSD reverificados, lock âncora conferido na fase conectada
9. Baseline do golden **PARCIAL** antes de elevar

## 4. Manifesto completo exigido

Após `--update-manifest`, o workflow **exige**:

```
proofState            = "complete"
verification.xsd      = true
verification.xsdContract   = true
verification.xsdStatus     = "approved-real"
verification.xsdEngineName = "xmllint"
verification.xsdWorkerReal = true
blockingReasons       = []
```

## 5. Artifact produzido (futuramente)

Nome: `fiscal-dry-run-005b-h4-complete-manifest-${{ github.run_id }}` · **retenção 90 dias**.

Conteúdo:
- `manifest.json` — manifesto completo;
- `manifest.sha256` — hash do manifesto;
- `manifest.patch` — patch do manifesto contra o commit executado;
- `h4-evidence.json` — runId, commitSha, ref, lockSha256, dockerArchiveSha256, imageId,
  schemaManifestHash, engine (nome/versão/libxml2/binaryHash), workerReal, positivo (`xsd`/`status`),
  negativos (contagem **8** + detalhe), Java (runtime + `externalJava17`), zero egress (matriz e
  manifesto), `databaseWrites=0`, `sefazCalls=0`, e um resumo do manifesto;
- `h4-elevation.log` e `h4-verify.log`.

O próprio passo de montagem **falha** se negativos ≠ 8, positivo não aprovado, `workerReal != true`,
engine ≠ `xmllint`, egress ≠ 0 ou `databaseWrites`/`sefazCalls` ≠ 0.

## 6. Invariantes

Comparados contra o golden **do commit executado** (`git show ${GITHUB_SHA}:…manifest.json`), que é o
parcial corrigido por `ce8b7b4`. Qualquer alteração **falha**:

`snapshotSha256` · `unsignedXmlSha256` · `referencedNodeC14nSha256` · `signedInfoSha256` ·
`signedXmlSha256` · `signature.digestValue`

Isto materializa no CI a mesma propriedade que o teste `XSD-H17` já garante: **elevar muda só o eixo
XSD**, nunca o fluxo XML/assinatura.

Além disso, `git diff --name-only` após a elevação precisa ser **exatamente**
`tools/fiscal-dry-run-integrity-proof/evidence/manifest.json`.

## 7. Permissões

Inalteradas e **somente leitura**: `contents: read`, `actions: read`.
Não há `contents: write`, não há token de escrita, e **nenhum passo executa `git commit`/`git push`**
(verificado automaticamente). A adoção do manifesto elevado no repositório é um passo **humano**,
posterior, a partir do artifact.

## 8. Validações executadas nesta tarefa

| Validação | Resultado |
|---|---|
| YAML válido (parse `js-yaml`) | ✅ |
| Inputs H4 (`elevate_manifest` boolean/default false; `elevation_confirmation` string) | ✅ |
| Todos os passos H4 gated por `elevate_manifest` (10/10) | ✅ |
| Nenhum passo H3 condicionado a `elevate_manifest` | ✅ |
| Verificação de golden PARCIAL segue **incondicional** (H3 preservado) | ✅ |
| Elevação usa worker real + rede `--internal`; nenhum uso de composition-gate | ✅ (2 invocações de `run.ts`, ambas com `FISCAL_XSD_WORKER_URL`) |
| Permissões somente leitura; nenhum `git commit`/`push` no workflow | ✅ |
| Nenhum segredo novo (apenas `GITHUB_TOKEN` já existente) | ✅ |
| Nenhum dado fiscal real; nenhum acesso a banco/SEFAZ | ✅ (fixture sintética; `databaseWrites`/`sefazCalls` exigidos = 0) |
| Diff **puramente aditivo** (262 inserções; única remoção = comentário de cabeçalho) | ✅ |
| `git diff --check` | ✅ limpo |
| Exatamente os arquivos autorizados | ✅ workflow + este relatório |
| Testes focados | Nenhum aplicável: mudança é **workflow-only**. O harness (`tools/fiscal-dry-run-integrity-proof`, `lib/fiscal`, `workers/fiscal-xsd`) é **idêntico** entre `ce8b7b4` e a base `ecc4944`, estado em que a suíte foi verificada verde (88/12 skipped + 41/1 skipped) na auditoria de readiness. |
| `workflow_dispatch` executado | ❌ **NÃO** — proibido nesta tarefa |
| Manifesto golden versionado | ❌ **NÃO alterado** — segue `partial` |

## 9. Riscos remanescentes

1. **Workflow não executado.** O caminho H4 foi **escrito e validado estruturalmente**, mas nunca
   rodou de ponta a ponta. A primeira execução real é o teste de verdade — e é fail-closed, então
   falha em vez de elevar indevidamente.
2. **JDK por bind-mount.** `run.ts` exige verificação externa Java 17, e a imagem Node fixada não traz
   JDK. Monta-se o JDK já validado do runner (`${JAVA_HOME}` → `/opt/java17:ro`). Espera-se
   compatibilidade (Temurin 17 linux-x64 sobre Debian bookworm, ambos glibc/x64), **mas isso só se
   confirma na primeira execução**. Se falhar, a alternativa é uma imagem fixada com Node + JDK.
3. **Provisionamento do `tsx`.** `tsx` não é dependência do repositório e o executor roda offline;
   por isso é instalado no host antes do contêiner, com versão fixada (`4.23.1` — a mesma já
   exercitada com este repo/Node 20.20.2), via `npm install --no-save --no-package-lock` (não altera
   `package.json`/`package-lock.json`; `node_modules` é ignorado pelo git). Ainda assim é uma
   dependência resolvida em tempo de execução: **recomenda-se promover `tsx` a devDependency fixada**
   num passo autorizado à parte, para trazê-la ao `package-lock`.
4. **Janela do artifact do 005A.** O bundle aprovado (`8436826125`) expira em `2026-07-26T01:59Z`; o
   workflow já falha explicitamente se expirado. A elevação precisa acontecer antes disso, ou o 005A
   precisa ser renovado.
5. **Adoção do manifesto é humana.** O workflow entrega o manifesto completo apenas como artifact.
   Trazer esse manifesto para o repositório (commit) continua sendo decisão e ação humana — por
   desenho, já que as permissões são somente leitura.

## 10. Próximo passo

Abrir PR desta branch para `main`. Depois do merge, executar **um** `workflow_dispatch` na `main` com:

```
allow_branch_override  = true
elevate_manifest       = true
elevation_confirmation = ELEVATE-GOAL-005B-H4
```

e recolher o artifact `fiscal-dry-run-005b-h4-complete-manifest-<run_id>` para adoção do manifesto
completo em passo humano subsequente.
