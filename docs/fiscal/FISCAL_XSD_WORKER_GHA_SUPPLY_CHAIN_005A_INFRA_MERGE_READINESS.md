# FISCAL-XSD-WORKER-GHA-SUPPLY-CHAIN-005A — Infra Merge Readiness

> Auditoria read-only da branch de infraestrutura do workflow GitHub Actions do
> worker fiscal XSD B2, contra a `origin/main` atual. **Não** abre PR, **não**
> dispara workflow, **não** faz merge. Somente este relatório é criado.

---

## 1. Objetivo

Determinar se os **dois arquivos de infraestrutura** da branch
`work/fiscal-xsd-worker-gha-supply-chain-005a` podem ser integrados por PR na
`main` para que o workflow **manual** apareça no GitHub Actions — confirmando
segurança, isolamento, permissões mínimas, ausência de registry/segredo e
compatibilidade com a `main` atual (avançada pelo Contador HUB GOAL 007/007B).

O GOAL-005 **técnico** (harness dry-run, `work/fiscal-dry-run-integrity-proof-005`
@ `d4dfcf1`, estado PARCIAL) **não** faz parte deste diff e **não** é alterado.

## 2. Branch auditada

`work/fiscal-xsd-worker-gha-supply-chain-005a`

## 3. Commit auditado

`ba85e417c0359fec7c3c37edc3fb511365c5a30a` (prefixo `ba85e41`, confirmado)
— mensagem: `ci(fiscal): executar supply chain XSD em runner isolado`.

## 4. origin/main

`7217acbf378e618c4d6409500f8467038f6922f8` (prefixo `7217acb`)
— `fix(contador): alinhar semantica do fechamento read-only (GOAL 007B)`.

## 5. merge-base

`7217acbf378e618c4d6409500f8467038f6922f8` — **idêntico à `origin/main`**.

Implicação: o pai de `ba85e41` **é** a `origin/main` atual
(`git rev-parse ba85e41^` = `7217acb`). A branch foi (re)baseada sobre a main
pós-Contador-007B. Fast-forward puro é possível.

## 6. ahead / behind

`git rev-list --left-right --count origin/main...branch` → `0   1`

- **behind: 0** (nada na main que a branch não tenha)
- **ahead: 1** (exatamente um commit próprio)

## 7. Commits exclusivos da main (base..main)

**Nenhum.** `git log branch..origin/main` retorna vazio (a branch está no topo da
main atual).

Contexto histórico — o avanço `ccb8b0f..7217acb` (base documentada no início da
autoria → main observada no fim) foi:

- `fc5066b feat(contador): checklist de fechamento derivado somente leitura (GOAL 007)`
- `7217acb fix(contador): alinhar semantica do fechamento read-only (GOAL 007B)`

Arquivos tocados por esse avanço (Contador HUB, todos disjuntos da infra):
`app/dashboard/contador/page.tsx`, `components/dashboard/contador/*`,
`lib/contador/fechamento/*`, `docs/status/MOCKS_TRACKING.md`.
**Nenhum** toca `.github/workflows/**`, `workers/fiscal-xsd/**` ou schemas.

## 8. Commits exclusivos da branch (main..branch)

- `ba85e41 ci(fiscal): executar supply chain XSD em runner isolado`

Exatamente **um** commit próprio.

## 9. Arquivos (diff main...branch)

```
A  .github/workflows/fiscal-xsd-worker-supply-chain.yml   (+211)
A  workers/fiscal-xsd/ci/supply-chain.sh                  (+476)
2 files changed, 687 insertions(+)
```

`git diff --check` → **limpo** (sem espaço em branco defeituoso, sem marcador de
conflito). Nenhum Dockerfile, lock, relatório, artifact, binário, schema, XSD,
código produtivo, arquivo do GOAL-005 técnico, Contador HUB, segredo ou
dependência no diff.

## 10. Interseção com o avanço da main

`comm -12` entre `(base..main)` e `(base..branch)` → **vazia**.

