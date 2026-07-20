# FISCAL — Auditoria para Integração do Worker XSD Real na Prova de Dry-Run (GOAL-005B)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B-FORMAL-AUDIT` |
| Nome humano | Auditoria para Integração do Worker XSD Real na Prova de Dry-Run Fiscal |
| Tipo | **somente auditoria documental** — nenhum código, workflow, Dockerfile, worker, harness, lock ou schema alterado |
| Data | 2026-07-20 |
| Repositório | `rafaelfaria49-png/omni-gestao-pro-pdv-claude` |
| Branch de auditoria | `audit/fiscal-dry-run-005b-formal-audit` |
| Worktree | `C:\Projetos\wt-fiscal-dry-run-005b-formal-audit` |
| Base | `origin/main` = `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6` |
| **Classificação** | **B — pronto após ajuste documental pequeno** (ratificar escopo + resolver base do harness). Resolvível a **A**. |
| Limitação | host **sem** `gh`/`GITHUB_TOKEN`/Docker → artifact/run verificados por **lock byte-idêntico + relatório 005A**, não por API viva |

---

## 1. Objetivo

Auditar o estado real da `main` após o fechamento do **GOAL-005A** (supply chain offline do
worker XSD) e **definir o menor escopo seguro** para o futuro **GOAL-005B**, sem implementar nada.

O 005B deverá, no futuro (fora desta auditoria):

1. usar o **bundle offline aprovado** do worker XSD (005A);
2. iniciar o worker em ambiente **isolado** (rede Docker interna);
3. validar o **XML assinado produzido pelo harness** (GOAL-005) no **xmllint real**;
4. executar **casos XSD negativos reais**;
5. preservar **determinismo, idempotência e zero egress**;
6. atualizar **honestamente** o manifesto e as evidências (parcial → completo);
7. **fechar o eixo XSD real** do GOAL-005;
8. **não** emitir, **não** persistir, **não** chamar SEFAZ.

Esta tarefa produz **um único arquivo**: este relatório.

---

## 2. Estado (resumo executivo)

