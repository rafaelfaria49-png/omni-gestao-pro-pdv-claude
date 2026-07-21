# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Preparação do Gate H4 (elevação do manifesto)

**Data:** 2026-07-20 (revisado e integrado 2026-07-21) · **Branch:** `work/fiscal-dry-run-005b-h4-elevation-integrate` (base `origin/main` = `51c01086c658e35601e10da1841570d2ebeef49c`)
**Origem:** reaplicação de `fd6b39e` (preparação H4) + `ede1127` (correções B-1/B-2/B-3), antes baseadas em `ecc4944`
**Base de confiança:** Gate H3 aprovado no run [`29796176577`](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29796176577) · worker artifact `8436826125` · lock `5402dca9…340266e8`

> **Esta tarefa NÃO executou o workflow e NÃO alterou o manifesto golden versionado.**
> O golden segue `proofState:"partial"`, `verification.xsd:false`, `xsdWorkerReal:false`,
> `blockingReasons:["XSD_WORKER_REAL_UNAVAILABLE"]`.

> **Revisão 2026-07-21 — achados B-1/B-2/B-3 da readiness RESOLVIDOS.** Ver
> [`…_H4_ELEVATION_READINESS.md`](./FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_H4_ELEVATION_READINESS.md)
> (classificação **B**) e a **§11** deste documento. O manifesto golden **continua intacto** e
> **nenhum `workflow_dispatch` foi executado**.

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
4. **Smoke real de transpilação do `tsx`** (devDependency fixada, sem instalação dinâmica) e
   **gate Java 17 dentro do contêiner** da elevação — ambos falham antes de qualquer escrita (§11).
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

**Artifact de diagnóstico (B-3).** Além do acima — que é *fail-closed* e **não sai quando a elevação
falha** — há um segundo artifact `fiscal-dry-run-005b-h4-diagnostics-${{ github.run_id }}`
(**retenção 14 dias**, `if: always() && inputs.elevate_manifest`, `if-no-files-found: ignore`) com
`h4-tsx-smoke.log`, `h4-java-gate.log`, `h4-elevation.log` e `h4-verify.log`. São apenas logs de gate
e execução (versões, hashes e o JSON público do harness) — **sem XML, credencial, token ou dado
fiscal**. Um upload nunca converte falha em sucesso: a conclusão do job continua sendo a do passo que
falhou.

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
| Todos os passos H4 gated por `elevate_manifest` (**11/11** após §11) | ✅ |
| Nenhum passo H3 condicionado a `elevate_manifest` | ✅ |
| Verificação de golden PARCIAL segue **incondicional** (H3 preservado) | ✅ |
| Elevação usa worker real + rede `--internal`; nenhum uso de composition-gate | ✅ (2 invocações de `run.ts`, ambas com `FISCAL_XSD_WORKER_URL`) |
| Permissões somente leitura; nenhum `git commit`/`push` no workflow | ✅ |
| Nenhum segredo novo (apenas `GITHUB_TOKEN` já existente) | ✅ |
| Nenhum dado fiscal real; nenhum acesso a banco/SEFAZ | ✅ (fixture sintética; `databaseWrites`/`sefazCalls` exigidos = 0) |
| Diff do workflow vs `main`: **única remoção = comentário de cabeçalho** (H3 intocado) | ✅ |
| Testes focados | ✅ **88 passed / 12 skipped** (ver §11) |
| `git diff --check` | ✅ limpo |
| Exatamente os arquivos autorizados | ✅ workflow + este relatório (+ `package.json`/`package-lock.json` na revisão de §11) |
| `workflow_dispatch` executado | ❌ **NÃO** — proibido nesta tarefa |
| Manifesto golden versionado | ❌ **NÃO alterado** — segue `partial` |

## 9. Riscos remanescentes

1. **Workflow não executado.** O caminho H4 foi **escrito e validado estruturalmente**, mas nunca
   rodou de ponta a ponta. A primeira execução real é o teste de verdade — e é fail-closed, então
   falha em vez de elevar indevidamente.
2. ~~**JDK por bind-mount** não provado dentro do bookworm.~~ **RESOLVIDO (B-2)** — há gate que
   compila e executa uma classe Java mínima **dentro do contêiner da elevação**, antes do
   `--update-manifest` (§11).
3. ~~**Provisionamento dinâmico do `tsx`.**~~ **RESOLVIDO (B-1)** — `tsx` virou devDependency fixada
   e a instalação dinâmica foi removida (§11).
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

