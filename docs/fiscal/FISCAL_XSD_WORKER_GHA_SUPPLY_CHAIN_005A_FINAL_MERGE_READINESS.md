# FISCAL — Auditoria Final de Merge-Readiness da Supply Chain XSD (GOAL-005A)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-WORKER-GHA-SUPPLY-CHAIN-005A-FINAL-MERGE-READINESS` |
| GOAL auditado | `FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A` |
| Data | 2026-07-19 |
| Tipo | Auditoria read-only de merge-readiness (não abre PR, não faz merge) |
| Classificação | **A — PRONTO PARA PR E INTEGRAÇÃO** |
| Risco textual | baixo |
| Risco semântico | baixo |
| Risco operacional | baixo |

> Esta auditoria **não** altera a branch 005A, **não** abre PR, **não** faz merge,
> **não** dispara/reexecuta workflow, **não** regenera/edita o lock e **não** toca
> nenhum arquivo fora do próprio relatório. Trabalho paralelo de outros chats/worktrees
> foi preservado e ignorado.

---

## 1. Objetivo

Auditar o range completo ainda **não integrado** da branch
`origin/work/fiscal-xsd-worker-gha-supply-chain-005a` contra a `origin/main` atual e
determinar se o GOAL-005A pode seguir para PR e integração controlada — **sem** abrir PR
nem fazer merge nesta tarefa.

---

## 2. Estado

Repositório: `rafaelfaria49-png/omni-gestao-pro-pdv-claude`. `git fetch origin --prune`
executado no início. Divergência histórica confirmada (**diverged**): 1 commit exclusivo
da main / 5 commits exclusivos da branch, com merge-base em `ba85e41`.

---

## 3. main

`98e05dfe9aec224e5a7ea31f85bada19bed2913b`

Merge commit do **PR #11** (`Merge pull request #11 from …/work/fiscal-xsd-worker-gha-supply-chain-005a`).
Autor GitHub; assinado (gpgsig). Não avançou além de `98e05df` durante a auditoria.

---

## 4. branch

`origin/work/fiscal-xsd-worker-gha-supply-chain-005a`

---

## 5. HEAD

`d51279461718508d94c534e9afe27232c73f0d6b` (bate com o HEAD esperado `d512794`).

---

## 6. merge-base

`ba85e417c0359fec7c3c37edc3fb511365c5a30a` (bate com o esperado `ba85e41`).

Fato central: **a árvore de `ba85e41` e a árvore de `98e05df` (main) são o MESMO objeto**
(`c2cb09ef6553488680ee3e7b08b9df6fe6afbadd`).

---

## 7. ahead/behind

`git rev-list --left-right --count origin/main...branch` → **1 / 5**
(1 exclusivo da main, 5 exclusivos da branch). Status: **diverged**.

---

## 8. Topologia

