# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Revisão Técnica do Gate H2

> Auditoria técnica independente da implementação do GOAL-005B (commit `86dd9ad`) para decidir se o
> **Gate H2** pode ser aprovado para o primeiro dispatch humano (H3) do workflow dedicado.
> Read-only: nenhuma alteração na branch implementada, no worker, no lock ou no manifesto; o workflow
> **não** foi executado.

---

## 1. Classificação

**A — Gate H2 APROVADO. Código pronto para o dispatch humano (H3).**

A implementação é tecnicamente correta, segura, honesta e passa em todas as validações locais. O
download cross-run está comprovadamente suportado pela versão fixada da action; o Java 17 está
comprovadamente disponível no runner; a comunicação com o worker real é à prova de falso-verde
(nenhum teste verde depende de mock ou composition-gate); a matriz 1+8 classifica corretamente; e os
invariantes de manifesto/exit-code/segurança se sustentam.

Não há defeito de código, de rede ou de segurança que bloqueie o dispatch. Restam **pré-requisitos
operacionais de dispatch** (não são correções de código) e **refinamentos opcionais não-bloqueantes**,
detalhados na §13 e na §14.

| Eixo | Veredito |
|------|----------|
| Download cross-run (run-id) | ✅ suportado pela SHA fixada (verificado no `action.yml`) |
| Java 17 no runner | ✅ `JAVA_HOME_17_X64` é default no `ubuntu-24.04` (17.0.19) |
| Fronteira offline da PROVA | ✅ worker + executor isolados na rede `--internal`; egress provado bloqueado |
| Comunicação real com o worker | ✅ sem falso-verde possível (host não resolve `worker.internal`) |
| Matriz 1 positivo + 8 negativos | ✅ classificação correta; transporte/timeout nunca contam como XSD |
| Manifesto parcial / hashes | ✅ byte-idêntico a `d4dfcf1`; invariância testada (XSD-H17) |
| Exit codes 0–4 | ✅ `classifyProofExit` intocado vs `d4dfcf1` |
| Segurança (DB/Prisma/SEFAZ/callers/creds) | ✅ zero em todos os eixos |
| Validações (tsc, testes, eslint, build, YAML, diff) | ✅ todas verdes |

---

## 2. Metodologia e escopo

- **Base:** `origin/main` = `f4ef866`.
- **Branch auditada:** `work/fiscal-dry-run-integrity-proof-005b` = **`86dd9ad`** (== `origin/work/...`).
- **Branch/worktree de auditoria:** `audit/fiscal-dry-run-005b-h2-review` em
  `../wt-fiscal-dry-run-005b-h2-review` (a partir de `origin/main`; delta = apenas este relatório).
- Revisão integral do workflow, dos arquivos do harness, do `.gitattributes`; leitura **read-only** do
  `supply-chain.lock.json` e do contrato do worker (`lib/fiscal/xsd-worker`, `lib/fiscal/xsd`,
  `workers/fiscal-xsd/src/{server,validator}.mjs`).
- Validações re-executadas na worktree implementada (`86dd9ad`, com `node_modules`), que permaneceu
  **limpa** após a auditoria (`git status` vazio).

---

## 3. Estado auditado

- `origin/main` = `f4ef8662908ba1a50920e65920a3f8165f5c6c23`.
- Commit auditado `86dd9ad151d618b37f238620eea8c5d62ce98291`; **pai = `f4ef866`** → **1 ahead / 0 behind**.
- `git diff d4dfcf1 86dd9ad` nos 7 arquivos reaplicados: `net-guard.ts`, `java-external.ts`,
  `fixtures.ts` e `evidence/manifest.json` **inalterados** (byte-idênticos); só `proof.ts`, `run.ts`,
  `proof.test.ts` mudaram, mais `matrix.test.ts` e `.gitattributes` novos.

---

## 4. Arquivos (10)