| Item | Estado verificado |
|---|---|
| `origin/main` | `a40ff5c…` (PR #13 merge) |
| GOAL-005A (worker + workflow + lock) | **integrado e fechado na main** ✓ |
| Lock `supply-chain.lock.json` | **presente e válido** — SHA-256 `5402dca9…` byte-conferido na main ✓ |
| Transporte `createXsdWorkerHttpClient` | **na main** (`lib/fiscal/xsd-worker/client.ts`) ✓ |
| Ponte `validarXsd` → worker real | **na main** (`lib/fiscal/dry-run/dry-run-validation.ts`) ✓ |
| Worker `xmllint` 2.15.3 | **na main** (`workers/fiscal-xsd/**`), contrato compatível com o cliente ✓ |
| **Harness GOAL-005** (`tools/fiscal-dry-run-integrity-proof/`) | **NÃO está na main** — só em `work/fiscal-dry-run-integrity-proof-005 @ d4dfcf1` ⚠️ |
| GOAL-005 técnico | **PARCIAL** (composition-gate; `proofState: partial`) |
| GOAL-005B | **não definido / não iniciado** — sem definição concorrente; esta auditoria é a única fonte |
| Artifact aprovado `8436826125` | expira **2026-07-26T01:59:00Z** (~6 dias); âncora permanente = **lock**, não artifact |
| Execução local | **impossível** neste host (sem Docker) → exige runner GitHub Actions (como 005A) |

**A descoberta central:** o **worker (005A) está na main**, mas o **harness (005) não está**. O 005B
modifica o harness — logo depende do harness estar presente na sua base. Este é o único gate
estrutural real, e é resolvível integrando trabalho **já implementado e testado** (não é nova
arquitetura).

---

## 3. Main

```text
origin/main = a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6
```

Log (topo, `--decorate`):

```text
a40ff5c (origin/main) Merge pull request #13 …/docs/fiscal-xsd-005a-post-merge-closure
ab0b754 fix(contador): fechar integridade dos limites do pacote MVP (GOAL 008D)
bd122d4 fix(contador): escopo, paginacao e timeout do pacote MVP (GOAL 008C)
a75ac2d fix(contador): alinhar contrato do pacote MVP (GOAL 008B)
2f99fff feat(contador): pacote do contador MVP sob demanda (GOAL 008)
55d578e (docs/fiscal-xsd-005a-post-merge-closure) docs(fiscal): fechar supply chain XSD 005A na main
2a7f102 Merge pull request #12 …/work/fiscal-xsd-worker-gha-supply-chain-005a
d512794 build(fiscal): registrar bundle offline aprovado do worker XSD
c0d4b00 fix(fiscal): usar builder container na exportação OCI
c7558d4 fix(fiscal): corrigir pin binário do libcap2
09ed270 fix(fiscal): remover pacotes vulneráveis do runtime XSD
2691521 fix(fiscal): validar versão numérica do xmllint
```

**Presente e verificado na `main`:**

- **Worker** (`workers/fiscal-xsd/`): `Dockerfile`, `Dockerfile.dockerignore`, `README.md`,
  `ci/supply-chain.sh`, `src/{cli,healthcheck,server,validator}.mjs`,
  `test/{container.integration,container.security,validator}.*`, **`supply-chain.lock.json`**.
- **Workflows**: `.github/workflows/fiscal-xsd-worker.yml`,
  `.github/workflows/fiscal-xsd-worker-supply-chain.yml`,
  `.github/workflows/fiscal-c14n-external-proof.yml`.
- **Contratos/cliente XSD**: `lib/fiscal/xsd/**`, `lib/fiscal/xsd-worker/**`, `lib/fiscal/dry-run/**`.
- **Fechamento documental** (PR #12 + PR #13): relatórios 005A + `CURRENT_STATUS`/`CONTINUATION`/`ROADMAP`.

**Ausente na `main`:** o harness `tools/fiscal-dry-run-integrity-proof/` (só existe em `d4dfcf1`).
Na `main`, sob `tools/`, existe apenas `tools/fiscal-c14n-proof/` (do GOAL-003).

---

## 4. GOAL-005A (integrado e fechado)

### PR #12 — merge técnico (worker + supply chain + lock)

```text
merge  2a7f102ce7bb22b363cd6d24b17920d483182640
parent 98e05dfe9aec224e5a7ea31f85bada19bed2913b   # main antes do PR #12
parent d51279461718508d94c534e9afe27232c73f0d6b   # HEAD da branch 005A
tree   5200c6e5bae316eab52475283dd8fdead8b438fb
```

Método: **merge commit** (sem squash, sem rebase). 5 commits preservados (`2691521`…`d512794`).
A árvore `5200c6e5…` é exatamente a árvore virtual prevista pela auditoria final de merge-readiness
do 005A → merge byte-limpo confirmado.

### PR #13 — merge documental (fechamento pós-merge)

```text
merge  a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6   # == origin/main atual
parent ab0b754e8b605b2d220be3f6610403bdcc483e0a   # main (contador 008D) antes do PR #13
parent 55d578e35264396081d082dc343ed99ca2c5ab2a   # conteúdo documental
```

`55d578e` (pai de conteúdo, filho de `2a7f102`) alterou **5 arquivos**: `docs/ai/CURRENT_STATUS.md`,
`docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`,
`docs/fiscal/FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md` (novo, 252 linhas),
`docs/fiscal/FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_REPORT.md`, `docs/roadmaps/ROADMAP_FISCAL.md`.

> Correspondência com o ESTADO CONHECIDO do prompt: "merge documental curto visível: A40FF5C" =
> `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6` (merge do PR #13); "commit documental 55d578e" =
> `55d578e35264396081d082dc343ed99ca2c5ab2a` (o conteúdo, 2º pai do merge). **Ambos confirmados.**

### Evidência técnica (inalterada pelo merge)

| Campo | Valor |
|---|---|
| Run | `29669361609` (#5) · `success` · 2/2 jobs |
| Commit do run/bundle | `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| Artifact final | `fiscal-xsd-worker-offline-approved-c0d4b00…` · ID `8436826125` |
| Artifact digest | `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e` |
| Lock SHA-256 | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` |
| Trivy | CRITICAL=0 · HIGH=0 |
| Runtime | offline · `externalEgress=blocked-enforced` |
| XSD | positivo `passed` · **7/7** negativos |

---

## 5. GOAL-005 (PARCIAL)

**Nome oficial:** `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` — "Prova de Integridade do Dry-Run Fiscal".

**Branch/estado:** `work/fiscal-dry-run-integrity-proof-005 @ d4dfcf1` (PUSHADO em origin), **não
mesclado**. Base = `ccb8b0f` (main antiga). `main` está **16 commits à frente**; o harness, **4 à
frente**. O harness adiciona **7 arquivos** de código/evidência (código com interseção **zero** com
a main) **e toca 4 docs compartilhados** (`CURRENT_STATUS`, `CONTINUATION`, `ROADMAP_FISCAL`,
report) que a `main` já mudou → **docs conflitam, código não**.

**Por que PARCIAL:** o critério #1 do GOAL-005 (worker XSD real confronta o XML com o schema) **não
foi satisfeito** — o run golden usou o `composition-gate` (nenhum `xmllint` real executou). O
manifesto golden diz honestamente `proofState: "partial"`, `verification.xsd: false`,
`blockingReasons: ["XSD_WORKER_REAL_UNAVAILABLE"]`. O runner classifica **exit 2** nesse estado
(dependência obrigatória ausente) — golden byte-igual **não** significa GOAL concluído.

**Histórico do GOAL (tabela 001–022):** o item **006** ("trocar o placeholder por validação XSD
real e fail-closed") já está cumprido **no worker** (G-C2 / GOAL nomeado 002). O que falta é ligar
esse worker real ao **harness de dry-run** — exatamente o eixo do 005B.

---

## 6. Definição do 005B (proposta desta auditoria)

> **Não existe definição concorrente ou contraditória.** Todas as menções a "005B" na `main`
> (`CURRENT_STATUS`, `CONTINUATION`, `ROADMAP_FISCAL`, relatórios 005A) dizem uniformemente
> "não iniciado / não iniciar sem definição e autorização separadas / não foi definido". Esta
> auditoria é a **única** fonte de escopo — sujeita a **ratificação humana**.

**Nome canônico proposto:** `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B` — "Integração do Worker XSD Real
na Prova de Dry-Run Fiscal" (fechamento do **eixo XSD real** do GOAL-005).

**Objetivo mínimo e fechado:** executar a prova de integridade do dry-run (GOAL-005) contra o
**worker XSD real** (bundle 005A) num runner isolado, comprovando que o XML NFC-e assinado que o
harness produz é **aceito pelo schema oficial** e que mutações são **rejeitadas**, e materializar um
manifesto honesto `proofState: "complete"` — **sem** alterar os 5 hashes do XML, **sem** emitir,
persistir ou chamar SEFAZ.

**Pré-requisitos:** GOAL-001/002/003/004 (fechados); worker 005A na main (✓); lock válido (✓);
harness GOAL-005 presente na base do 005B (**a resolver** — ver §13/§28).

**Limites (stop conditions):** sem caller produtivo, sem PDV/venda, sem SEFAZ/homologação/produção,
sem certificado/CSC/idToken reais, sem regra tributária, sem schema/migration, sem tocar Contador
HUB, sem binário no Git, sem registry, sem alterar o lock/worker/Dockerfile.

**Nível N:** N3 → **N4 apenas no eixo integridade-do-dry-run/XSD real**; **N6=0, N7=0**; **não fecha
o gate Fiscal global F4→F5** (ST/CSOSN 500, casos-alvo, provider seguem abertos).

---

## 7. Harness (auditoria técnica)

Localização: `tools/fiscal-dry-run-integrity-proof/` @ `d4dfcf1` (7 arquivos): `proof.ts` (644),
`run.ts` (165), `proof.test.ts` (818), `net-guard.ts` (319), `java-external.ts` (98), `fixtures.ts`
(155), `evidence/manifest.json` (59).

### Cadeia (o que o harness compõe, sem reimplementar)

`snapshot sintético` → `buildNfceXmlResult` (XML NFC-e 4.00) → `signNfceXmlDetailed` (XMLDSig
RSA-SHA1 + C14N 1.0, cert de teste GOAL-003) → `verifyNfceSignature` (interno) →
`verifySignedXmlExternalJava` (Java 17 / JSR 105, reusa `tools/fiscal-c14n-proof`) → **`validarXsd`
(adapter XSD)** → manifesto golden determinístico. Stores sintéticos `store-fiscal-proof-a|b`
(nunca `loja-1`); clock fixo `2026-01-15T12:00:00Z`.

### Ponto de injeção do adapter real — **já existe**

`proof.ts` (≈L348–356):

```ts
const xsd = await validarXsd(signedXml, { adapter: deps.xsdAdapter, storeId, correlationId, jobId })
// Sem adapter injetado, `validarXsd` cai no cliente do worker real (createConfiguredXsdWorkerClient).
const xsdEvidence = buildXsdEvidence(deps.xsdAdapter?.kind ?? "xmllint-worker", xsd)
```

O harness **já roteia para o worker real** quando **nenhum** adapter é injetado e
`FISCAL_XSD_WORKER_URL` está setado. O `composition-gate` só é usado quando **explicitamente**
injetado. Tipos já modelam os dois motores:

- `XsdEvidenceKind = "composition-gate" | "xmllint-worker"`;
- união discriminada `XsdEvidence` (composition-gate ⇒ `workerReal:false`/`engineName:"composition-gate"`;
  xmllint-worker ⇒ `workerReal:true`/`engineName:"xmllint"`/`engineVersion:string`);
- `buildXsdEvidence` (engine não-nulo ⇒ xmllint-worker; `realValidationPassed = xsd.status==="xsd_ok"`);
- `xsdRealValidationPassed` (único predicado que afirma XSD real);
- `assertXsdEvidence` (barreira de runtime contra combinação desonesta);
- `blockingReasonsFrom` (vazio ⇔ XSD real aprovado);
- `manifestXsdStatus` (composition-gate nunca vira "validated").

### Onde o `composition-gate` está pinado

**`run.ts:45`** — `const xsdAdapter = createCompositionXsdAdapter()` (hardcoded). É a **única** linha
que prende o runner ao gate de composição. O `run.ts` já contém a via `--update-manifest`
(regeneração controlada do golden) e a classificação de exit codes (`xsdWorkerReal:
r1.xsdEvidence.workerReal`). O delta de código do 005B é, portanto, **pequeno**.

### Por que o composition-gate NÃO pode ser confundido com validação XSD

Por **tipagem**: `XsdValidationEngine.name` é o literal `"xmllint"`; `valid:true` **exige** `engine`
não-nulo. O `composition-gate` devolve sempre `engine:null` e outcome `WORKER_INDISPONIVEL`
(contrato ok) ou `XML_INVALIDO` (contrato ruim) — **nunca** `VALIDACAO_APROVADA`. `assertXsdEvidence`
lança se alguém tentar declarar composition-gate como real. O manifesto serializa `xsd: false` +
`xsdContract: true` + `xsdEngineName: "composition-gate"` para que, **lido isolado** (PR/auditoria),
o artefato diga qual motor respondeu e o que falta. **Este é o defeito já corrigido em `d4dfcf1` e o
005B não deve reintroduzi-lo.**

---

## 8. Worker (auditoria técnica)

`workers/fiscal-xsd/` (na main). Transporte e contrato **já compatíveis** com o cliente.

### Contrato HTTP (`src/server.mjs`)

| Item | Valor |
|---|---|
| Bind | `0.0.0.0:8080` (`FISCAL_XSD_HOST`/`FISCAL_XSD_PORT`) |
| `GET /health` | `200 {status:"ok", service:"fiscal-xsd-worker"}` |
| `GET /ready` | `200 {status:"ready", engine}` via `validator.inspectIntegrity()`; `503` se falha |
| `POST /validate` | `200` resultado · `400` json/tamanho · `415` content-type · `422` envelope · `503` backpressure |
| Envelope | valida `jobId/storeId/correlationId` (`^[A-Za-z0-9._:-]{1,128}$`), `contractVersion`, `schemaVersion`, `schemaManifestHash`, `payloadBytes`, `xmlSha256` (secure-equal), `deadline` futuro |
| Idempotência | `jobHashes` (mesmo job + payload diferente ⇒ `HASH_DIVERGENTE`); cache por `jobId:storeId:xmlSha256:schema:manifestHash` |
| Concorrência | `POLICY.concurrency=1`; fila `MAX_QUEUE=32` |
| Timeouts | request 5s · headers 2s · keep-alive 1s |

### Motor (`src/validator.mjs`)

- `POLICY`: contract `1.0`, schema `PL_010e_v1.02/NFe/nfe_v4.00.xsd`, manifestHash `fc42d03e…`,
  libxml2 `2.15.3`, payload ≤ 2 MiB, output ≤ 64 KiB, timeout 3 s, concurrency 1.
- `xmllint` em `/opt/fiscal-xsd/bin/xmllint` (build estático custom, hash conferido).
- `inspectIntegrity()` → confere hash do manifesto, 5 XSDs (bytes+sha256), hash do binário, versão
  `2.15.3` → devolve `engine {name:"xmllint", xmllintVersion, libxml2Version, binaryHash,
  schemaPackage, schemaManifestHash}`.
- `validate()` → `preflightXml` (bloqueia DOCTYPE/ENTITY/schemaLocation/refs externas →
  `POLITICA_REJEITADA`/`XML_MALFORMADO`) → copia XSDs p/ tmp → `xmllint --noout --nonet --nocatalogs
  --schema <entry> -` com env restrito (`PATH=""`, `XML_CATALOG_FILES=""`, `LANG=C`) → exit
  0=`VALIDACAO_APROVADA`; 1/3/4=`XML_INVALIDO`/`XML_MALFORMADO`; 5=`PACOTE_XSD_AUSENTE`; timeout=`TIMEOUT`.
- Endurecimento runtime (005A, comprovado no lock/SBOM): non-root `10001:10001`, read-only rootfs,
  tmpfs `/tmp` noexec, `cap-drop ALL`, `noNewPrivileges`, mem 768 MiB, cpus 1, pids 64, network internal.

### Compatibilidade com o XML do harness

O harness monta a requisição via `validarXsd` (`lib/fiscal/dry-run/dry-run-validation.ts`) com
`contractVersion="1.0"`, `schemaVersion="PL_010e_v1.02/NFe/nfe_v4.00.xsd"`,
`schemaManifestHash=OFFICIAL_XSD_MANIFEST_SHA256`. **Verificado:** esse hash é **idêntico** ao
`POLICY.schemaManifestHash` do worker (`fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1`)
e as strings de schema batem. **Contrato alinhado ponta a ponta** (harness → `validarXsd` → cliente
→ worker). O worker aceitará a requisição do harness.

---

## 9. Lock

| Campo | Valor |
|---|---|
| Caminho | `workers/fiscal-xsd/supply-chain.lock.json` (na `main`) |
| SHA-256 do conteúdo | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` — **byte-conferido nesta auditoria** ✓ |
| `version` | `1.0.0` |
| `repositoryCommit` | `c0d4b00…` · `runId` `29669361609` |
| Estado | **presente e válido**; âncora imutável do bundle no repo |

O lock é a **prova permanente** da proveniência do bundle (imagem, libxml2 2.15.3, patch,
schemaManifestHash, Trivy 0/0, egress bloqueado). Read-only para o 005B.

---

## 10. Artifact

| Campo | Valor (fonte: relatório 005A / lock) |
|---|---|
| Nome | `fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| ID | `8436826125` |
| Digest | `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e` |
| Tamanho | `150047107` bytes (~150 MB) |
| Criado | `2026-07-19T01:59:09Z` |
| **Expira** | **`2026-07-26T01:59:00Z`** (`retention-days: 7`) |
| Conteúdo | 8 arquivos (docker.tar, oci.tar, cyclonedx.json, trivy.json, SHA256SUMS, lock.generated.json, runtime-report.json, xsd-test-results.json) |

**Verificação viva impossível neste host** (sem `gh`/`GITHUB_TOKEN`). O estado acima vem do
relatório 005A + lock. Hoje é **2026-07-20** → restam **~6 dias** de janela de download.

**Respostas obrigatórias (Fase 6):**

1. **O artifact estará disponível durante o 005B?** Só se o 005B rodar **antes de 2026-07-26**. Após
   isso, **não**. Portanto, o 005B **não deve depender** do artifact como fonte única.
2. **Consumir por ID, nome ou run?** Preferir **regenerar o bundle** (determinístico) via o job
   conectado da supply chain, conferindo contra o **lock** (`5402dca9…`). Se optar por download,
   usar **nome do artifact dentro do run** — nunca hard-code de ID como única via.
3. **O que falha de forma segura se expirar?** `actions/download-artifact` **falha fechado** (erro)
   → o run inteiro falha → **sem** "pass" falso. A conferência contra o lock capturaria qualquer
   divergência.
4. **Permitir regeneração via 005A?** **Sim** — é o mecanismo robusto e livre de expiração.
5. **É aceitável depender de artifact temporário para prova única?** Aceitável **só** se dentro da
   janela; para **reprodutibilidade**, **não** — a fonte reproduzível é o lock via build 005A.
6. **Que evidência permanente fica no Git?** O **manifesto honesto** (`evidence/manifest.json`), o
   relatório 005B e as atualizações de status. **Nunca** o binário/imagem/SBOM/Trivy brutos.

**Não** propor registry. **Não** guardar archive binário no Git.

---

## 11. Retenção

- Bundle 005A: **7 dias** (expira 2026-07-26T01:59:00Z). Intermediário e final ambos `retention-days: 7`.
- Âncora permanente: **lock textual** (`5402dca9…`) na `main` + relatórios documentais.
- Estratégia do 005B: **reprodução determinística** a partir do lock/fontes travadas, **não**
  dependência de artifact efêmero. Evidência permanente do 005B = manifesto honesto + relatório.

---

## 12. Workflow

O 005A usa `.github/workflows/fiscal-xsd-worker-supply-chain.yml` (`workflow_dispatch`,
`permissions: contents:read`, concurrency por ref, 6 Actions **pinadas por SHA**):

- **Job `build-connected`** (ubuntu-24.04): guard de branch, checkout, preflight, build
  `buildx --load`, inspect (gate xmllint 2.15.3), SBOM CycloneDX, **Trivy `exit-code:1`
  HIGH/CRITICAL `ignore-unfixed`**, package (Docker+OCI+SHA256SUMS), upload intermediário
  (`retention-days:7`), cleanup `if:always()`.
- **Job `verify-offline`** (ubuntu-24.04, `needs`): checkout, setup-node 20.20.2, `npm ci
  --ignore-scripts`, `prisma generate`, `fiscal:xsd:verify-hashes`, download intermediário,
  `verify-offline` (load do archive, rede `--internal`, zero egress, positivo + negativos),
  `test:fiscal-xsd:unit` (timeout fail-closed), `generate-lock`, upload final aprovado, cleanup.
- Env-chave: **`WORKER_URL=http://worker.internal:8080`** (rede Docker interna).

Este é o **molde** para o workflow do 005B.

---

## 13. Arquitetura (Fase 7 — opções avaliadas)

| Opção | Descrição | Veredito |
|---|---|---|
| **A** | **Novo workflow dedicado** `.github/workflows/fiscal-dry-run-integrity-proof.yml`, 2 jobs (conectado: build/regenera bundle e confere lock → offline: sobe worker, corta rede, roda harness) | **RECOMENDADA** |
| B | Estender a supply chain 005A com um **3º job** que roda o harness após `verify-offline` | Alternativa viável; mistura proveniências 005A/005B |
| C | Job adicional temporário na supply chain | Igual a B, porém mais frágil |
| D | Execução manual em host Docker | **Rejeitada** — sem proveniência reproduzível; este host não tem Docker |
| E | Outra (registry / binário no Git) | **Proibida** |

**Recomendação principal (A)** — novo workflow exclusivo do 005B:

- **Segurança/isolamento:** worker em rede `--internal`; harness sob `net-guard`; zero egress.
- **Proveniência:** proof 005B com run/manifesto próprios, sem contaminar o lock 005A.
- **Não mistura GOALs:** 005A = supply chain do worker; 005B = prova de dry-run. Auditável isolado.
- **Acesso ao bundle:** job conectado **regenera** o bundle das fontes travadas e **confere contra o
  lock** (`5402dca9…`) → **elimina a dependência de expiração** do artifact.
- **Manutenção:** reusa `workers/fiscal-xsd/ci/supply-chain.sh` (build/inspect/load) como caixa-preta;
  o job offline apenas **sobe o worker** e **roda `tsx run.ts`**.

**Alternativa (B)** — 3º job na supply chain 005A: usa o bundle recém-buildado no mesmo run (sem
janela de expiração), mas acopla 005A↔005B e re-dispara toda a cadeia a cada prova.

---

## 14. Rede (Fase 8 — modelo de duas fases)

| Fase | Rede | O que ocorre |
|---|---|---|
| **1 — conectada** | permitida | checkout, `npm ci`, `prisma generate`, `verify-hashes`, **build/regenera bundle** ou download do artifact, **confere contra lock** |
| **CORTE** | — | bundle carregado no Docker; worker prestes a subir. A partir daqui: **sem rede externa** |
| **2 — offline** | só loopback + `worker.internal` | worker sobe em rede Docker `--internal` como `worker.internal:8080`; harness roda **sob `net-guard`**; `FISCAL_XSD_WORKER_URL=http://worker.internal:8080` |

**Ponto exato do corte:** imediatamente **após** o `docker load` do archive e **antes** de o worker
começar a servir o harness (espelha o `verify-offline` do 005A).

**Comprovação de zero egress (defesa em profundidade):**

- Rede Docker **`--internal`** (kernel; mesmo enforcement `blocked-enforced` do 005A);
- **`net-guard.ts`** (runtime): allowlist só loopback (`127.0.0.1`/`::1`/`localhost`) + `*.internal`
  (idêntica a `client.ts`); barra **antes** de DNS/socket;
- **`client.ts`** só aceita host loopback/`.internal` (rejeita user/pass/query/hash);
- **`xmllint --nonet`** + env `PATH=""`/`XML_CATALOG_FILES=""` no worker.

Sem DNS externo, sem endpoint SEFAZ, sem banco, sem registry na fase offline, sem download após o corte.

---

## 15. Transporte

Já resolvido na `main` — o 005B **não escreve transporte novo**:

- `lib/fiscal/xsd-worker/client.ts` — `createXsdWorkerHttpClient({baseUrl, timeoutMs, allowedHosts,
  fetchImpl})` → `POST {baseUrl}/validate`, header `x-fiscal-xsd-contract: 1.0`, `cache:no-store`,
  `redirect:error`, AbortController; confere eco do envelope (jobId/storeId/correlationId/xmlSha256 +
  engine schema/manifest); limita saída a 64 KiB; mapeia 5xx→`FALHA_TRANSITORIA`, 4xx→`FALHA_PERMANENTE`,
  timeout→`TIMEOUT`; **allowlist loopback/`.internal`**.
- `createConfiguredXsdWorkerClient()` lê `FISCAL_XSD_WORKER_URL` + `FISCAL_XSD_WORKER_ALLOWED_HOSTS`.
- Testado em `lib/fiscal/xsd-worker/client.test.ts` (na main).

O 005B só precisa **selecionar** este cliente no runner (em vez do composition-gate) quando a URL
estiver configurada.

---

## 16. Manifesto

Formato atual (`evidence/manifest.json` @ `d4dfcf1`), campos-chave:

```json
"verification": { "internal": true, "externalJava17": true, "xsd": false,
  "xsdContract": true, "xsdStatus": "composition-gate", "xsdEngineName": "composition-gate",
  "xsdEngineVersion": null, "xsdWorkerReal": false, "structural": true },
"proofState": "partial", "blockingReasons": ["XSD_WORKER_REAL_UNAVAILABLE"]
```

**Campos que DEVEM mudar quando o XSD real passar:**

| Campo | Parcial (hoje) | Completo (005B) |
|---|---|---|
| `verification.xsd` | `false` | `true` |
| `verification.xsdContract` | `true` | `true` (mantém) |
| `verification.xsdStatus` | `"composition-gate"` | `"validated"` |
| `verification.xsdEngineName` | `"composition-gate"` | `"xmllint"` |
| `verification.xsdEngineVersion` | `null` | `"2.15.3"` (versão real do binário) |
| `verification.xsdWorkerReal` | `false` | `true` |
| `proofState` | `"partial"` | `"complete"` |
| `blockingReasons` | `["XSD_WORKER_REAL_UNAVAILABLE"]` | `[]` |

**Proveniência adicional (opcional, aditiva):** `binaryHash`, `libxml2Version` (o worker os devolve
no `engine`); opcionalmente `runId`/`imageId`/`lockHash` amarrando a prova ao bundle aprovado. Manter
**aditivo** para não quebrar a união discriminada nem `assertXsdEvidence`.

---

## 17. Golden

**Hashes que DEVEM permanecer idênticos** (descrevem a produção do XML, independente do XSD):

```text
snapshotSha256          efd6f54c362bddb781395514112ff3540418b868c854b1444b1122e8159bae2e
unsignedXmlSha256       5773978497ce4d63db0ca3e945f1df1306204b871d760bbf66d7e48cc9ffd488
referencedNodeC14nSha256 5126ad4885f1a6f843a3d8b8e59c3afac33591d199533b8afea82616172233f7
signedInfoSha256        449cc741f4187087090610abcaaf13195ee8fc82a045d8b91511254919421b69
signedXmlSha256         d9a3eead89deba74dbf2d6cf54db1562a3ef67c1b671e24a927d72127f3c84a2
```

+ bloco `signature` (C14N 1.0 / rsa-sha1 / sha1 / `digestValue=C2JM/I4Y6H7n1G7YopYEiVLuASw=`).

**Estratégia:**

- **Só o manifesto muda** (campos de `verification`/`proofState`/`blockingReasons`); os **5 hashes do
  XML e o `signature` permanecem byte-idênticos**.
- Golden **regenerado apenas** pelo modo `--update-manifest` **sob o worker real** (dentro do
  workflow), **nunca** editado à mão.
- **Teste obrigatório:** asserção de que os 5 hashes + `signature` do golden completo **igualam** os
  do golden parcial (invariância da cadeia XML). Se mudarem, algo alterou a produção do XML de forma
  ilegítima → falha.
- **Esta auditoria NÃO regenera nada.**

---

## 18. Positivo

**Critério:** o XML NFC-e **assinado real** produzido pelo harness (via `signNfceXmlDetailed`), ao
ser enviado ao worker (`POST /validate`), retorna `outcome: "VALIDACAO_APROVADA"`, `valid: true`,
`issues: []` e `engine` presente (`name:"xmllint"`, `xmllintVersion:"2.15.3"`, `binaryHash`,
`schemaManifestHash: fc42d03e…`) → `DryRunXsd.status = "xsd_ok"` → `xsdRealValidationPassed = true`.

---

## 19. Negativos (matriz mínima)

Mutar o **XML assinado do harness** e confirmar rejeição **na camada correta** (`statusFor` já
separa as camadas — **não confundir transporte com XSD**):

| # | Caso | Camada | Outcome esperado | `DryRunXsd.status` |
|---|---|---|---|---|
| 1 | Campo obrigatório ausente (ex.: remover `<natOp>`) | **XSD (schema)** | `XML_INVALIDO` | `xsd_invalido` |
| 2 | Elemento inesperado | **XSD** | `XML_INVALIDO` | `xsd_invalido` |
| 3 | Ordem inválida | **XSD** | `XML_INVALIDO` | `xsd_invalido` |
| 4 | Tipo inválido (ex.: `vNF` não-numérico) | **XSD** | `XML_INVALIDO` | `xsd_invalido` |
| 5 | Namespace incorreto | **XSD** | `XML_INVALIDO` | `xsd_invalido` |
| 6 | Malformado (tag não fechada) | **XSD/sintaxe** | `XML_MALFORMADO` | `xsd_invalido` |
| 7 | Payload acima do limite (> 2 MiB) | **Política do worker** (preflight) | `POLITICA_REJEITADA` | `xsd_politica_rejeitada` |
| 8 | Timeout fail-closed | **Operacional/transporte** | `TIMEOUT` | `xsd_falha_infraestrutura` |

**Classificação por origem:** 1–6 pertencem ao `xmllint`/schema; 7 ao worker (política preflight);
8 ao limite operacional/transporte. `422/415/503`/`HASH_DIVERGENTE` são **transporte** — jamais
contados como rejeição XSD. Os itens 1–5 e 7–8 já foram comprovados no 005A (7/7) contra os fixtures
do worker; o 005B os comprova contra o **XML do próprio harness**, fechando o laço.

---

## 20. Java

Mantido: `verifySignedXmlExternalJava` (Java 17 / JSR 105, reusa `tools/fiscal-c14n-proof`) confirma
`declaredDigestValue === signed.digestValue` e runtime `17.*`. Se `javac`/`java`/verificador
ausente → runner classifica **exit 2** (dependência obrigatória), **nunca 0**. Ortogonal ao XSD; o
005B não altera este eixo.

---

## 21. Determinismo

`run.ts` executa 5 provas: `r1=r2=r3` (mesma `signedXmlSha256`) ⇒ determinístico; comparação de
`snapshotSha256` ⇒ idempotente; `b1` (store B) diverge de `r1` e `a2==r1` ⇒ isolamento de loja. O
005B **preserva** essas 5 execuções e a asserção de que a validação XSD real **não** introduz
não-determinismo (o worker é fail-closed e idempotente por `jobHashes`/cache).

---

## 22. Idempotência

Dupla: (a) do harness — mesmo snapshot ⇒ mesmos hashes; (b) do worker — `jobId`+`xmlSha256` cacheados,
`HASH_DIVERGENTE` se um `jobId` for reusado com payload diferente. O 005B deve enviar `jobId`
determinístico por caso e confirmar que reenvio idêntico devolve o mesmo veredito.

---

## 23. Exit codes

Matriz atual (`classifyProofExit`, por prioridade) — **o 005B não deve enfraquecê-la**:

| Código | Condição |
|---|---|
| **3** | `databaseWrites>0 || sefazCalls>0 || externalEgress>0` (segurança — nunca mascarável) |
| **2** | `!dependencyAvailable || !xsdWorkerReal` (Java 17 / golden / **worker XSD real** ausente) — só composition-gate ⇒ **2**, nunca 0 |
| **4** | `!manifestMatches` (manifesto divergente do golden) |
| **1** | falha de integridade (`internal && externalJava17 && structural && xsdContract && deterministic && idempotent && tamperDetected && storeIsolation`) |
| **0** | todas as provas obrigatórias passaram |

**Classificação do 005B:** sucesso real → **0**; worker ausente → **2** (não 0); positivo rejeitado
→ **1**; negativo indevidamente aceito → falha de **teste** (`proof.test.ts`) → CI vermelha; egress
detectado → **3**; manifesto divergente → **4**; bundle inválido / golden ausente → **2**. **Evitar
retorno 0 se o worker real não executou** já é garantido por `!signals.xsdWorkerReal ⇒ 2`.

---

## 24. Persistência (zero)

Auditoria estática exige, e o harness já garante: `safety.databaseWrites/sefazCalls/externalEgress/
realCredentials/realData = 0`; `runFiscalDryRunIntegrityProof` **aborta** se qualquer probe for
não-zero; nenhum import de Prisma/DB no harness; stores **sintéticos** (`store-fiscal-proof-a|b`).

**Scans obrigatórios (005B):** `grep -R "@prisma|prisma|PrismaClient"` em
`tools/fiscal-dry-run-integrity-proof/**` e no novo workflow ⇒ **0**; nenhum acesso a
`prisma/schema.prisma`; nenhuma migration.

---

## 25. SEFAZ (zero)

`createForbiddenSefazAdapter()` **lança** ("provider SEFAZ é proibido no harness"); nenhum endpoint
SEFAZ; `net-guard` + rede `--internal` barram qualquer host externo. **Scans:** nenhuma URL
`*.sefaz.*`/`svrs`/`nfce`/`homolog`/`webservice` no harness ou workflow; nenhum `idToken`/CSC/cert
real. Zero emissão, cancelamento, inutilização, contingência, homologação, produção.

---

## 26. Segurança

- Rede: `--internal` + `net-guard` + `client` allowlist + `xmllint --nonet` (defesa em profundidade).
- Worker: non-root, read-only rootfs, `cap-drop ALL`, `noNewPrivileges`, tmpfs noexec, limites de
  mem/cpu/pids.
- Segredos: `realSecrets=0`; certificado **sintético** de teste (GOAL-003, `CN=NFCE-TESTE-NAO-FISCAL`).
- Serialização pública: `toPublicProofView` remove XML/chave; `assertSyntheticSafety` + guard contra
  `PRIVATE KEY`.
- Supply chain: bundle regenerado das fontes travadas + conferência de lock; Actions pinadas por SHA;
  Trivy 0/0 mantido.

---

## 27. Credenciais

Nenhuma credencial real necessária. Material: **cert sintético** de teste. Nenhum
`AUTH_SECRET`/`DATABASE_URL`/token SEFAZ/CSC/senha de A1. `FISCAL_XSD_WORKER_URL` aponta para
`worker.internal` (não é segredo). **Se alguma credencial real for exigida → STOP** (condição de
parada do 005B).

---

## 28. Arquivos (allowlist futura do 005B)

Depende da base escolhida (§13/§33):

**Caminho 1 — harness já na main (recomendado):** allowlist mínima (~5–8 arquivos):

- `.github/workflows/fiscal-dry-run-integrity-proof.yml` (**novo** workflow);
- `tools/fiscal-dry-run-integrity-proof/run.ts` (seleção de adapter: worker real quando URL setada);
- `tools/fiscal-dry-run-integrity-proof/proof.test.ts` (testes worker-real + invariância de hashes);
- `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` (golden regenerado, controlado);
- `tools/fiscal-dry-run-integrity-proof/proof.ts` (**opcional** — campos de proveniência aditivos);
- docs: relatório 005B + `CURRENT_STATUS` + `CONTINUATION` + `ROADMAP_FISCAL`.

**Caminho 2 — 005B carrega o harness:** acrescentar os **7 arquivos** do harness reaplicados de
`d4dfcf1` (~12–15 arquivos no total).

**Proibidos (read-only, blocklist):** `workers/**` (worker/Dockerfile/**lock**), `lib/fiscal/**`
(contratos/cliente/dry-run), `prisma/**`, `schemas`, os workflows 005A, `package.json`/lockfiles
(salvo script realmente necessário — preferir não), Contador HUB, qualquer binário/artifact.

**Lock = read-only. Worker = read-only.** Novo workflow **é necessário** (não existe workflow de
dry-run integrity proof).

---

## 29. Gates humanos

O 005B **exige** autorização humana explícita para:

1. **Ratificar o escopo** do 005B definido aqui (documentação);
2. **Decidir a base do harness** (Caminho 1 — landar o harness na main primeiro; ou Caminho 2 — carregar);
3. **Autorar e DISPARAR o workflow** — este host **não** tem `gh`/token → o humano dispara na UI do
   GitHub (Actions → Run workflow), como no 005A;
4. **Regenerar o golden** e **copiar o manifesto honesto** do artifact do run para a branch;
5. **Merge-readiness → PR → merge** (humano);
6. **Fechar o GOAL-005** — só após worker real executado, positivo+negativos verdes, manifesto honesto
   e gates conferidos.

Pontos de parada: qualquer necessidade de segredo real, schema/migration, SEFAZ/emissão,
persistência, binário no Git, ou artifact expirado sem reprodução ⇒ **STOP**.

---

## 30. Critérios de aceite

**GOAL-005B ENTREGUE NA BRANCH** (todos obrigatórios):

- [ ] worker XSD **real** executado contra o XML do harness (não composition-gate);
- [ ] **xmllint real** (2.15.3) emitiu veredito; `engine` presente e conferido;
- [ ] **positivo** aprovado (`VALIDACAO_APROVADA` / `xsd_ok`);
- [ ] **negativos** corretos, separados por camada (schema × política × transporte);
- [ ] **Java 17** aprovado (`digestValue` bate, runtime `17.*`);
- [ ] **determinismo** (r1=r2=r3), **idempotência** (snapshot + jobHashes), **isolamento** de loja;
- [ ] **egress zero** (net-guard + rede internal), **persistência zero**, **SEFAZ zero**;
- [ ] **manifesto honesto**: `proofState:"complete"`, `xsd:true`, `xsdWorkerReal:true`,
      `blockingReasons:[]`; **5 hashes do XML + `signature` inalterados**;
- [ ] **golden controlado** (regenerado só via `--update-manifest` sob worker real; teste de invariância);
- [ ] **testes verdes** (`proof.test.ts` + suíte); **`tsc --noEmit`=0**; **ESLint `--max-warnings 0`=0**;
      **`npm run build`=0** (harness fora do bundle; build deve seguir verde);
- [ ] **merge-readiness** classe A/A2.

**GOAL-005 FECHADO** (adicional):

- [ ] 005B mesclado na `main` via **PR** + **fechamento documental**;
- [ ] **eixo XSD real** da prova de dry-run fechado → **N4 nesse eixo**;
- [ ] **NÃO** fecha o gate Fiscal global F4→F5 (ST/CSOSN 500, casos-alvo, provider seguem abertos);
      **N6=0, N7=0** inalterados; Contador HUB intocado.

---

## 31. Riscos

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | **Harness não está na main** — 005B depende dele | Alta | Landar o harness (Caminho 1) OU carregá-lo (Caminho 2); ambos usam trabalho já pronto |
| R2 | **Artifact expira 2026-07-26** | Média | Regenerar bundle das fontes travadas + conferir lock; não depender do artifact |
| R3 | **Sem Docker/gh/token neste host** | Média | Execução só em runner GHA; humano dispara (como 005A) |
| R4 | Golden regenerado alterar hashes do XML | Média | Teste de invariância dos 5 hashes + `signature`; regenerar só via `--update-manifest` |
| R5 | Confundir composition-gate com XSD real | Baixa | Tipos já impedem; `assertXsdEvidence`; não tocar essa barreira |
| R6 | Confundir rejeição de transporte com XSD | Baixa | `statusFor` separa `xsd_invalido`/`xsd_politica_rejeitada`/`xsd_falha_infraestrutura` |
| R7 | Drift de docs entre harness (`d4dfcf1`) e main | Baixa | Reaplicar só o **código** do harness; escrever docs frescos contra a main atual |
| R8 | Deriva de escopo (emissão/SEFAZ/schema) | Alta se ocorrer | Stop conditions §29; scans §24/§25 |

---

## 32. Classificação

### **B — pronto após ajuste documental pequeno (resolvível a A)**

**Justificativa objetiva:**

- **Verde:** worker 005A na main; lock válido (`5402dca9…` byte-conferido); transporte
  (`client.ts`) e ponte (`validarXsd`) na main; contrato alinhado ponta a ponta (`fc42d03e…`);
  harness **já worker-ready** (ponto de injeção, união `XsdEvidence`, `classifyProofExit`,
  `--update-manifest` já existem); workflow-molde na main; `net-guard` mirror do client; **nenhuma
  definição concorrente** de 005B.
- **Ajuste pendente (pequeno, não-arquitetural):** (1) **ratificar** o escopo do 005B definido aqui;
  (2) **resolver a base do harness** — landar o harness na main (Caminho 1) OU carregá-lo no 005B
  (Caminho 2). Nenhum dos dois exige nova arquitetura, infra, schema ou segredo.
- **Por que não A:** há um pré-requisito estrutural real (harness fora da main) e o escopo ainda não
  foi ratificado. Chamá-lo A superestimaria a prontidão.
- **Por que não C:** não há mudança de arquitetura — o harness já suporta o worker real.
- **Por que não D:** o artifact expira, mas é **reproduzível** do lock; Docker existe no runner GHA
  (comprovado pelo 005A). Dependência de infra é o runner + disparo humano, não um bloqueio.
- **Por que não E/F/G:** definição **não** ambígua após esta auditoria; **sem** conflito com o
  planejamento (todos os docs pedem "definir 005B em separado"); não é um GOAL que "não deve começar".

> Se o humano escolher o **Caminho 2** (005B carrega o harness, ramificando da main), **não há PR
> pré-requisito** e a classificação efetiva sobe para **A** após a ratificação do escopo.

---

## 33. Próximo comando (recomendação — NÃO executar)

| Campo | Valor |
|---|---|
| **GOAL** | `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B` (integração do worker XSD real na prova de dry-run) |
| **Nível** | ALTA (execução em runner + evidência honesta + supply chain) |
| **IA** | 1ª Opus 4.8 · 2ª Sonnet 5 |
| **Branch** | `work/fiscal-dry-run-integrity-proof-005b` |
| **Worktree** | `../wt-fiscal-dry-run-integrity-proof-005b` |
| **Base** | `origin/main` (`a40ff5c…`). **Pré-passo (Caminho 1):** landar o harness `d4dfcf1` na main via merge-readiness + PR próprios; **ou (Caminho 2):** reaplicar o código do harness na branch 005B |
| **Allowlist** | novo workflow + `run.ts` + `proof.test.ts` + `evidence/manifest.json` (+ `proof.ts` opcional) + docs (§28); Caminho 2 adiciona os 7 arquivos do harness |
| **Blocklist** | `workers/**`, `lib/fiscal/**`, `prisma/**`, schemas, workflows 005A, lock, `package.json`, Contador HUB, binários/artifacts (read-only) |
| **Fases** | (1) preflight + base; (2) selecionar worker real no runner; (3) autorar workflow 2-jobs; (4) **humano dispara** run; (5) copiar manifesto honesto + regenerar golden controlado; (6) testes/tsc/eslint/build; (7) merge-readiness; (8) PR; (9) fechamento documental |
| **Critérios de parada** | segredo real, schema/migration, SEFAZ/emissão, persistência, binário no Git, artifact expirado sem reprodução, contrato harness×worker incompatível |
| **Commit esperado** | 1 commit de código/workflow/manifesto + 1 commit documental (ou conforme merge-readiness) |
| **Push** | branch de trabalho (fast-forward); **sem** amend/force/rebase |
| **Workflow** | **novo** `.github/workflows/fiscal-dry-run-integrity-proof.yml`; `workflow_dispatch`; Actions pinadas por SHA; `permissions: contents:read` |
| **Artifacts** | regenerar bundle das fontes travadas + conferir lock (`5402dca9…`); **não** depender de `8436826125`; evidência permanente = manifesto honesto |
| **Merge** | **merge commit** (sem squash/rebase), após auditoria de merge-readiness e aprovação humana |

---

## 34. Conclusão

O **GOAL-005A está integrado e fechado na `main`** (PR #12 `2a7f102…`; PR #13 documental
`a40ff5c…`); o **worker, o workflow de supply chain e o lock** (`5402dca9…`, byte-conferido) estão
na `main`. O **transporte** (`client.ts`) e a **ponte** (`validarXsd`) já estão na `main` e o
**contrato está alinhado ponta a ponta** (`fc42d03e…`). O **harness GOAL-005 já é worker-ready** — o
único ponto que o prende ao composition-gate é `run.ts:45`, e a via `--update-manifest`, a união
`XsdEvidence` e o `classifyProofExit` (composition-gate ⇒ exit 2) já existem. Portanto, o **delta de
código do 005B é pequeno**; o esforço real é de **execução em runner isolado + evidência honesta +
workflow**.

O **único gate estrutural** é que o **harness ainda não está na `main`** (vive em `d4dfcf1`, base
`ccb8b0f`), e o **artifact aprovado expira em 2026-07-26** (mitigável por regeneração a partir do
lock). Ambos se resolvem com trabalho já pronto e sem nova arquitetura/infra/segredo.

**Classificação: B — pronto após ajuste documental pequeno** (ratificar escopo + resolver base do
harness), **resolvível a A** pelo Caminho 2. O 005B fecha o **eixo XSD real** do GOAL-005 (N4 nesse
eixo) **sem** fechar o gate Fiscal global, **sem** emitir, persistir ou chamar SEFAZ. **N6=0, N7=0,
Contador HUB intocado.**

**Esta tarefa é somente auditoria — nenhum código, workflow, worker, harness, lock ou schema foi
alterado.**

---

### Limitações desta auditoria

1. Host **sem** `gh`/`GITHUB_TOKEN` → o artifact `8436826125` e o run `29669361609` foram verificados
   por **lock byte-idêntico na main + relatório 005A**, **não** por API viva do GitHub.
2. Host **sem** Docker → nenhuma execução do worker/harness foi feita; a compatibilidade foi
   comprovada por **leitura de contrato** (server.mjs × client.ts × types.ts × dry-run-validation.ts)
   e por **igualdade de hashes** (`fc42d03e…`, `5402dca9…`).
3. TypeScript/testes/build: **não aplicáveis** (auditoria documental). Registrado honestamente.
4. WIP externo (outras branches/worktrees) foi **preservado e ignorado** — não incorporado, não
   restaurado, não usado como bloqueio.