> **Base já integrada.** A preparação nasceu sobre `ecc4944`; a `main` avançou para `51c0108`
> (PR #18, Contador/Supabase), que **também tocou `package.json` e `package-lock.json`**. Em vez de
> arriscar conflito no merge, o trabalho foi **reaplicado sobre a `main` atual** nesta branch
> (`…-integrate`), com o lock **regenerado** por `npm install --package-lock-only --ignore-scripts` —
> nunca por escolha manual `ours`/`theirs`. Resultado verificado: o lock é **superconjunto** do da
> `main` (+28 pacotes: `tsx`, `esbuild` e as 26 variantes de plataforma), com **0 pacotes removidos e
> 0 versões alteradas**, e as 7 entradas `@supabase/*` do PR #18 preservadas com integridade.

## 11. Resolução dos achados da readiness (B-1 · B-2 · B-3)

Correções aplicadas em resposta à auditoria de readiness (classificação **B**). **Nenhuma toca o
caminho H3**: contra a `main`, o workflow desta branch segue removendo **uma única linha — um
comentário de cabeçalho**.

### B-1 — `tsx` deixa de ser instalação dinâmica

O passo que rodava `npm install --no-save --no-package-lock "tsx@${TSX_VERSION}"` foi **removido por
completo**. Motivo do achado: aquele comando **não** passava `--ignore-scripts` (ao contrário do
`npm ci --ignore-scripts` da mesma job) e portanto executava o `postinstall` do `esbuild` no host; e
`tsx@4.23.1` depende de `esbuild` por **range** (`~0.28.0`), de modo que fixar o `tsx` não fixava
quem de fato roda o script.

Agora:

- `tsx` é **devDependency exata** — `"tsx": "4.23.1"` em `package.json` (sem `^`/`~`);
- o `package-lock.json` **fixa as versões resolvidas com integridade**: `tsx@4.23.1`,
  `esbuild@0.28.1` e os pacotes de plataforma (inclusive `@esbuild/linux-x64@0.28.1`, o do runner);
- o `tsx` chega pelo **`npm ci --ignore-scripts` já existente** (linha 219) — **nenhum script de
  instalação de terceiros é executado**;
- em vez de `tsx --version`, o gate agora é um **smoke de transpilação real**: gera um `.ts` com
  `enum` (que o modo *strip-only* do Node **rejeita**) e exige a saída `H4_TSX_SMOKE_OK`. Isso prova
  que o binário do `esbuild` funciona **mesmo sem `postinstall`** — que era exatamente o risco de
  desligar os scripts. O passo também confere a versão instalada contra `TSX_VERSION`.

O smoke roda **no host, antes do isolamento** — o executor da elevação está numa rede `--internal` e
não conseguiria baixar nada.

### B-2 — Java 17 provado dentro do contêiner

Novo gate, **antes** do `--update-manifest`, usando **a mesma imagem, a mesma rede `--internal` e o
mesmo bind-mount `${JAVA_HOME}` → `/opt/java17:ro`** da elevação, com `JAVA_HOME`/`PATH` idênticos.
Ele roda `java -version`, `javac -version` e então **compila e executa** uma classe mínima
(`H4JavaGate`), exigindo a saída `H4_JAVA_GATE_OK 17.`. Compilar **e** executar importa: `java
-version` sozinho não provaria o `javac`, e `run.ts` usa os dois. Qualquer falha interrompe a
elevação (`set -e` no contêiner + `pipefail` no passo), antes de qualquer escrita no manifesto.

### B-3 — diagnóstico publicado mesmo em falha

Ver §5: artifact `fiscal-dry-run-005b-h4-diagnostics-<run_id>`, 14 dias, `always()` restrito a
`elevate_manifest`, com os quatro logs H4 e `if-no-files-found: ignore`.

### Validações desta correção

| Validação | Resultado |
|---|---|
| `npm ci --ignore-scripts` a partir do lock integrado | ✅ 881 pacotes, exit 0 |
| `tsx` presente após o `npm ci` (sem `postinstall`) | ✅ `tsx@4.23.1` · `esbuild@0.28.1` |
| Smoke real de transpilação (`enum`) | ✅ `H4_TSX_SMOKE_OK H4 true`; o mesmo arquivo sob `node` puro falha com `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` |
| Classe `H4JavaGate` gerada pelo heredoc | ✅ compila e executa (`javac 17.0.13` → `H4_JAVA_GATE_OK 17.0.13`) |
| Scripts dos passos novos sob `bash -n` e sob `bash -eo pipefail` | ✅ |
| Heredocs terminam em coluna 0 depois do *dedent* do YAML | ✅ verificado no YAML já parseado |
| YAML válido (`js-yaml`) | ✅ 2 jobs · 8 + 30 passos · **11** gated por `elevate_manifest` |
| Testes focados do harness | ✅ **88 passed / 12 skipped** (idêntico ao baseline) |
| Testes Fiscal XSD (`test:fiscal-xsd:unit`) | ✅ **41 passed / 1 skipped** |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 |
| `npm run lint` | ⚠️ vermelho **pré-existente** (105 erros/115 avisos em 87 arquivos) — **zero** em `lib/fiscal`, `tools/` ou `workers/`; este diff não contém nenhum arquivo que o ESLint processe |
| `git diff --check` | ✅ limpo |
| `npm install` dinâmico no workflow | ✅ **nenhum** |
| `git commit`/`git push`/`contents: write` | ✅ **nenhum**; permissões seguem `contents: read` + `actions: read` |
| Manifesto golden | ✅ **intacto** (`partial`/`xsd:false`/`xsdWorkerReal:false`) |
| `workflow_dispatch` | ❌ **NÃO executado** |