Como `base == main`, o lado `(base..main)` tem **0 arquivos**. Confirmado ainda
que o avanço histórico do Contador (§7) não intersecta nenhum dos dois caminhos
de infra nem `workers/fiscal-xsd/`. **Interseção semanticamente segura.**

## 11. merge-tree

`git merge-tree --write-tree origin/main branch`:

- exit code **0** (sem conflito)
- árvore virtual mesclada: `c2cb09ef6553488680ee3e7b08b9df6fe6afbadd`

## 12. Árvore virtual

Blobs dos dois arquivos na árvore mesclada == blobs da branch (byte-idênticos aos
auditados):

| Arquivo | blob (merged) | blob (branch) |
|---------|---------------|---------------|
| workflow yml | `60b7c8566a1b2fbde3eb8496dd0c7f2730c589bf` | `60b7c8566a1b2fbde3eb8496dd0c7f2730c589bf` |
| supply-chain.sh | `42a26ffaecaaa787d8185e40c8ff33ee625f5779` | `42a26ffaecaaa787d8185e40c8ff33ee625f5779` |

`git diff --name-status origin/main <merged-tree>` = exatamente os dois arquivos
adicionados. Caminhos do worker/schema (`Dockerfile`, `src/server.mjs`,
`manifest.json`, `manifest.sha256`, `schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd`,
`package.json`) **presentes** na árvore mesclada.

## 13. Workflow — visão geral

`.github/workflows/fiscal-xsd-worker-supply-chain.yml` (211 linhas). Dois jobs em
`ubuntu-24.04`: **build-connected** (build+SBOM+scan+bundles) e **verify-offline**
(load do archive + prova de isolamento/egress + testes XSD + lock). Concurrency
por `github.ref` com `cancel-in-progress: true`. `defaults.run.shell: bash`.

## 14. Triggers

`on: workflow_dispatch` **único** (com input booleano `allow_branch_override`,
default `false`). **Ausentes:** `push`, `pull_request`, `pull_request_target`,
`schedule`, `workflow_run`, `repository_dispatch`. Sem trigger automático.

## 15. Permissions

`permissions: contents: read` no nível do workflow. **Nenhuma** permissão
`write`. **Sem** `id-token: write`. **Sem** `secrets.*`, sem `GITHUB_TOKEN`
explícito. Permissão **mínima**.

## 16. Actions e SHAs

Todas as 6 Actions são oficiais e pinadas por **SHA completo de 40 hex**
(conferido caractere a caractere; sem `@main/@master/@vN/@latest`). SHAs batem
com o inventário `out/actions.json` embutido e com a lista esperada:

| Action | SHA (40) | release (comentário/metadata) |
|--------|----------|-------------------------------|
| actions/checkout | `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` | v7.0.0 |
| actions/setup-node | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0 |
| actions/download-artifact | `37930b1c2abaa49bbe596cd826c3c89aef350131` | v7.0.0 |
| actions/upload-artifact | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | v7.0.1 |
| anchore/sbom-action | `e22c389904149dbc22b58101806040fa8d37a610` | v0.24.0 |
| aquasecurity/trivy-action | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | v0.36.0 |

Nenhuma Action de organização pessoal, desconhecida ou mutável. (Versões não
pesquisadas/atualizadas nesta auditoria, conforme escopo.)

## 17. Jobs, dependência e ordem

- **build-connected**: `timeout-minutes: 45`. Passos: guard de branch → checkout
  → preflight → build → inspect → registrar actions.json → SBOM → Trivy JSON
  (gate) → Trivy tabela → package → upload **intermediário** → upload
  diagnóstico `if: failure()` → cleanup `if: always()`.
- **verify-offline**: `needs: build-connected`, `timeout-minutes: 30`. Checkout →
  setup-node → `npm ci --ignore-scripts` → `npx prisma generate` →
  `fiscal:xsd:verify-hashes` → **download do artifact intermediário** →
  `verify-offline` (load + isolamento) → `test:fiscal-xsd:unit` (timeout
  fail-closed) → `generate-lock` → upload **final aprovado** → diagnóstico
  `if: failure()` → cleanup `if: always()`.

