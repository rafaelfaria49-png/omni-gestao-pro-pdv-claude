# Ratificação do Escopo e da Base do Harness do GOAL-005B

**GOAL desta ratificação:** `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B-SCOPE-RATIFICATION`

**Data:** 20/07/2026 · **Natureza:** exclusivamente documental · **Código alterado:** nenhum.

> Este documento **define** o GOAL-005B e **ratifica** sua base técnica. Ele **não** inicia a
> implementação, **não** reaplica o harness, **não** cria workflow, **não** baixa artifact,
> **não** executa Docker e **não** altera manifesto ou golden.

---

## 1. Objetivo

Resolver documentalmente os dois únicos pontos que mantinham o GOAL-005B na classe **B** na
auditoria formal, fixando:

1. o **escopo oficial** do 005B (até aqui não ratificado);
2. a **proveniência e a base** do harness do GOAL-005 (até aqui fora da `main`).

Com esta ratificação integrada, o 005B passa a estar **apto a ser implementado** — sem que esta
tarefa inicie qualquer implementação.

## 2. Decisão humana ratificada

**CAMINHO 2 — O GOAL-005B CARREGA O HARNESS.**

Não se cria um GOAL separado apenas para publicar o harness. A entrega técnica do 005B será
**atômica** e conterá: reaplicação consciente do harness de `d4dfcf1` sobre a `main` atual,
preservação dos controles já validados, workflow dedicado, consumo do bundle aprovado do 005A,
execução real do `xmllint`, atualização honesta do manifesto, regeneração controlada do golden,
evidências e relatório — **sem emissão, sem persistência e sem chamada SEFAZ**.

## 3. Auditoria de origem

| Campo | Valor |
|---|---|
| Branch | `audit/fiscal-dry-run-005b-formal-audit` |
| Commit | `818253b91ad33d96fdf004cbbc71b5a908e943dc` |
| Mensagem | `docs(fiscal): auditar integração XSD real do GOAL-005B` |
| Autor / data | Rafael Faria · 2026-07-20 09:45:52 -0300 |
| Classificação emitida | **B — pronto após ajuste documental pequeno** |

## 4. Por que a classificação era B

A auditoria **não** apontou defeito de arquitetura nem de contrato. Apontou exatamente dois
pendentes, ambos de natureza documental e de base:

1. **escopo oficial do 005B não ratificado** — não existia decisão humana formal sobre quem
   carrega o harness;
2. **harness do GOAL-005 não está na `main`** — vive apenas em `d4dfcf1`, fora da linha principal.

## 5. Resolução para A

| Pendência | Resolução nesta ratificação | Estado |
|---|---|---|
| Escopo oficial não ratificado | Fases 5–14 deste documento fixam escopo, arquitetura, política de artifact, manifesto/golden, matriz, exit codes, gates, allowlist e blocklist | **RESOLVIDA** |
| Harness fora da `main` | Caminho 2 ratificado: o próprio 005B reaplica o harness; proveniência auditada na §11 e compatibilidade comprovada na §12 | **RESOLVIDA (por decisão + prova de compatibilidade)** |

**Classificação resultante: A — PRONTO PARA IMPLEMENTAÇÃO APÓS INTEGRAÇÃO DESTA RATIFICAÇÃO.**

A classe A é condicionada à **integração desta ratificação na `main`** (Gate H1). Enquanto este
documento não estiver na `main`, o 005B permanece **definido, não iniciado**.

## 6. `main` de referência