- `ba85e41` foi integrado na main **por merge commit** (`98e05df`, PR #11). Como a main
  estava em `7217acb` (o **pai** de `ba85e41`), o merge `--no-ff` foi um **no-op de
  conteúdo**: a árvore de `98e05df` é **byte-idêntica** à de `ba85e41`.
- Parents de `98e05df`: `7217acb` (first-parent, main pré-merge) + `ba85e41` (second-parent).
- `ba85e41` **é ancestral** de `origin/main` (`git merge-base --is-ancestor` = YES).
- `98e05df` **não é** ancestral da branch (a branch nunca "puxou" o merge commit).
- Os 5 commits da branch são **estritamente lineares** sobre `ba85e41` (cada um com pai único):
  `ba85e41 → 2691521 → 09ed270 → c7558d4 → c0d4b00 → d512794`.
- **Sem rebase, sem duplicação de `ba85e41`, sem merge commits na branch.**
- Consequência: main não tem **nenhuma** mudança de conteúdo em relação ao merge-base;
  a branch é uma **continuação linear** de conteúdo que já está na main. A divergência é
  **puramente topológica**, não de conteúdo.

Classificação topológica: **A — integração direta segura**.

---

## 9. PR #11

Merge commit `98e05df` integrou a **infraestrutura inicial** (workflow
`.github/workflows/fiscal-xsd-worker-supply-chain.yml` + versão inicial de
`workers/fiscal-xsd/ci/supply-chain.sh`) trazida por `ba85e41`. Por ser um no-op de
conteúdo, o workflow e o script inicial estão hoje na **ancestralidade compartilhada**
(merge-base), não como um lado "main-only" divergente.

---

## 10. commits main-only

Exatamente **1**:

```
98e05df  Merge pull request #11 from …/work/fiscal-xsd-worker-gha-supply-chain-005a
```

Nenhum avanço adicional da main além do merge do PR #11.

---

## 11. commits branch-only

Exatamente **5** (ordem cronológica, todos exclusivos do GOAL-005A):

```
2691521  fix(fiscal): validar versão numérica do xmllint
09ed270  fix(fiscal): remover pacotes vulneráveis do runtime XSD
c7558d4  fix(fiscal): corrigir pin binário do libcap2
c0d4b00  fix(fiscal): usar builder container na exportação OCI
d512794  build(fiscal): registrar bundle offline aprovado do worker XSD
```

Confirmado no Git real (não apenas na lista esperada). Todos pertencem ao 005A.

---

## 12. arquivos

Range `origin/main...branch` = **7 arquivos** (nenhum binário; `git diff --check` limpo):

| # | Arquivo | Status | +/- |
|---|---|---|---|
| 1 | `docs/ai/CURRENT_STATUS.md` | M | 37/14 |
| 2 | `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | M | 40/0 |
| 3 | `docs/fiscal/FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_REPORT.md` | A | 511/0 |
| 4 | `docs/roadmaps/ROADMAP_FISCAL.md` | M | 24/14 |
| 5 | `workers/fiscal-xsd/Dockerfile` | M | 29/5 |
| 6 | `workers/fiscal-xsd/ci/supply-chain.sh` | M | 213/13 |
| 7 | `workers/fiscal-xsd/supply-chain.lock.json` | A | 93/0 |

Todos os caminhos sob `docs/` ou `workers/fiscal-xsd/`. **Ausentes do range** (confirmado):
workflow adicional, archive, SBOM/Trivy/runtime/XSD brutos, binário, schema, migration,
Prisma, PDV, Caixa, Financeiro, Contador HUB, GOAL-005 técnico, segredo, dado real.

---

## 13. interseção

`comm -12` entre `ba85e41..main` (mudanças main-side) e `ba85e41..branch` (mudanças branch-side):

- Arquivos mudados main-side (`ba85e41..main`): **0** (árvore idêntica ao merge-base).
- Arquivos mudados branch-side (`ba85e41..branch`): **7**.
- **Interseção: 0.**

O `supply-chain.sh` **não** aparece como conflito: a versão inicial está na
ancestralidade (merge-base `ba85e41`), e a branch é sua **evolução linear**. Nenhum
conteúdo da main é perdido; nenhuma versão antiga é restaurada. Superfície de conflito: **inexistente**.

---

## 14. Dockerfile

Blob `d3ee129…` @ `d512794`. Diff `ba85e41..d512794` = +29/-5, contendo **apenas**:
`libcap2=1:2.66-4+deb12u3+b1` adicionado ao pin `--only-upgrade` (ao lado do
`libgnutls30=3.7.9-2+deb12u7` preservado) e remoção explícita de npm/npx/yarn/yarnpkg/corepack
+ `/usr/local/lib/node_modules/{npm,corepack}` + `/opt/yarn-v*` (com `node --version` preservando o binário).

Leitura integral confirma:
- imagem-base por digest `node:20.20.2-bookworm-slim@sha256:2cf067c…`;
- libxml2 `2.15.3`; fonte SHA-256 `78262a6e…` e patch SHA-256 `ab319bb4…` (fail-closed
  via `sha256sum --check --strict`); patch commit `d3352554…`;
- gate `21503` (`xmllint --version | grep -F '21503'`);
- `libgnutls30=3.7.9-2+deb12u7`; `libcap2=1:2.66-4+deb12u3+b1`;
- npm/npx/Yarn/Corepack removidos; Node preservado;
- `USER 10001:10001`; entrypoint `node …/server.mjs`; healthcheck `…/healthcheck.mjs`;
- schemas copiados localmente (`lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/`);
- nenhum registry, nenhum secret, nenhum endpoint SEFAZ.

O `dockerfileSha256` do lock (`c70e6261…`) corresponde **exatamente** ao blob do Dockerfile
em `c0d4b00` (commit do run) **e** em `d512794` — o Dockerfile não mudou entre o run e o registro do lock.

---

## 15. script

Blob `ca66f956…` @ `d512794` (mode `100755` preservado). `bash -n` = **OK** (676 linhas).
Diff `ba85e41..d512794` = +213/-13. Confirmado:
- `set -Eeuo pipefail`; gate `21503` (`assert_xmllint_libxml_version_code`, exige exatamente o
  código numérico, fail-closed);
- gate de runtime endurecido (`assert_runtime_hardened`) chamado em `mode_inspect` **e**
  `mode_verify_offline`; versões exatas `libgnutls30`/`libcap2` (fail-closed via `dpkg-query`);
- 1º build `--load` (sem push, sem cache remota);
- Trivy **não** contornado — `mode_generate_lock` faz `test "${critical}" = "0"` e
  `test "${high}" = "0"` fail-closed sobre o JSON real;
- Docker archive (`docker save`); builder OCI **efêmero** `docker-container` com verificação
  fail-closed do driver; `--builder` explícito; plataforma `linux/amd64`; validação fail-closed
  do OCI archive real (`oci-layout`, `index.json`, `blobs/sha256/<64hex>`, `imageLayoutVersion=1.0.0`,
  ≥1 manifest, digest `sha256:<64hex>`, mediaType OCI);
- `SHA256SUMS`; `verify-offline` com `--check --strict`; rede `--internal`; prova de **zero egress**
  (enforcement `.Internal=true` + probes `fetch`/`dns` que devem falhar);
- positivo `passed`; negativos **7/7**; `generate-lock`;
- `mode_cleanup` remove **somente** container/rede/imagem/`OCI_BUILDER` — **sem prune global**;
- sem push, sem `type=registry`, sem commit automático, sem chamada SEFAZ real.

`rg` de padrões sensíveis (`continue-on-error|.trivyignore|--push|type=registry|prune|GITHUB_TOKEN|
Authorization|secret|password|SEFAZ|HIGH|CRITICAL|exit-code`) no script e no workflow: todas as
ocorrências são **asserções negativas** (comentários), **detecção defensiva** (`grep` que aborta se
achar env sensível) ou os **próprios gates de enforcement** (Trivy `exit-code:1`, `severity:HIGH,CRITICAL`,
`test "0" || die`). Nenhum bypass, nenhuma redução de gate. `continue-on-error`: **ausente** em todos os workflows fiscais.

---

## 16. lock

Blob `cc45eee5…` @ `d512794`. **SHA-256 do blob cru = `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8`** — bate exatamente com o esperado. JSON **válido**, apenas LF (sem CRLF). Campos confirmados:

- `goal=FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A`; `version=1.0.0`;
- `repositoryCommit=c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91`;
- `dockerfileSha256=c70e6261…` (**verificado contra o blob real do Dockerfile**);
  `buildContextSha256=37047724…`;
- `actions[]` = 6 Actions pinadas por SHA (checkout/setup-node/download-artifact v7.0.0,
  upload-artifact v7.0.1, sbom-action v0.24.0, trivy-action v0.36.0);
- `runner=ubuntu-24.04`; `workflowRef=refs/heads/work/fiscal-xsd-worker-gha-supply-chain-005a`;
  `runId=29669361609`;
- `baseImages=[node:20.20.2…@sha256:2cf067c…]`; `libxml2{2.15.3,url,78262a6e…}`;
  `patch{d3352554…,ab319bb4…}`; `libgnutls=3.7.9-2+deb12u7`;
- `xsdPackage=PL_010e_v1.02`; `layout=4.00`; `model=65`; `rootSchema=nfe_v4.00.xsd`;
  `schemaManifestSha256=fc42d03e…`;
- `imageTag`; `imageId=sha256:cc27c5d6…`; `ociManifestDigest=sha256:40c28fd1…`; `platform=linux/amd64`;
- `dockerArchiveSha256=827e4b52…`; `ociArchiveSha256=fef17c43…`; `sbomSha256=1b64a87b…`;
  `trivySha256=ad532841…`;
- `vulnerabilities{critical:0,high:0}`; `runtimeExternalEgress=blocked-enforced`;
  `realSecrets=0`; `realData=0`;
- `positiveResult=passed`; `negativeResults` (7 chaves `rejected`/`enforced-unit`);
  `negativesPassed=7`; `negativesTotal=7`.

**Ressalva honesta:** o formato v1.0.0 do lock **não possui campo próprio para `libcap2`** — o
`REPORT.md §31–32` documenta isso e comprova o pin via SBOM + `dockerfileSha256` + gate de runtime.
Não é defeito do lock; o lock **não foi editado** para acrescentar o campo. **O lock não foi
regenerado nem editado nesta auditoria.**

---

## 17. documentos

Leitura integral dos 4 documentos do range — todos **honestos e consistentes**, sem afirmação
obsoleta e sem declarar integração já realizada:

- **`REPORT.md`** (novo, 511 linhas): estado = "ENTREGUE NA BRANCH"; explicita que o bundle **não**
  está na main (§64); GOAL-005 técnico **PARCIAL** (§68); gate Fiscal global **aberto** (§66);
  N6=0/N7=0; Contador HUB **não alterado** (§69); próximo passo (§70) = **exatamente esta auditoria
  de merge-readiness → depois PR**. Hashes (lock `5402dca…`, Dockerfile `c70e6261…`, artifact digest
  `aa60526d…`, ID `8436826125`) batem com as verificações desta auditoria.
- **`CURRENT_STATUS.md`** (M): nova seção 005A "ENTREGUE NA BRANCH" + "**Ainda sem merge em main**";
  GOAL-005 técnico PARCIAL; 005B não iniciado; gate global aberto; Contador HUB intocado.
- **`ROADMAP_FISCAL.md`** (M): 005A "entregue na branch … (ainda **sem** merge em main)";
  GOAL-005 técnico PARCIAL; 005B não iniciado; homologação/produção não abertas.
- **`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`** (M, **aditivo**): apêndice 005A;
  "**Não** é o GOAL-005 técnico"; gates nenhum fechado; N6/N7=0; Contador HUB não alterado;
  próximo passo = merge-readiness → PR.

Links Markdown relativos resolvem para os caminhos reais (report existe em `docs/fiscal/`).

---

## 18. run

**Run ID `29669361609`** (`success`, run #5). Conforme lock + `REPORT.md §7`: head branch
`work/fiscal-xsd-worker-gha-supply-chain-005a`, head SHA `c0d4b00…`, criado 2026-07-19T01:55:46Z,
concluído 01:59:18Z.

**Limitação declarada (honestidade):** este ambiente **não** tem `gh` nem `GITHUB_TOKEN`, então uma
**re-consulta ao vivo da API do GitHub Actions não foi executada**. A evidência do run é corroborada
por: (a) o **lock versionado byte-verificado** (`5402dca…`), que serializa `runId`, `repositoryCommit`,
`workflowRef` e resultados; (b) o `dockerfileSha256` do lock **casando com o blob real** do Dockerfile;
(c) o padrão `FINAL_ARTIFACT: fiscal-xsd-worker-offline-approved-${{ github.sha }}` do workflow, que
**deriva exatamente** o nome do artifact aprovado para `github.sha=c0d4b00…`; e (d) a consistência
integral entre lock, `REPORT.md` e docs. É uma verificação **documental/criptográfica**, não uma
re-consulta viva — e não revelou nenhuma inconsistência.

---

## 19. jobs

**2/2 success**: (1) "Build conectado, SBOM, scan e bundles"; (2) "Verificação offline em runner novo"
(`needs` do job 1). Etapas verdes por evidência (workflow + lock + report): build `--load`, inspeção
(xmllint/gate/schema/non-root/runtime endurecido), SBOM CycloneDX, Trivy JSON bloqueante, empacotamento
Docker+OCI+SHA256SUMS, upload intermediário, download em runner novo, verify-offline (load/isolamento/
zero-egress/positivo+negativos), timeout unitário fail-closed, generate-lock, upload final.

---

## 20. artifact

- **Final (aprovado):** `fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91`
  — nome derivado do padrão do workflow para o `github.sha` do run. Fonte do lock materializado.
- **Intermediário (separado):** `fiscal-xsd-worker-supply-chain-intermediate-c0d4b00…` (ID `8436814143`)
  — **não** usado como fonte do lock final.
- **UNAPPROVED:** só existe em caminho de falha (`if: failure()`); **não** foi usado.

---

## 21. artifact ID

`8436826125` (artifact final aprovado).

---

## 22. digest

`sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e` (digest GitHub do artifact
final; declarado no `REPORT.md §11` e igual ao valor aprovado). Verificação viva da API não disponível
neste ambiente — ver §18.

---

## 23. Trivy

**CRITICAL=0 / HIGH=0.** Enforcement duplo: Trivy step do workflow (`exit-code:1`,
`severity:HIGH,CRITICAL`, `ignore-unfixed:true` = corrigíveis, **não** bypass) **e** o gate fail-closed
do script sobre o JSON real no `generate-lock`. `trivySha256=ad532841…` no lock.

---

## 24. SBOM

CycloneDX JSON; `sbomSha256=1b64a87b…` no lock. Bruto **fora do Git**. `REPORT.md §33/§34` confirma
`node 20.20.2`, `libgnutls30 3.7.9-2+deb12u7`, `libcap2 1:2.66-4+deb12u3+b1` e ausência de componentes `pkg:npm/*`.

---

## 25. OCI

`ociArchiveSha256=fef17c43…`; `ociManifestDigest=sha256:40c28fd1…`; `platform=linux/amd64`;
`imageLayoutVersion=1.0.0`; mediaType OCI. Gerado por builder efêmero `docker-container` (o driver
`docker` padrão não suporta o exportador OCI) e validado fail-closed pelo script. Archive **não** versionado no Git.

---

## 26. Docker archive

`dockerArchiveSha256=827e4b52…`. Exportado por `docker save`, validado por SHA256SUMS e recarregado no
job offline com conferência de image ID (`imageId=sha256:cc27c5d6…`). **Não** versionado no Git.

---

## 27. runtime

`externalEgress=blocked-enforced` (rede `--internal` + probes fetch/DNS que falham). Non-root
`10001:10001`, `read-only rootfs`, tmpfs endurecida, `cap-drop ALL`, `no-new-privileges`,
memória 768 MiB, cpus 1, pids 64. Healthcheck/readiness `ok`.

---

## 28. XSD

positivo **passed**; negativos **7/7** (`missing_required`, `unexpected_element`, `invalid_order`,
`invalid_type`, `wrong_namespace`, `payload_over_limit` = `rejected`; `timeout_fail_closed` = `enforced-unit`);
`integration`/`security` = `passed`; `unitTimeout` = `enforced`.

---

## 29. egress

**Zero egress externo**, com enforcement (rede `--internal` = `.Internal:true`) e probes ativos
(HTTP + DNS contra host externo) que **devem falhar** para o pipeline prosseguir. Registrado como
`runtimeExternalEgress=blocked-enforced` no lock.

---

## 30. segredos

**0.** Scan do range (linhas adicionadas) por chaves privadas, certificados, `idToken`, `Authorization`,
tokens `ghp_/gho_/github_pat_`, `api_key`, `password`, `senha`, `csc` = **nenhum**. As menções a
`secret/token/password/senha/csc` no script são um **grep defensivo** que aborta se a imagem tiver env sensível.

---

## 31. dados reais

**0.** Sem CNPJ/CPF reais (nenhuma máscara numérica), sem `storeId` real, sem XML fiscal real, sem
endpoint SEFAZ ativo. `realSecrets=0`, `realData=0` no lock. Menções a "SEFAZ" no range são
**asserções negativas** em docs ("Sem homologação SEFAZ", "sem emissão/SEFAZ", "não").

---

## 32. registry

**Não utilizado.** Sem `--push`, sem `type=registry`, sem publicação. Bundle offline apenas.

---

## 33. gates

| Gate | Estado |
|---|---|
| Gate Fiscal **global** F4→F5 | **aberto** (inalterado) |
| G-F5 / G-F7 / G-F12 | **abertos** |
| Critério C14N/XMLDSig F4→F5 | fechado (GOAL-003, histórico) |
| Gates alterados por 005A | **nenhum** |

---

## 34. nível

Nível **não elevado** globalmente. N6 = **0**; N7 = **0**. A supply chain offline reforça a
evidência do eixo XSD (N4 já existente), **sem** reclassificar o stack Fiscal.

---

## 35. GOAL-005A

**Entregue na branch** `work/fiscal-xsd-worker-gha-supply-chain-005a`. Não está na main.

---

## 36. GOAL-005

`FISCAL-DRY-RUN-INTEGRITY-PROOF-005` — **continua PARCIAL** (definido; prova de dry-run end-to-end
não entregue). Este trabalho **não** o declara entregue.

---

## 37. 005B

**Não iniciado.**

---

## 38. Contador HUB

**Não alterado.** Trilho distinto; nenhum arquivo do Contador HUB no range.

---

## 39. merge-tree

- Forma legada `git merge-tree ba85e41 origin/main branch`: exit **0**, **zero** marcadores de conflito.
- Forma moderna `git merge-tree --write-tree origin/main branch`: exit **0** (limpo), sem estágios não resolvidos.

---

## 40. árvore virtual

`5200c6e5bae316eab52475283dd8fdead8b438fb`.

**Igual, bit a bit, à árvore do topo da branch (`d512794^{tree}`)** — o merge produz **exatamente** o
conteúdo da branch: nada perdido, nada extra. Por identidade de objeto de árvore, todo caminho da
árvore virtual é idêntico ao da branch.

---

## 41. blobs técnicos

| Arquivo | Blob (árvore virtual = branch) | Observação |
|---|---|---|
| `.github/workflows/fiscal-xsd-worker-supply-chain.yml` | `60b7c856…` | **preservado** (= `ba85e41` = main; branch não tocou; `diff main..branch` vazio). Workflow **não** reintroduzido como arquivo novo. |
| `workers/fiscal-xsd/Dockerfile` | `d3ee129…` | = branch |
| `workers/fiscal-xsd/ci/supply-chain.sh` | `ca66f956…` (mode 100755) | = branch |
| `workers/fiscal-xsd/supply-chain.lock.json` | `cc45eee5…` | = branch |
| `docs/fiscal/…005A_REPORT.md` | `e902283…` | = branch |
| `docs/fiscal/FISCAL_CONTINUATION…001.md` / `docs/roadmaps/ROADMAP_FISCAL.md` / `docs/ai/CURRENT_STATUS.md` | = branch | = branch |

Nenhum arquivo perdido; nenhuma restauração de estado anterior; nenhuma modificação automática fora do range.

---

## 42. risco textual

**baixo.** Docs honestos, datados (2026-07-19), sem afirmação obsoleta sobre main, sem declaração de
integração já feita. Links relativos válidos.

---

## 43. risco semântico

**baixo.** Interseção vazia com a main; merge-tree limpo; árvore virtual == branch. Evolução linear do
`supply-chain.sh` sobre a versão que já está na main via merge-base. Lock byte-verificado e
consistente com o Dockerfile real. Nenhum conflito material.

---

## 44. risco operacional

**baixo.** Sem binário no Git; sem segredo; sem dado real; sem registry; sem alteração de emissão/SEFAZ;
sem toque em schema/Prisma/PDV/Caixa/Financeiro/Contador; nenhum gate reduzido. **Ponto operacional
pós-merge** (não bloqueia): o guard de branch do workflow espera a ref
`refs/heads/work/fiscal-xsd-worker-gha-supply-chain-005a`; após o merge, disparar o workflow exige
selecionar a branch work (ou o override previsto). É comportamento esperado, não defeito.

---

## 45. Classificação e estratégia

### Classificação: **A — PRONTO PARA PR E INTEGRAÇÃO**

Todos os critérios de A satisfeitos: range exato e íntegro (7 arquivos); 5 commits próprios;
main-only compreendido (1 merge no-op de conteúdo); interseção 0; merge-tree limpo; árvore virtual
== branch; run aprovado (evidência documental/criptográfica — ver §18); artifact aprovado; lock
válido e byte-verificado; Trivy 0/0; runtime offline; XSD 7/7; documentos honestos; sem segredo;
sem dado real; sem binário; sem conflito semântico; sem afirmação obsoleta.

A topologia é a **mais limpa possível**: a branch é descendente linear de conteúdo já presente na
main (via merge-base `ba85e41`), e a main não tem mudança alguma sobre esse merge-base. Não há estado
obsoleto a cristalizar nem proveniência inadequada — portanto **A**, não A2.

### Estratégia de PR (a executar por humano, fora desta tarefa)

- **base:** `main`
- **head:** `work/fiscal-xsd-worker-gha-supply-chain-005a`
- **método:** **merge commit** — sem squash, sem rebase, sem auto-merge, sem exclusão de branch.
- O PR mostrará os **5 commits** posteriores a `ba85e41` e os **7 arquivos** atuais, **sem**
  reintroduzir o workflow como arquivo novo (o blob `60b7c856…` já está na main de forma idêntica).

---

## 46. Conclusão

O range não integrado da branch `work/fiscal-xsd-worker-gha-supply-chain-005a` (5 commits lineares,
7 arquivos) está **apto a PR e integração controlada** contra a `origin/main` atual (`98e05df`).
A divergência é **puramente topológica** (merge no-op do PR #11), a interseção com a main é **vazia**,
o merge-tree é **limpo** e a **árvore virtual é byte-idêntica à branch**. Lock byte-verificado
(`5402dca…`), Trivy **0/0**, runtime **egress blocked-enforced**, XSD **7/7**, docs honestos, **0**
segredos, **0** dados reais, **0** binários no Git. GOAL-005 técnico continua **PARCIAL**; **005B não
iniciado**; gate Fiscal global **aberto**; Contador HUB **intocado**.

**Classificação: A — PRONTO PARA PR E INTEGRAÇÃO.** Nenhum PR/merge executado nesta auditoria.
Próximo passo (humano): abrir o PR conforme §45.