O segundo job **depende** do primeiro (`needs`) e **consome o artifact** do
primeiro (`download-artifact`). **Não reconstrói** a imagem — apenas
`docker load` do archive.

## 18. build-connected (parecer)

Build honesto e **conectado** (buildx `--load`, **sem** `--push`,
`--provenance=false`, `--no-cache-filter libxml2-builder` para forçar re-download
verificado). Base pinada por digest. Inspeção da imagem exige: `xmllint`
reportando gate `21503` e `2.15.3`; `User == 10001:10001`; entrypoint
`server.mjs`; healthcheck `healthcheck.mjs`; hash do schema manifest embutido ==
oficial; ausência de env com padrão sensível (falha se `secret|token|password|
senha|csc|certificad|api-key`). Parecer: **sólido**.

## 19. verify-offline (parecer)

Runner **novo** (`needs` → job separado). `docker load` do archive; confere
`SHA256SUMS` (`--check --strict`) e **image ID** contra o metadata. Sobe o worker
em rede Docker `--internal` com `--read-only`, `--tmpfs /tmp` (noexec,nosuid,
nodev, uid/gid 10001), `--memory 768m`, `--cpus 1`, `--pids-limit 64`,
`--cap-drop ALL`, `--security-opt no-new-privileges:true`, `--network-alias
worker.internal`. Todos os limites são **reconferidos** via `docker inspect`.
Parecer: isolamento **enforçado**, não apenas "sem chamadas observadas".

> **Nota de escopo (honestidade):** "offline" refere-se ao **worker sob teste**,
> que é carregado do archive (não reconstruído) e provado sem egress pela rede
> interna. O **runner host** permanece conectado (faz `npm ci`, `prisma
> generate`, `docker pull` da base de teste pinada). Os contêineres de teste
> entram na **mesma rede interna** para falar com o worker e usam `node_modules`
> já instalado via volume — sem necessidade de rede para npm. O cabeçalho do
> workflow descreve corretamente "prova o runtime SEM egress", sem alegar build
> offline.

## 20. Egress

Zero-egress do worker é **enforçado**, não presumido:
`docker network inspect --format '{{.Internal}}'` deve ser `true`; e duas sondas
**devem falhar** (fail = prova): `fetch('https://www.nfe.fazenda.gov.br', timeout
3s)` e `dns.lookup('www.nfe.fazenda.gov.br')`. Se qualquer sonda **conseguir**
sair, o script aborta (`die`). Não há chamada real à SEFAZ — as sondas são
controles negativos de isolamento.

## 21. Docker / Buildx

`DOCKER_BUILDKIT=1 docker buildx build`. Build com `--load` (Docker archive via
`docker save`) e, no `package`, `--output type=oci,dest=...` (OCI archive real).
Sem `docker login`, sem `docker push`, sem registry.

## 22. libxml2 / patch / libgnutls (proveniência — cruzada com o código real)

Constantes do script conferidas 1:1 contra `workers/fiscal-xsd/Dockerfile`
(na `main`):

| Item | Valor | Fonte confirmada |
|------|-------|------------------|
| base node | `node:20.20.2-bookworm-slim@sha256:2cf067c…febfc0` | Dockerfile L2 / script / env do YAML |
| libxml2 | `2.15.3` | Dockerfile L5 |
| source SHA-256 | `78262a6e…c7a07` | Dockerfile L6 |
| source URL | `download.gnome.org/…/libxml2-2.15.3.tar.xz` | Dockerfile L8 |
| patch | `d3352554e4c1f052b914cda7b415d06b7eab5dfa` | Dockerfile L9 |
| patch SHA-256 | `ab319bb4…fb7c` | Dockerfile L7 |
| gate xmllint | `21503` | Dockerfile L33 |
| libgnutls30 | `3.7.9-2+deb12u7` (CVE-2026-33845/42010) | Dockerfile L52 |
| non-root | `USER 10001:10001` | Dockerfile L66 |

Downloads no build são **hash-verificados fail-closed** (`sha256sum --check
--strict`) e `--proto '=https' --tlsv1.2`.