| Arquivo | Status | Nota de auditoria |
|---------|--------|-------------------|
| `.github/workflows/fiscal-dry-run-integrity-proof.yml` | novo (302 l.) | 2 jobs; YAML válido; sem CR/TAB |
| `tools/fiscal-dry-run-integrity-proof/.gitattributes` | novo (4 l.) | escopo do harness; ver §5 |
| `…/evidence/manifest.json` | reaplicado | **byte-idêntico a `d4dfcf1`** (parcial) |
| `…/fixtures.ts` | reaplicado | inalterado vs `d4dfcf1` |
| `…/java-external.ts` | reaplicado | inalterado vs `d4dfcf1` |
| `…/net-guard.ts` | reaplicado | inalterado vs `d4dfcf1` |
| `…/proof.ts` | +86 / −2 | additivo + `manifestXsdStatus` real→`approved-real`; `classifyProofExit` intocado |
| `…/proof.test.ts` | modificado | `XSD-H12`→`approved-real`; `XSD-H17`; seleção de adapter |
| `…/matrix.test.ts` | novo (282 l.) | matriz 1+8 Java-free |
| `…/run.ts` | modificado | `resolveXsdAdapterFromEnv()` no lugar do gate fixo |

O delta de `proof.ts` (removidas: só o comentário e a linha `"validated"` de `manifestXsdStatus`)
confirma mudança cirúrgica; nenhum caminho do composition-gate ou dos exit codes foi alterado.

---

## 5. `.gitattributes` — escopo

- **Caminho:** `tools/fiscal-dry-run-integrity-proof/.gitattributes` (dentro do harness).
- **Conteúdo:** `* text=auto eol=lf`.
- **Afeta somente o harness?** Sim — `.gitattributes` de subdiretório aplica-se apenas a esse diretório
  e subdiretórios. `86dd9ad` adiciona **exclusivamente** este arquivo (nenhum `.gitattributes` na raiz).
- **Altera a política de EOL do restante do repositório?** Não. Não há `.gitattributes` global; a
  política do repositório permanece inalterada.