| Campo | Valor |
|---|---|
| `origin/main` | `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6` |
| Tipo | merge commit (PR #13) |
| Pais | `ab0b754e8b605b2d220be3f6610403bdcc483e0a` + `55d578e35264396081d082dc343ed99ca2c5ab2a` |
| Conferida em | 20/07/2026, após `git fetch origin --prune` |

A `main` **não avançou** além do estado esperado no comando: o hash conferido é idêntico ao
previsto. Nenhuma implementação 005B concorrente existe (§ verificação abaixo).

**Verificação de concorrência:** a única referência `005b` no repositório — local e remota — é a
branch de auditoria `audit/fiscal-dry-run-005b-formal-audit` @ `818253b…`. Não há branch, worktree
ou commit de implementação 005B. WIP externo de outras trilhas foi **preservado e ignorado**.

## 7. PR #12 — supply chain do worker XSD (005A)

| Campo | Valor |
|---|---|
| Merge commit | `2a7f102ce7bb22b363cd6d24b17920d483182640` |
| Contido em `origin/main` | **SIM** (ancestral confirmado) |
| Conteúdo | bundle offline aprovado do worker XSD, `ci/supply-chain.sh`, lock materializado |

## 8. PR #13 — fechamento documental pós-merge do 005A

| Campo | Valor |
|---|---|
| Merge commit | `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6` (é a própria `origin/main`) |
| Branch de origem | `docs/fiscal-xsd-005a-post-merge-closure` @ `55d578e…` |
| Conteúdo | fechamento documental do 005A na `main` |

**Merge documental completo:** confirmado. 005A está técnica e documentalmente fechado na `main`.

## 9. Harness — o que é

O harness é a prova offline de integridade do dry-run fiscal construída no GOAL-005: compõe
snapshot → XML builder → C14N → signer → verificador interno → verificador externo Java →
validação XSD (por adapter), sob intercept de egress, com relógio e seed fixos e material
criptográfico sintético.

Ele **já está implementado e validado** nos eixos não-XSD. O que falta — e é o objeto do 005B — é
substituir o adapter XSD de composição pela execução do **worker XSD real**.

## 10. Commit do harness

| Campo | Valor |
|---|---|
| Hash completo | `d4dfcf15b600bf46f51c347e99656800d1ec201a` |
| Mensagem | `fix(fiscal): tornar evidência XSD explicitamente parcial` |
| Autor / data | Rafael Faria · 2026-07-17 09:20:47 -0300 |
| Branch viva | `work/fiscal-dry-run-integrity-proof-005` |
| Contido em `origin/main` | **NÃO** — confirmado por `git merge-base --is-ancestor` |
| Merge-base com a `main` | `ccb8b0f` (merge do PR #10) |

**Cadeia de commits do harness** (mais recente primeiro), todos fora da `main`:

| Commit | Mensagem |
|---|---|
| `d4dfcf1` | `fix(fiscal): tornar evidência XSD explicitamente parcial` |
| `f452bc1` | `fix(fiscal): fechar egress e exit codes do dry-run` |
| `d5dc7ad` | `test(fiscal): prove offline dry-run integrity (GOAL-005)` |

> **Nota de leitura obrigatória.** `d4dfcf1` é o **último** commit da cadeia e apenas **modifica**
> arquivos — seu diff isolado **não** é o harness. O que deve ser reaplicado é o **estado da
> árvore em `d4dfcf1`** sob `tools/fiscal-dry-run-integrity-proof/`, listado na §11.

## 11. Arquivos exatos do harness

Estado da árvore em `d4dfcf1` sob `tools/fiscal-dry-run-integrity-proof/` — **7 arquivos**,
confirmados por `git ls-tree` (não presumidos):

| # | Caminho | Blob | Bytes | Função | Reaplicar | Byte-idêntico | Alterado no 005B |
|---|---|---|---|---|---|---|---|
| 1 | `tools/fiscal-dry-run-integrity-proof/fixtures.ts` | `e29f91e2` | 5 154 | Fixtures sintéticas (loja/produto/certificado de teste); sem valor fiscal | **SIM** | **SIM** | não |
| 2 | `tools/fiscal-dry-run-integrity-proof/java-external.ts` | `a0d94cfd` | 3 125 | Verificador XMLDSig externo (Java 17), via `child_process` | **SIM** | **SIM** | não |
| 3 | `tools/fiscal-dry-run-integrity-proof/net-guard.ts` | `45f27785` | 11 450 | Intercept de egress (fetch/http/net/tls/DNS); allowlist loopback + IPC + `*.internal` | **SIM** | **SIM** | não |
| 4 | `tools/fiscal-dry-run-integrity-proof/proof.ts` | `6430d134` | 22 843 | Orquestrador da prova; `classifyProofExit`; evidência XSD; manifesto | **SIM** | não | **SIM** — evidência XSD real |
| 5 | `tools/fiscal-dry-run-integrity-proof/run.ts` | `f3bc4184` | 5 991 | Runner CLI; injeta o adapter XSD; imprime relatório; define exit code | **SIM** | não | **SIM** — troca do composition-gate |
| 6 | `tools/fiscal-dry-run-integrity-proof/proof.test.ts` | `cbc2ca4c` | 31 683 | Suíte P-01..P-15 / N-01..N-14 + suíte opcional do worker real | **SIM** | não | **SIM** — matriz XSD negativa |
| 7 | `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` | `de9fac11` | 1 970 | Golden versionado da prova | **SIM** | não | **SIM** — regeneração controlada |

**Classificação por natureza:**

- **A. Técnicos do harness:** itens 1–6.
- **B. Manifesto/evidência:** item 7 (golden; é evidência gerada, versionada).
- **C. Documentos:** nenhum sob `tools/**`. O commit `d4dfcf1` também tocou 4 documentos
  (`docs/ai/CURRENT_STATUS.md`, `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`,
  `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005_IMPLEMENTATION_REPORT.md`,
  `docs/roadmaps/ROADMAP_FISCAL.md`) — são **documentação histórica** da branch do harness, não
  parte do harness técnico. O relatório de implementação do 005
  (`FISCAL_DRY_RUN_INTEGRITY_PROOF_005_IMPLEMENTATION_REPORT.md`) **não existe na `main`**; vive
  apenas em `work/fiscal-dry-run-integrity-proof-005` @ `d4dfcf1`. Por isso é referenciado aqui por
  branch + commit, e **não** por link relativo (que estaria quebrado).
- **D. Fora do harness:** nenhum arquivo estranho. O commit não toca `lib/**`, `workers/**`,
  `prisma/**`, `app/**`, `components/**`, `package.json` nem lockfiles.

**Nenhum arquivo foi copiado, movido ou modificado por esta tarefa.**

## 12. Compatibilidade com a `main` atual

Resultado: **COMPATÍVEL — nenhuma incompatibilidade material.** Esta é a evidência que sustenta a
classe A.

### 12.1 Prova decisiva — contratos byte-idênticos

Desde o merge-base `ccb8b0f`, a `main` **não alterou nada** em `lib/fiscal/**`,
`lib/produto-fiscal.ts`, `package.json`, `tsconfig.json` ou `vitest.config.ts`. As **únicas**
mudanças em caminhos relevantes são as do próprio 005A, sob `workers/fiscal-xsd/`:

| Mudança na `main` desde `ccb8b0f` | Tipo |
|---|---|
| `workers/fiscal-xsd/Dockerfile` | modificado |
| `workers/fiscal-xsd/ci/supply-chain.sh` | adicionado |
| `workers/fiscal-xsd/supply-chain.lock.json` | adicionado |

Os 10 arquivos de contrato que o harness importa são **byte-idênticos** entre `d4dfcf1` e
`origin/main` (comparação de blob SHA):

`lib/fiscal/xsd/index.ts` · `lib/fiscal/xsd/types.ts` · `lib/fiscal/xsd/official-package.ts` ·
`lib/fiscal/dry-run/index.ts` · `lib/fiscal/signing/index.ts` · `lib/fiscal/xml/index.ts` ·
`lib/fiscal/venda-fiscal-snapshot.ts` · `lib/produto-fiscal.ts` ·
`lib/fiscal/xsd-worker/index.ts` · `lib/fiscal/xsd-worker/client.ts`.

O harness **não importa nada de `workers/**`** — fala com o worker apenas por HTTP. Portanto as
mudanças do 005A não podem quebrá-lo por compilação.

### 12.2 Checklist ponto a ponto

| Verificação | Resultado |
|---|---|
| Harness continua compilável em princípio | **CONFIRMADO** — contratos byte-idênticos; `tsconfig.json` inclui `**/*.ts` e **não** exclui `tools/**`; alias `@/*` inalterado |
| Imports ainda resolvem | **CONFIRMADO** — todos os símbolos existem na `main`: `XSD_CONTRACT_VERSION`, `XSD_MAX_PAYLOAD_BYTES`, `XSD_SCHEMA_PACKAGE`, `XsdValidationAdapter`, `XsdValidationOutcome`, `XsdValidationRequest`, `OFFICIAL_XSD_MANIFEST_SHA256`, `DRY_RUN_TEST_CERT`, `validarEstruturaNfce`, `validarXsd`, `buildNfceXmlResult`, `buildVendaFiscalSnapshot`, `sanitizeProdutoFiscal`, `verifyNfceSignature`, `parseXml`, `findFirst`, `canonicalizeElement`, `loadCertificateMaterialFromPem`, `signNfceXmlDetailed` |
| Ponto de injeção do adapter continua adequado | **CONFIRMADO** — `createConfiguredXsdWorkerClient(): XsdValidationAdapter` existe em `lib/fiscal/xsd-worker/client.ts`; é drop-in, bastando o invólucro `kind: "xmllint-worker"` |
| Única ligação falsa é o composition-gate em `run.ts` | **CONFIRMADO** — call site **único** em `run.ts:45` (`createCompositionXsdAdapter()`); import em `run.ts:30` |
| Net-guard continua compatível | **CONFIRMADO** — allowlist já cobre loopback, socket unix/named pipe e rede Docker `*.internal`, exatamente a topologia do Job 2 ratificado |
| Exit codes continuam compatíveis | **CONFIRMADO** — `classifyProofExit` (`proof.ts:627`) já implementa a matriz 0–4 ratificada |
| Nenhum schema precisa ser alterado | **CONFIRMADO** |
| Nenhum worker precisa ser alterado | **CONFIRMADO** |
| Nenhum Prisma precisa ser alterado | **CONFIRMADO** |
| `vitest` coleta a suíte | **CONFIRMADO** — `include: ["**/*.test.ts"]`; `tools/**` não excluído |
| `package.json` precisa de script novo? | **NÃO** — `run.ts` documenta invocação por `npx tsx tools/fiscal-dry-run-integrity-proof/run.ts`; padrão `npx tsx` já usado no repo. `package.json` permanece **read-only** |

### 12.3 Ponto de troca (para a implementação futura)

O padrão do adapter real **já está demonstrado** no próprio harness, na suíte opcional
`realXsdSuite` de `proof.test.ts` (ativada por `FISCAL_XSD_WORKER_URL`): instancia
`createConfiguredXsdWorkerClient()` e o embrulha como
`{ kind: "xmllint-worker", validate: (r) => client.validate(r) }`. O 005B promove esse padrão de
suíte opcional a caminho principal do runner.

## 13. Worker

| Campo | Valor |
|---|---|
| Caminho | `workers/fiscal-xsd/**` — presente na `main` |
| Motor | `xmllint` (libxml2) |
| Versão | `LIBXML2_VERSION = "2.15.3"` (`lib/fiscal/xsd/official-package.ts`, na `main`) |
| Pacote XSD | `XSD_SCHEMA_PACKAGE = "PL_010e_v1.02/NFe/nfe_v4.00.xsd"` |
| Limites do contrato | payload 2 MiB · saída 64 KiB · timeout padrão 3 000 ms |
| Estado | **READ-ONLY no 005B** — não será alterado |

## 14. Lock

| Campo | Valor |
|---|---|
| Caminho | `workers/fiscal-xsd/supply-chain.lock.json` |
| SHA-256 esperado | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` |
| SHA-256 conferido na `main` | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` |
| Resultado | **IDÊNTICO** — conferido byte a byte em 20/07/2026 |
| Estado | **IMUTÁVEL no 005B** |

## 15. Artifact aprovado

| Campo | Valor |
|---|---|
| Artifact ID | `8436826125` |
| Nome completo | `fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| Run ID | `29669361609` (#5) · `success` · jobs 2/2 |
| Commit do run | `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| Digest | `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e` |
| Workflow | Fiscal XSD Worker Supply Chain (005A) |

**Identidade exigida (composta):** run ID **+** nome completo **+** head SHA **+** digest.
Não confiar somente no artifact ID. Não confiar somente no nome.

## 16. Expiração

| Campo | Valor |
|---|---|
| Expiração registrada | **2026-07-26T01:59:00Z** |
| Data desta ratificação | 2026-07-20 |
| Janela restante | **~6 dias** |

> **Aviso explícito.** Esta ratificação é documental e **não garante** a disponibilidade futura do
> artifact. Se a implementação do 005B começar após a expiração, o fallback da §18 é obrigatório.

## 17. Caminho 2 — o 005B carrega o harness

**Ratificado.** Não haverá GOAL intermediário só para publicar o harness.

**Motivo:** o harness sem worker real é uma prova declaradamente **parcial** (`proofState:
partial`, exit 2). Publicá-lo sozinho na `main` colocaria na linha principal um artefato que não
fecha nada e cujo runner falha por dependência ausente. Carregá-lo junto com a integração do worker
real entrega **uma** unidade coerente e auditável.

**Consequência:** a entrega do 005B é **atômica** — harness + workflow + worker real + manifesto
honesto + evidências, num único conjunto revisável.

## 18. Arquitetura ratificada

**Opção oficial: NOVO WORKFLOW DEDICADO AO 005B.**

Nome futuro recomendado: `.github/workflows/fiscal-dry-run-integrity-proof.yml`

**Proibido:** estender o workflow 005A; adicionar um terceiro job ao workflow de supply chain.

**Motivo:** separação de GOALs; melhor proveniência; o artifact 005A permanece **input**; a prova
005B tem lifecycle próprio; auditoria mais clara; menor risco de regressão na supply chain
aprovada.

## 19. Workflow dedicado — modelo de dois jobs

O workflow tem **duas fases separadas por runner**, para que a fase que roda a prova nunca tenha
rede.

## 20. Job 1 — preparação conectada

- checkout;
- validar o lock (`workers/fiscal-xsd/supply-chain.lock.json`);
- localizar e baixar o artifact aprovado;
- validar **nome, run, commit, digest e hashes** (identidade composta da §15);
- publicar artifact intermediário privado para o job seguinte;
- **nenhuma execução do harness.**

## 21. Job 2 — prova offline

- runner novo (limpo);
- baixar **somente** o artifact privado do Job 1;
- carregar o Docker archive;
- criar rede Docker `--internal`;
- iniciar o worker;
- executar o harness sob net-guard;
- validar o positivo e todos os negativos;
- executar o verificador Java;
- atualizar manifesto/golden de forma controlada;
- produzir evidências textuais;
- **nunca** acessar internet, banco ou SEFAZ.

## 22. Rede

| Camada | Política |
|---|---|
| Job 1 | conectado — exclusivamente para obter e validar o artifact |
| Job 2 | **offline** — rede Docker `--internal`, sem rota externa |
| Harness | `withNetGuard` ativo; allowlist mínima: loopback, IPC local e `*.internal` |
| Egress detectado | **falha** — nunca retorna zero (exit 3) |

A allowlist `*.internal` do net-guard **já existente** coincide com a rede `--internal` do Job 2:
não há mudança de política de rede a fazer.

## 23. Manifesto

Valores esperados **após sucesso real** com worker real:

| Campo | Valor ratificado |
|---|---|
| `verification.xsd` | `true` |
| `xsdContract` | `true` |
| `xsdStatus` | `approved-real` |
| `xsdEngineName` | `xmllint` |
| `xsdEngineVersion` | `2.15.3` (ou código `21503`, conforme o formato final escolhido — **um só**) |
| `xsdWorkerReal` | `true` |
| `proofState` | `complete` |
| `blockingReasons` | `[]` |

**Proveniência permanente** a registrar no manifesto ou em evidência adjacente: run do 005B ·
worker image ID · lock SHA-256 · schema manifest · `xmllint` · binary hash · worker real.

## 24. Golden

- só pode ser regenerado pelo **modo oficial do harness** (`--update-manifest`);
- **somente** sob worker real aprovado;
- **somente após** o positivo e todos os negativos passarem;
- **nunca** por edição manual;
- exige comparação explícita dos hashes invariantes da §25.

## 25. Hashes invariantes

Cinco hashes SHA-256 do XML **mais** o `DigestValue` (base64) devem permanecer **exatamente** como
estão hoje, já assertados no harness (`proof.test.ts`, caso `XSD-H16`):

| Item | Valor esperado |
|---|---|
| snapshot | `efd6f54c362bddb781395514112ff3540418b868c854b1444b1122e8159bae2e` |
| XML não assinado | `5773978497ce4d63db0ca3e945f1df1306204b871d760bbf66d7e48cc9ffd488` |
| C14N (nó referenciado) | `5126ad4885f1a6f843a3d8b8e59c3afac33591d199533b8afea82616172233f7` |
| SignedInfo | `449cc741f4187087090610abcaaf13195ee8fc82a045d8b91511254919421b69` |
| XML assinado | `d9a3eead89deba74dbf2d6cf54db1562a3ef67c1b671e24a927d72127f3c84a2` |
| DigestValue | `C2JM/I4Y6H7n1G7YopYEiVLuASw=` |

**A mudança esperada no 005B é somente na evidência XSD e no estado do manifesto.** Qualquer
alteração dos valores acima **exige parada e auditoria material** — não é regeneração de rotina.

## 26. Caso positivo

**1 positivo:** XML assinado real validado contra o schema oficial no worker real → **aprovado**.

Rejeição do positivo **nunca** retorna zero.

## 27. Casos negativos — contagem única ratificada

**Contagem oficial do 005B: 1 positivo + 8 negativos.** Esta é a **única** contagem válida para o
harness; a documentação e os asserts da implementação devem declarar `8/8`.

| # | Caso | Camada | Resultado esperado |
|---|---|---|---|
| 1 | campo obrigatório ausente | schema | `XML_INVALIDO` |
| 2 | elemento inesperado | schema | `XML_INVALIDO` |
| 3 | ordem inválida | schema | `XML_INVALIDO` |
| 4 | tipo inválido | schema | `XML_INVALIDO` |
| 5 | namespace incorreto | schema | `XML_INVALIDO` |
| 6 | XML malformado | parser/worker | rejeitado |
| 7 | payload acima do limite | política | `POLITICA_REJEITADA` |
| 8 | timeout | fail-closed | `TIMEOUT` |

### 27.1 Reconciliação com o “7/7” do 005A — não é contradição

O registro histórico do 005A afirma **negativos 7/7**, e permanece **correto e intocado**. Os dois
números descrevem **camadas e GOALs diferentes**:

| Escopo | Contagem | Composição |
|---|---|---|
| **005A** — matriz do worker, na CI de supply chain (fechada na `main`) | **7** | 5 schema + payload + timeout |
| **005B** — matriz do harness, objeto desta ratificação | **8** | os mesmos 7 **+ XML malformado** |

O delta é exatamente **+1 (XML malformado)**, acrescentado na camada de parser/worker do harness.
Os 5 negativos de schema são **os mesmos** nas duas matrizes (`missing_required`,
`unexpected_element`, `invalid_order`, `invalid_type`, `wrong_namespace`), e todos possuem fixture
já aprovada em `lib/fiscal/xsd/__fixtures__/nfce-xsd-fixtures.ts` na `main`.

**Regra:** nunca declarar simultaneamente “7 negativos” e “8 negativos” para o **mesmo** escopo. O
005A é 7; o 005B é 8. Não reescrever o registro do 005A.

### 27.2 Estado atual da suíte do worker real

Hoje, a suíte opcional `realXsdSuite` em `proof.test.ts` contém **apenas o caso positivo**. Os 8
negativos da §27 **ainda não existem no harness** — implementá-los é trabalho do 005B.

## 28. Exit codes

| Código | Significado |
|---|---|
| `0` | prova completa aprovada **com worker real** |
| `1` | integridade ou determinismo |
| `2` | dependência obrigatória ausente: Java, worker ou artifact |
| `3` | segurança: egress, persistência, SEFAZ ou bundle inválido |
| `4` | manifesto/golden divergente |

**Invariantes obrigatórias — nenhuma destas situações pode retornar zero:**

- composition-gate ativo;
- worker indisponível;
- artifact expirado;
- XSD positivo rejeitado;
- negativo aceito;
- egress detectado.

**Já garantido no harness atual:** `classifyProofExit` (`proof.ts:627`) avalia segurança primeiro
(`→ 3`), depois dependência (`!dependencyAvailable || !xsdWorkerReal → 2`), depois manifesto
(`→ 4`), depois integridade (`→ 1`). Como o composition-gate produz `xsdWorkerReal = false`, ele
**já retorna 2** — nunca 0 — mesmo com manifesto byte-igual ao golden.

## 29. Persistência

**Zero persistência — obrigatório.** Sem Prisma, sem banco, sem migration, sem schema. A prova roda
sobre fixtures sintéticas em memória e arquivos temporários. `databaseWrites > 0` → exit 3.

## 30. SEFAZ

**Zero SEFAZ — obrigatório.** Sem emissão, sem autorização, sem cancelamento, sem inutilização, sem
contingência, sem homologação, sem produção. `sefazCalls > 0` → exit 3. O harness inclui adapter
proibitivo (`createForbiddenSefazAdapter`) e caso negativo dedicado.

## 31. Segurança

| Controle | Exigência |
|---|---|
| Egress | bloqueado e contado; qualquer tentativa externa → exit 3 |
| Certificado | **exclusivamente** o de teste do GOAL-003; nunca certificado real |
| CSC / idToken | **fora de escopo**; nenhum segredo, credencial ou variável sensível |
| Dados | 100% sintéticos; sem empresa, cliente, produto ou loja reais |
| Manifesto | sem XML real, sem chave privada, sem certificado (assertado na suíte) |
| Bundle | validado por digest + lock antes de qualquer execução |
| Container | non-root, read-only rootfs, rede `--internal` |

## 32. Allowlist futura do 005B

Baseada na inspeção real de `d4dfcf1` (§11), **não** em suposição:

| # | Caminho | Natureza |
|---|---|---|
| 1 | `tools/fiscal-dry-run-integrity-proof/fixtures.ts` | harness (byte-idêntico) |
| 2 | `tools/fiscal-dry-run-integrity-proof/java-external.ts` | harness (byte-idêntico) |
| 3 | `tools/fiscal-dry-run-integrity-proof/net-guard.ts` | harness (byte-idêntico) |
| 4 | `tools/fiscal-dry-run-integrity-proof/proof.ts` | harness (evidência XSD real) |
| 5 | `tools/fiscal-dry-run-integrity-proof/run.ts` | harness (troca do composition-gate) |
| 6 | `tools/fiscal-dry-run-integrity-proof/proof.test.ts` | testes (matriz 1+8) |
| 7 | `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` | golden (regeneração controlada) |
| 8 | `.github/workflows/fiscal-dry-run-integrity-proof.yml` | workflow dedicado (**novo**) |
| 9 | `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_REPORT.md` | relatório do 005B (**novo**) |
| 10 | `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | documento de estado |
| 11 | `docs/roadmaps/ROADMAP_FISCAL.md` | documento de estado |
| 12 | `docs/ai/CURRENT_STATUS.md` | documento de estado |

**Total: 12 arquivos** — no limite recomendado, sem necessidade de justificativa por excesso.

Evidências textuais geradas pelo run (logs, relatórios de execução) que exijam versionamento devem
ir em **commit separado**, fora desta contagem.

## 33. Blocklist futura do 005B

**Read-only durante todo o 005B:**

`workers/fiscal-xsd/**` (inclusive `supply-chain.lock.json`) · `lib/fiscal/**` · `prisma/**` ·
`schemas/**` · `app/**` · `components/**` · `package.json` · lockfiles · workflows do GOAL-005A ·
Contador HUB · PDV · Caixa · Financeiro · Estoque · WhatsApp · Fiscal produtivo.

**Exceção futura única:** o novo workflow dedicado do 005B
(`.github/workflows/fiscal-dry-run-integrity-proof.yml`).

> Confirmado na §12.2: o 005B **não precisa** de script novo em `package.json` — o runner é
> invocado por `npx tsx`. A blocklist é, portanto, tecnicamente sustentável.

## 34. Gates humanos

Nenhum gate pode ser assumido automaticamente.

| Gate | Descrição | Estado |
|---|---|---|
| **H1** | Este documento de escopo integrado na `main` | **PENDENTE** |
| **H2** | Implementação e workflow revisados antes do primeiro dispatch | pendente |
| **H3** | Autorização manual para executar o workflow | pendente |
| **H4** | Autorização manual para regenerar manifesto/golden | pendente |
| **H5** | Auditoria de evidências após o run | pendente |
| **H6** | Merge-readiness técnico | pendente |
| **H7** | PR e aprovação humana | pendente |
| **H8** | Fechamento documental do GOAL-005 | pendente |

## 35. Critérios de aceite — GOAL-005B ENTREGUE NA BRANCH

harness reaplicado · worker real executado · artifact validado · lock validado · `xmllint` real ·
positivo aprovado · negativos completos (8/8) · Java aprovado · determinismo · idempotência ·
A→B→A · tamper · wrapping · DTD/XXE · zero egress · zero persistência · zero SEFAZ · manifesto
honesto · golden controlado · hashes XML invariantes · testes verdes · TypeScript · ESLint ·
build · evidence estável · commit e push da branch · sem callers produtivos.

## 36. Critérios de aceite — GOAL-005 FECHADO

Tudo da §35, **mais**: auditoria de merge-readiness · PR · checks verdes · merge commit ·
fechamento documental · `main` reconciliada · gate global permanece conforme planejamento ·
**N6 = 0** · **N7 = 0**.

## 37. Estado

| Item | Estado |
|---|---|
| **GOAL-005B** | **DEFINIDO DOCUMENTALMENTE — NÃO INICIADO** |
| GOAL-005A | fechado na `main` (PR #12 + PR #13) |
| GOAL-005 técnico | **PARCIAL** |
| Gate Fiscal global | **aberto** (F4→F5 / G-F5 / G-F7 / G-F12) |
| Gates alterados por esta tarefa | **nenhum** |
| N6 / N7 | **0 / 0** |
| Contador HUB | **não alterado** |
| Emissão / SEFAZ / homologação / produção | **não** |
| Código alterado nesta tarefa | **nenhum** |

## 38. Próximo passo

1. **Auditoria de merge-readiness** desta ratificação documental.
2. Integração na `main` via PR controlado → **fecha o Gate H1**.
3. **Somente então** iniciar a implementação técnica do 005B, em GOAL e comando separados.
4. Antes do primeiro dispatch, **reconferir a validade do artifact** (§16). Se expirado, aplicar o
   fallback: parar o 005B, executar um GOAL separado de renovação controlada do bundle 005A,
   produzir novo run/artifact/lock, integrar, e só então retomar.

**Não** iniciar implementação com base apenas neste documento não integrado.

## 39. Conclusão

**ESCOPO DO GOAL-005B RATIFICADO PELO CAMINHO 2**

O GOAL-005B — `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B`, “Integração do Worker XSD Real na Prova de
Integridade do Dry-Run Fiscal” — está oficialmente definido. O harness de `d4dfcf1` foi auditado
arquivo a arquivo (7 arquivos técnicos) e comprovado **compatível com a `main` atual**: os 10
contratos que ele importa são byte-idênticos, a única ligação falsa é o composition-gate em
`run.ts:45`, a matriz de exit codes e o net-guard já atendem ao que se exige, e nenhum schema,
worker ou Prisma precisa mudar.

Os dois pendentes que sustentavam a classe **B** estão resolvidos: o escopo está ratificado neste
documento e a base do harness está decidida pelo Caminho 2.

**Estado final: DEFINIDO DOCUMENTALMENTE — NÃO INICIADO.**

**Classificação resultante: A — PRONTO PARA IMPLEMENTAÇÃO APÓS INTEGRAÇÃO DESTA RATIFICAÇÃO.**

---

**Referências**

- Auditoria formal 005B: branch `audit/fiscal-dry-run-005b-formal-audit` @ `818253b…`
- Harness: branch `work/fiscal-dry-run-integrity-proof-005` @ `d4dfcf15b600bf46f51c347e99656800d1ec201a`
- Relatório de implementação do GOAL-005: `FISCAL_DRY_RUN_INTEGRITY_PROOF_005_IMPLEMENTATION_REPORT.md`
  — **não presente na `main`**; existe apenas na branch do harness @ `d4dfcf1`
- [`FISCAL_GOAL_005_SCOPE_RECONCILIATION.md`](./FISCAL_GOAL_005_SCOPE_RECONCILIATION.md)
- [`FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_REPORT.md`](./FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_REPORT.md)
- [`FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md`](./FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md)
- [`FISCAL_XSD_WORKER_ARCHITECTURE_CONTRACT_001.md`](./FISCAL_XSD_WORKER_ARCHITECTURE_CONTRACT_001.md)