## 23. Schemas

Pacote `PL_010e_v1.02`, layout `4.00`, modelo `65`, root `nfe_v4.00.xsd`. A pasta
`lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe` na `main` contém **exatamente os 5
XSDs oficiais** (DFeTiposBasicos_v1.00, leiauteNFe_v4.00, nfe_v4.00,
tiposBasico_v4.00, xmldsig-core-schema_v1.01). O hash do manifest esperado no
script (`EXPECTED_SCHEMA_MANIFEST_HASH = fc42d03e…49cae1`) **bate exatamente** com
`lib/fiscal/xsd/manifest.sha256` na `main`. **Nenhum** schema é baixado, alterado
ou tem fallback permissivo — apenas conferido.

## 24. SBOM

`anchore/sbom-action` (SHA-pinada) gera CycloneDX JSON com `upload-artifact:
false` (a inclusão no artifact é controlada pelo passo de upload). O
`mode_package` **aborta** se o SBOM não existir antes do empacotamento
(`[ -f SBOM ] || die`). SBOM é **obrigatório**.

## 25. Trivy (gate) / vulnerabilities

Trivy é **bloqueante**: `exit-code: "1"`, `severity: HIGH,CRITICAL`,
`vuln-type: os,library`. Não há `continue-on-error`, não há `.trivyignore`, não
há `exit-code: 0` permissivo. Reforço em `generate-lock`: recomputa
`critical`/`high` a partir do **JSON real** do Trivy e faz `die` se `!= 0`. Falha
do scanner impede lock aprovado, artifact final e estado de sucesso.

> **Nota de política (transparência):** os passos Trivy usam `ignore-unfixed:
> true`. O gate bloqueia HIGH/CRITICAL **com correção disponível**; vulnerabilidade
> sem fix upstream não bloqueia (e o campo `vulnerabilities` do lock, derivado do
> mesmo JSON, portanto contabiliza os **corrigíveis**). Política deliberada e
> comum; **não** é um ignore por-CVE nem um bypass do gate.

## 26. Docker archive vs OCI archive

Distintos e ambos gerados: **Docker archive** (`fiscal-…docker.tar` via `docker
save`, carregável por `docker load`) e **OCI archive** (`fiscal-…oci.tar` via
`buildx --output type=oci`). O digest do manifest OCI é extraído do `index.json`
**sem** push a registry. `SHA256SUMS` cobre ambos + SBOM + Trivy JSON + Dockerfile
+ manifest.

## 27. Artifacts

- **Intermediário** — `fiscal-xsd-worker-supply-chain-intermediate-<sha>`
  (`retention 7`, `if-no-files-found: error`); claramente **intermediário**,
  carrega o necessário para o segundo job. **Não** denominado "aprovado".
- **Final** — `fiscal-xsd-worker-offline-approved-<sha>` (`retention 7`); só após
  verify-offline + unit timeout + generate-lock. Contém Docker/OCI archives,
  SBOM, Trivy JSON, `SHA256SUMS`, `supply-chain.lock.generated.json`,
  `runtime-report.json`, `xsd-test-results.json`.
- **Falha** — `…-UNAPPROVED-<sha>` (`if: failure()`, `retention 3`).

Todos os artifacts são **privados** ao GitHub Actions e **nunca** commitados no
git.

## 28. Lock

`supply-chain.lock.generated.json` só é gerado em `generate-lock`, **após** o gate
`critical==0 && high==0`. Registra proveniência (commit, dockerfile/context sha,
actions pinadas, base image, libxml2/patch/libgnutls, pacote/layout/modelo/root
schema, manifest hash, image id, OCI manifest digest, archives sha, SBOM/Trivy
sha, `vulnerabilities`, `runtimeExternalEgress: blocked-enforced`,
`realSecrets:0`, `realData:0`, resultados positivo/negativos).

## 29. Runtime (parecer)