- **Precedente:** o repositório **já** usa `.gitattributes` por diretório para artefatos fiscais
  byte-sensíveis: `lib/fiscal/xsd/.gitattributes` (`manifest.json -text`, `manifest.sha256 -text`) e
  `lib/fiscal/xsd/schemas/.gitattributes` (`*.xsd -text`, "conversão CRLF/LF invalidaria os hashes
  regulatórios"). O golden do harness é exatamente esse tipo de arquivo (comparado byte-a-byte).

**Veredito:** correto e **não** global nem excessivamente amplo — **não** é ajuste obrigatório.
Observação opcional (não-bloqueante): para alinhar exatamente ao precedente, poderia ser
`evidence/manifest.json -text` (alvo estrito no golden) em vez de `* text=auto eol=lf` (todo o harness).
A forma atual é benigna (só força LF em fonte texto, coerente com o blob commitado).

---

## 6. Artifact cross-run

- **Action/versão:** `actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131`. O comentário
  do repositório (`# v7.0.0`) não bate com o versionamento real da action, mas o **`action.yml` na SHA
  fixada define os inputs `name`, `run-id`, `github-token`, `repository`, `artifact-ids`** — ou seja, a
  versão fixada **suporta** o download cross-run. (Verificado no conteúdo bruto do `action.yml`.)
- **Permissões:** `permissions: { contents: read, actions: read }` — `actions:read` é necessário e está
  presente para baixar artifact de outro run.
- **github-token:** `${{ secrets.GITHUB_TOKEN }}`.
- **run-id:** `29669361609` (o run aprovado do 005A).
- **Nome do artifact:** `fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91`
  (sufixo = `repositoryCommit` do lock). ID `8436826125` registrado por rastreabilidade.
- **Expirado / ausente / divergente — fail-closed, sem fallback silencioso:**
  - **Expiração:** guard explícito (`date -d ARTIFACT_EXPIRES_AT`) falha **antes** do download com
    mensagem clara; a própria expiração no GitHub também faria o download falhar.
  - **Ausente/erro de download:** `actions/download-artifact` falha o job (sem `continue-on-error`).
  - **Divergência:** o job conectado valida o **lock âncora** do repo (`sha256==5402dca…340266e8`) e
    seus campos internos (`runId`, `dockerArchiveSha256`, `imageId`, `repositoryCommit`,
    `schemaManifestSha256`, `runtimeExternalEgress`); confere o **SHA-256 do Docker archive baixado**
    contra `dockerArchiveSha256` (`827e4b52…`) e o **lock gerado no bundle** byte-idêntico ao lock do
    repo. Qualquer divergência → `exit 1`. O job de prova **reconfere** o SHA do archive e o **imageId**
    após `docker load`.

**Veredito:** cadeia de proveniência sólida, ancorada no lock (não no artifact), fail-closed em todos
os ramos, sem fallback silencioso.

---

## 7. Fronteira offline

- **Último acesso à internet no host:** as etapas de **setup** do job de prova usam internet
  (`checkout`, `setup-node`, `npm ci`, `download-artifact`, `docker pull ${NODE_IMAGE}`) e o
  **upload de evidências** ao final. **A PROVA em si** (worker + executor do harness) roda em
  containers isolados.
- **Imagem Docker após o corte:** o **worker** (sujeito da prova) vem do **Docker archive aprovado**,
  carregado offline (`docker load`) e verificado por SHA/imageId — **não** é baixado. A base do
  **test-runner** (`node:20.20.2-bookworm-slim@sha256:2cf067…`, digest-pinned) é puxada com
  `docker pull` (linha 255) **depois** de a rede `--internal` já existir. Ver **Achado O-1** (§13).
- **Node/Java/deps disponíveis:** `setup-node 20.20.2` + `npm ci` + `npx prisma generate`; **Java 17**
  via `JAVA_HOME_17_X64` (default no `ubuntu-24.04`, 17.0.19). O harness só exige `javaRuntime`
  começando com `"17."` → satisfeito.
- **Worker + executor só na rede interna durante a prova:** worker sobe com `--network ${NETWORK}`
  (`--internal`) + alias `worker.internal`; o container executor do harness roda com
  `--network ${NETWORK}` também. Ambos isolados.
- **Nenhum passo da prova depende de DNS/endpoint externo:** o passo "Provar ZERO EGRESS" assevera
  `network.Internal == true` e que `fetch`/`dns.lookup` externos **falham** de dentro do worker; a
  matriz alcança apenas `worker.internal` (DNS embutido do Docker); o `proof.test.ts` no host roda sob
  net-guard (bloqueia egress externo). Não há dependência de SEFAZ ou endpoint público na prova.

---

## 8. Comunicação harness ↔ worker (prova de comunicação real)

- **Resolução de `worker.internal`:** DNS embutido do Docker resolve o `--network-alias worker.internal`
  para o IP do container do worker — **apenas para containers na mesma rede `--internal`**.
- **Onde o harness roda:** a **matriz** (`matrix.test.ts`) roda **dentro do container executor** na rede
  interna; o **`proof.test.ts`** (integridade + Java + net-guard, composition-gate) roda **no host**.
- **O host resolve `worker.internal`?** **Não.** É um alias de rede Docker interna; o host não o
  resolve. Por isso a matriz **precisa** rodar no container da rede interna — não há como "cair" em
  host/mock: se o worker não for alcançado, `validarXsd`/`runFiscalDryRunIntegrityProof` retornam
  `WORKER_INDISPONIVEL` e as asserções falham (vermelho), nunca verde-vazio.
- **Executor na mesma rede interna:** sim (`--network ${NETWORK}`).
- **Readiness, positivo e negativos usam o worker real:**
  - *Readiness:* `docker exec` no worker → `GET /ready` (libxml2 2.15.3 + schema `fc42d03e`).
  - *Positivo:* `runFiscalDryRunIntegrityProof({ xsdAdapter: createRealWorkerXsdAdapter() })` e assevera
    `xsdEvidence.kind === "xmllint-worker"`, `workerReal === true`, `realValidationPassed === true`,
    `xsdStatus === "xsd_ok"` — **impossível** sob composition-gate (kind `composition-gate`,
    `workerReal:false`).
  - *Negativos (schema):* `validarXsd(xml)` sem adapter → `createConfiguredXsdWorkerClient` →
    `worker.internal`; assevera `status === "xsd_invalido"`. Worker inacessível →
    `xsd_falha_infraestrutura` → falha.
- **Nenhum teste verde depende só de mock/composition-gate:** confirmado. O único uso de
  composition-gate é o `proof.test.ts` no host, que é **honesto** (`verification.xsd=false`, parcial) e
  **não** afirma validação XSD real. O negativo de **timeout** é determinístico via `fetchImpl`
  abortável (a forma correta de provar TIMEOUT de transporte, sem depender de o worker travar) — e
  classifica TIMEOUT, **não** valida XSD; não é falso-verde de validação.

---

## 9. Matriz 1 positivo + 8 negativos

- **Positivo (1):** XML assinado produzido pelo próprio harness, aprovado pelo XSD oficial real.
- **8 negativos:** campo obrigatório ausente, elemento inesperado, ordem inválida, tipo inválido,
  namespace incorreto, XML malformado → **XML_INVALIDO**; payload acima do limite → **política/
  transporte**; timeout → **TIMEOUT**.
- **Classificação:** `categorizeXsdOutcome` é um `switch` **exaustivo** sobre os 12 outcomes do contrato
  (`XsdValidationOutcome`) → `XSD_APROVADO` / `XML_INVALIDO` (XML_INVALIDO|XML_MALFORMADO) /
  `POLITICA_REJEITADA` / `TIMEOUT` / `FALHA_TRANSPORTE` (transitória/permanente/indisponível/incerta/
  hash/versão/pacote). `FALHA_SEGURANCA` (egress/DB/SEFAZ) é a fronteira do net-guard/exit 3, não um
  outcome do worker. Uma suíte de taxonomia determinística (offline) cobre os 12 mapeamentos.
- **Payload acima do limite:** via transporte HTTP o preflight do servidor (`requestIssue`) responde
  **422** → o cliente devolve `FALHA_PERMANENTE` → categoria `FALHA_TRANSPORTE`; in-process o validador
  responderia `POLITICA_REJEITADA` (`preflightXml`, `POLICY.maxPayloadBytes = 2 MiB`). A matriz aceita
  `["POLITICA_REJEITADA", "FALHA_TRANSPORTE"]` e assevera que **não** é `XML_INVALIDO` nem
  `XSD_APROVADO`. Correto nos dois caminhos.
- **Nenhuma rejeição de transporte contada como validação XSD:** garantido pela taxonomia — transporte,
  timeout e política **nunca** mapeiam para `XML_INVALIDO`, e apenas `VALIDACAO_APROVADA` é
  `XSD_APROVADO`.

---

## 10. Manifesto e hashes

- **`composition-gate` nunca retorna zero:** `classifyProofExit` (intocado) retorna **2** quando
  `!xsdWorkerReal` — o gate de composição mantém `xsdWorkerReal=false`, logo **exit 2**, nunca 0
  (testes EXIT-* e XSD-H10 verdes).
- **Manifesto continua parcial:** `evidence/manifest.json` é **byte-idêntico a `d4dfcf1`**
  (`proofState:"partial"`, `verification.xsd:false`, `blockingReasons:["XSD_WORKER_REAL_UNAVAILABLE"]`).
  O workflow tem um passo dedicado que **falha** se o golden não estiver parcial após a prova.
- **`--update-manifest` não é executado:** o workflow roda o `proof.test.ts` (P-10 só grava se
  `FISCAL_005_UPDATE_MANIFEST=1`, que não é setado) e o `matrix.test.ts` — nenhum grava o golden. A
  elevação (estado completo, `xsdStatus:"approved-real"`) é o passo **H4** via `run.ts --update-manifest`
  sob worker real.
- **Invariância dos hashes XML:** `XSD-H17` prova que elevar o manifesto ao estado completo preserva os
  5 hashes do fluxo XML + `DigestValue` (snapshot, XML não assinado, C14N referenciado, SignedInfo, XML
  assinado, DigestValue); `XSD-H16` fixa os valores exatos do GOAL-005.

---

## 11. Segurança e exit codes

- **Exit codes 0–4 coerentes:** `classifyProofExit` byte-inalterado vs `d4dfcf1` (prioridade
  3 segurança → 2 dependência/worker → 4 manifesto → 1 integridade → 0). Testes EXIT-0..4 verdes.
- **Zero banco / Prisma / SEFAZ / caller produtivo / credencial real:** nenhuma referência a Prisma,
  `DATABASE_URL` ou banco no harness; `createForbiddenSefazAdapter` proíbe SEFAZ; as probes de safety
  exigem `databaseWrites=0`/`sefazCalls=0`/`externalEgress=0`; nenhum código produtivo importa o harness
  (só docs e o próprio workflow citam o nome do goal); fixtures 100% sintéticas (stores
  `store-fiscal-proof-*`, cert de teste do GOAL-003). O workflow não usa segredo fiscal.

---

## 12. Validações re-executadas (na worktree `86dd9ad`)

| Validação | Resultado |
|-----------|-----------|
| `npx tsc --noEmit` (projeto inteiro) | **exit 0, 0 erros** |
| `vitest run tools/fiscal-dry-run-integrity-proof/ lib/fiscal/` | **349 passed / 28 skipped / 0 failed** |
| `eslint --max-warnings 0` (arquivos alterados) | **exit 0** |
| `npm run build` | **exit 0** (route table completa) |
| Validação YAML do workflow | **OK** (2 jobs, `permissions {contents:read, actions:read}`, sem CR/TAB) |
| `git diff --check` | **limpo**; worktree implementada permaneceu intocada |

Os 28 skips = suítes gated por `FISCAL_XSD_WORKER_URL` (matriz + realXsdSuite) e suítes de container —
esperado sem worker local. **Nenhum** teste verde depende de mock/composition-gate para afirmar XSD real.

---

## 13. Achados

Nenhum achado bloqueante. Os itens abaixo são **observações não-bloqueantes** (refinamento opcional) e
**pré-requisitos operacionais** de dispatch (não são correções de código).

- **O-1 (offline, opcional):** `docker pull ${NODE_IMAGE}` (linha 255) ocorre **depois** de a rede
  `--internal` ser criada. A imagem é digest-pinned e puxada no **host** (o executor só então entra na
  rede isolada), espelhando o padrão do 005A (`verify-offline`, auditado classe A). O **sujeito da
  prova** (worker) não é baixado após o corte — vem do archive aprovado. *Refinamento:* pré-puxar
  `${NODE_IMAGE}` **antes** da criação da rede `--internal`, para que nenhum `docker pull` ocorra após o
  corte. Não afeta a segurança da prova (executor isolado; imagem imutável).
- **O-2 (`.gitattributes`, opcional):** `* text=auto eol=lf` é mais amplo que o precedente do repo
  (`-text` em arquivos byte-sensíveis específicos). Harness-scoped e benigno; poderia ser estreitado a
  `evidence/manifest.json -text`.
- **P-1 (operacional, pré-requisito de dispatch):** o workflow 005B **não está na `main`**. Todos os
  demais workflows fiscais (`fiscal-xsd-worker-supply-chain.yml`, `fiscal-c14n-external-proof.yml`,
  `fiscal-xsd-worker.yml`) **estão** na `main`. O `workflow_dispatch` só é disparável pela UI quando o
  arquivo existe no branch default. O 005A foi dispatchado assim: seu workflow chegou à `main` (PR #11,
  `98e05df`) **antes** do run bem-sucedido `29669361609`. **Primeiro passo do H3:** landar o workflow na
  `main` (merge do branch de trabalho ou PR mínimo só do workflow) e então disparar selecionando o
  branch de trabalho — o guard `EXPECTED_REF=refs/heads/work/...005b` permite exatamente isso.
- **P-2 (janela de tempo):** o artifact aprovado `8436826125` **expira 2026-07-26T01:59:00Z**. O
  dispatch deve ocorrer antes disso; caso contrário o guard de expiração falha-fechado (correto) e será
  necessário renovar o bundle via 005A.

---

## 14. Decisão do Gate H2 e próximo passo

**Gate H2 = A (APROVADO).** O código do workflow e do harness está pronto, correto e seguro para o
primeiro dispatch humano. As duas verificações de maior risco foram resolvidas em favor da aprovação:
o **download cross-run** é suportado pela SHA fixada, e o **Java 17** está disponível por default no
`ubuntu-24.04`. A comunicação real com o worker é à prova de falso-verde, a matriz é correta, e os
invariantes de manifesto/exit-code/segurança se sustentam.

**Próximo passo (H3 — dispatch humano), na ordem:**
1. **Landar o workflow na `main`** (P-1) — pré-requisito para o `workflow_dispatch` aparecer na UI.
2. (Opcional) aplicar O-1 (pré-pull de `${NODE_IMAGE}`) e O-2 (estreitar `.gitattributes`).
3. **Disparar** "Fiscal Dry-Run Integrity Proof (005B)" selecionando o branch
   `work/fiscal-dry-run-integrity-proof-005b`, **antes de 2026-07-26T01:59Z** (P-2).
4. Após a prova real verde, **H4**: `run.ts --update-manifest` sob o worker real eleva o golden ao
   estado completo (`verification.xsd=true`, `xsdContract=true`, `xsdStatus=approved-real`,
   `xsdEngineName=xmllint`, `xsdWorkerReal=true`, `proofState=complete`, `blockingReasons=[]`).

---

*Auditoria read-only. `origin/main` intocado; branch implementada intocada; workflow não executado;
manifesto e golden não regenerados.*