Ver §19/§20. Non-root `10001:10001`, rootfs read-only, tmpfs endurecido, memória/
cpu/pids limitados, `cap-drop ALL`, `no-new-privileges`, rede `--internal`,
healthcheck e readiness conferidos com integridade (libxml2 2.15.3 + schema
manifest hash no payload `/ready`). Sem proxy, sem secret mount, sem endpoint
SEFAZ, sem download dentro do container do worker. **Zero egress por
enforcement.**

## 30. Testes XSD

- **Positivo** — suíte de integração exerce XML válido + assinado via `xmllint`
  real dentro do worker (`test:fiscal-xsd:integration` →
  `container.integration.test.ts`).
- **Negativos (7)** — obrigatório ausente, elemento inesperado, ordem inválida,
  tipo inválido, namespace incorreto, payload acima do limite, timeout
  fail-closed (este provado deterministicamente por unidade,
  `test:fiscal-xsd:unit`). Suíte de segurança (`container.security.test.ts`)
  cobre XXE/http/file/traversal/injeção.

Enforcement: as suítes rodam na rede interna; **exit-code != 0 ⇒ `die`** (falha do
workflow). A injeção nunca materializa arquivo (`test ! -e /tmp/xsd-injection-
probe`). Healthcheck/readiness reconferidos após os negativos (fila recuperada).

> **Nota de precisão:** os rótulos por-negativo e `negativesPassed:7` no
> `xsd-test-results.json`/lock são **descritores estáticos** do que as suítes
> cobrem, gravados **somente** após as suítes passarem (exit 0). O enforcement
> real vem do **exit-code das suítes** (fonte da verdade nos testes já na `main`),
> não de uma contagem por-caso feita pelo script. Sem mock, sem composition-gate,
> sem XML operacional real.

## 31. Secrets

`rg` por `secret|token|password|Authorization|CSC|idToken|BEGIN PRIVATE KEY|…`
nos dois arquivos: **nenhum segredo real**. As ocorrências são (a) comentários de
**negação** ("não usa segredo/CSC/certificado"), (b) a checagem **defensiva**
`grep -Ei '(secret|token|password|senha|csc|certificad|api-key)'` que **falha** o
build se a imagem tiver env sensível. Nenhum `secrets.*`, `GITHUB_TOKEN`, chave
ou credencial.

## 32. Dados reais

**Nenhum.** Sem CNPJ/CPF, sem `rafacell`, sem `loja-1`, sem storeId, sem XML
operacional, sem endpoint SEFAZ. URLs externas presentes são apenas (a)
`worker.internal` (rede interna), (b) constantes de **proveniência** libxml2
(gnome.org, github.com) fetchadas no build hash-verificado, (c) a sonda de egress
que **deve falhar**.

## 33. Contador HUB

**Não alterado.** O diff não toca `app/dashboard/contador`,
`components/dashboard/contador` nem `lib/contador`. O avanço da main é do Contador
007/007B e é disjunto desta infra (§7).

## 34. GOAL-005 técnico

**Não alterado.** `work/fiscal-dry-run-integrity-proof-005 @ d4dfcf1` (PARCIAL)
permanece intocado. O diff não inclui harness dry-run, C14N, XSD schema ou código
produtivo fiscal — apenas os dois arquivos de infra que **orquestram** o worker
já existente na `main`.

## 35. Risco

**Baixo.** Superfície: dois arquivos aditivos; workflow **manual**, permissão
`contents: read`, sem registry, sem segredo, sem escrita em repositório, artifacts
privados. Pior caso de execução: constrói/escaneia/prova uma imagem e sobe
artifacts privados. Guard de branch (fail-closed) restringe execução à branch do
GOAL, com override **explícito, default-off e human-gated**.

## 36. Classificação

**A — PRONTO PARA PR DE INFRAESTRUTURA.**

Critérios atendidos: exatamente dois arquivos; um commit próprio; interseção
vazia/segura; merge-tree limpo (blobs idênticos); `workflow_dispatch` único;
`permissions: contents: read`; nenhuma permissão write; Actions pinadas por SHA
(match esperado); `bash -n` verde; Trivy obrigatório com HIGH/CRITICAL
bloqueantes; runtime zero-egress enforçado; positivo + negativos obrigatórios;
nenhum registry; nenhum secret; nenhum dado real; nenhum arquivo do GOAL-005
técnico; `main` atual compatível (npm scripts, caminhos e proveniência presentes).

### Observações (não-bloqueantes, transparência)

1. **Cleanup por `if: always()`, não por `trap` bash.** O script não define
   `trap … EXIT/ERR`; a limpeza (`docker rm/network rm/image rm`, sem
   `system prune`) é garantida pelos passos `cleanup` com `if: always()` em ambos
   os jobs. Correto para o desenho "um step por modo" (um trap dentro de uma
   invocação de modo não limparia recursos criados em outro step). `set -Eeuo
   pipefail` presente; `-E` é inerte sem trap de ERR (redundância benigna).
2. **`ignore-unfixed: true` no Trivy** — gate escopado a vulnerabilidades
   corrigíveis (§25). Política deliberada, não bypass.
3. **Operacional do guard de branch** — ver §37.

Nenhuma observação atinge gatilho de classe B/C/D.

## 37. Estratégia de integração

- Integrar por **PR dos dois arquivos** (`squash`/fast-forward) — a branch está
  **1 à frente / 0 atrás** da `main`, merge-tree exit 0. Sem rebase necessário.
- **Após o merge na `main`**, o workflow passa a aparecer em Actions (só aparece
  quando existe no branch default). **Ponto operacional:** o **guard de branch**
  exige `GITHUB_REF == refs/heads/work/fiscal-xsd-worker-gha-supply-chain-005a`,
  a menos que `allow_branch_override=true`. Portanto, para **executar** após o
  merge, o operador deve:
  - disparar selecionando a branch `work/fiscal-xsd-worker-gha-supply-chain-005a`
    (que precisa continuar existindo em `origin`); **ou**
  - disparar a partir da `main` marcando o input `allow_branch_override=true`
    (uso explicitamente autorizado).
  Isso é **fail-closed** e intencional (evita execução acidental). Recomenda-se,
  em PR **futuro e separado** (fora deste escopo), alinhar `EXPECTED_REF` à
  realidade de operação pós-merge, se o time preferir disparar direto da `main`.
- **Não** abrir PR, **não** disparar workflow, **não** fazer merge nesta tarefa.

## 38. Conclusão

Os dois arquivos de infraestrutura são **aditivos, seguros e compatíveis** com a
`origin/main` atual (`7217acb`). O workflow é **manual**, com **permissão
mínima**, **Actions pinadas por SHA**, **Trivy bloqueante**, **runtime zero-egress
enforçado**, **sem registry/segredo/dado real**, e **não** toca Contador HUB nem o
GOAL-005 técnico. O merge-tree é limpo e byte-idêntico ao auditado.
**Classificação A — apto para PR de infraestrutura.** Próximo passo (fora deste
escopo): abrir o PR dos dois arquivos.

---

### Metadados da auditoria

| Campo | Valor |
|-------|-------|
| GOAL | FISCAL-XSD-WORKER-GHA-SUPPLY-CHAIN-005A-INFRA-MERGE-READINESS |
| origin/main | `7217acbf378e618c4d6409500f8467038f6922f8` |
| branch auditada | `work/fiscal-xsd-worker-gha-supply-chain-005a` |
| commit auditado | `ba85e417c0359fec7c3c37edc3fb511365c5a30a` |
| merge-base | `7217acbf378e618c4d6409500f8467038f6922f8` |
| ahead / behind | 1 / 0 |
| merge-tree | exit 0 · árvore `c2cb09ef6553488680ee3e7b08b9df6fe6afbadd` |
| branch de auditoria | `audit/fiscal-xsd-gha-infra-readiness` |
| worktree | `C:/Projetos/wt-fiscal-xsd-gha-infra-readiness` |
| ferramentas de validação | `git`, `bash -n` (sintaxe), `rg`, `git merge-tree`, `sha256sum`. Sem parser YAML instalado — validação de YAML **estática/manual** (não por parser); workflow **não** executado. |
| classificação | **A** |
