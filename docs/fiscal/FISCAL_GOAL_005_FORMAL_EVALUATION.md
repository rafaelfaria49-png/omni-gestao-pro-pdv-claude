# FISCAL — Avaliação formal do GOAL-005

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-GOAL-005-FORMAL-EVALUATION` |
| Tipo | Auditoria read-only + reconciliação de numeração + recomendação de próximo passo |
| Data | 2026-07-16 |
| Branch de auditoria | `audit/fiscal-goal-005-formal-evaluation` |
| Worktree | `../wt-fiscal-goal-005-evaluation` (`C:/Projetos/wt-fiscal-goal-005-evaluation`) |
| `origin/main` (inicial e final observada) | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` (não avançou durante a auditoria) |
| HEAD da auditoria | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` |
| GOAL-004 | **FECHADO** técnica (PR #8, merge `b307337`) e documentalmente (PR #9, merge `ba65cd0`) |
| Classificação do GOAL-005 | **G — ESCOPO AMBÍGUO; RECONCILIAÇÃO DOCUMENTAL NECESSÁRIA** |
| N6 | **0** |
| N7 | **0** |
| Implementação parcial na `main` de um GOAL nomeado 005 | **ausente** |
| Emissão / SEFAZ / homologação / produção | **não** |
| Natureza desta entrega | **somente documentação** (1 arquivo novo); nenhum código/teste/schema alterado |

> **Escopo desta tarefa.** Avaliar formalmente o próximo GOAL Fiscal após o fechamento de
> `FISCAL-PRODUTO-UPSERT-PARITY-004`. **Não implementa** o GOAL-005. Não altera código, testes,
> documentos existentes, Prisma, schema, migrations, workflows, dependências, APIs, motor Fiscal,
> PDV, Caixa, Estoque, Cadastros nem Contador HUB. Não ativa emissão, não chama SEFAZ, não cria
> certificado. Nenhum PR, merge, rebase, cherry-pick, reset, stash, force-push ou push para `main`.

---

## 1. Objetivo

Determinar, de forma factual e conservadora, o estado do **slot “GOAL-005”** da frente Fiscal:
nome oficial, objetivo real, colisões de numeração, pré-requisitos concluídos e abertos, nível N
permitido, existência de implementação parcial, branches equivalentes, áreas compartilhadas
tocadas, necessidade de ADR/schema/migration, dependência de autoridade contábil, risco de ativar
emissão prematuramente, o **menor escopo seguro** e se o GOAL-005 está pronto para implementação.

A conclusão precede o detalhe: **o slot “GOAL-005” da sequência nomeada de execução não possui
escopo atribuído em nenhum documento de governança**, e o número “005” colide entre quatro sistemas
de numeração distintos. Portanto o GOAL-005 **não pode ser iniciado** sem uma reconciliação
documental e ratificação humana do escopo. Este relatório propõe essa reconciliação e o menor
escopo seguro, sem inventar uma definição.

---

## 2. `origin/main`

| Item | Valor |
|---|---|
| `origin/main` no início da auditoria | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` |
| `origin/main` ao final (após segundo `fetch --prune`) | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` |
| Avançou durante a auditoria? | **não** |
| `ba65cd0` é ancestral de `origin/main`? | **sim** (é o próprio HEAD) |
| Base publicada esperada pela tarefa | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` — **confere** |

Como `origin/main` não avançou além de `ba65cd0`, **não há commits posteriores** a analisar quanto
a impacto em Fiscal, Cadastros, Contador HUB, Prisma, APIs, motor Fiscal ou governança.

Log recente de `origin/main` (topo):

```text
ba65cd0 Merge pull request #9 … fiscal/goal-004-produto-upsert-close   (GOAL-004 documental)
c49cce5 docs(fiscal): fechar paridade fiscal do upsertProduto
b307337 Merge pull request #8 … work/fiscal-produto-upsert-parity-004  (GOAL-004 técnico)
3f8928c fix(cadastros-v2): canonizar dados fiscais no upsertProduto
5b96df7 docs(fiscal): fechar GOAL-003 de C14N externo (#7)
```

---

## 3. Merge GOAL-004

O GOAL-004 (`FISCAL-PRODUTO-UPSERT-PARITY-004`) está fechado em dois eixos:

| Eixo | PR | Merge commit | Conteúdo |
|---|---|---|---|
| Técnico | #8 | `b307337ce89535355d18cd9138e17f635f1c1bf5` | `upsertProduto` canoniza `metadata.fiscal` (4 arquivos, +206/−20); implementação `3f8928c` |
| Documental | #9 | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` | fechamento documental `fiscal/goal-004-produto-upsert-close` (`c49cce5`) |

Estado herdado (confirmado nos documentos de fechamento e no código):

- `metadata.fiscal` = **fonte fiscal canônica única** (10 campos do contrato `lib/produto-fiscal.ts`);
- `metadata.fiscalRegime` = **compatibilidade visual não canônica** (não lida pelo motor / `getProdutoFiscal`);
- nível **N3** no eixo cadastro; **N6 = 0**, **N7 = 0**;
- signer **dormente**; **callers produtivos = 0**;
- emissão **não** ativada; SEFAZ **não** chamada; homologação **não** realizada; produção **não** ativada;
- **GOAL-005 permanece não iniciado.**

---

## 4. Definição encontrada

A sequência **nomeada de execução** avançou assim (não segue a ordem da tabela histórica):

| GOAL nomeado | Identificador | Objetivo | Estado |
|---|---|---|---|
| 001 | `FISCAL-STATUS-RECONCILE-001` | Reconciliar Git/código/banco/schema/testes/docs | FECHADO (G-C1) |
| 002 | `FISCAL-XSD-OFFICIAL-VALIDATION-002` | Validação XSD oficial (worker B2, fail-closed) | FECHADO (G-C2) |
| 003 | `FISCAL-XML-C14N-EXTERNAL-PROOF-003` | C14N 1.0 + XMLDSig + prova externa | FECHADO (critério C14N/XMLDSig do F4→F5) |
| 004 | `FISCAL-PRODUTO-UPSERT-PARITY-004` | Paridade fiscal do `upsertProduto` (Cadastros V2) | FECHADO (N3 cadastro) |
| **005** | **— (não atribuído) —** | **— nenhum documento atribui escopo —** | **NÃO INICIADO / SEM ESCOPO OFICIAL** |

Evidência textual (todos os documentos convergem, e **nenhum** define o escopo do 005 nomeado):

- `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md:172` — “**GOAL-005 não foi iniciado.**”
- `FISCAL_CONTINUATION_COMMANDS_001.md:152` — “**GOAL-005 não iniciado.**”
- `FISCAL_PRODUTO_UPSERT_PARITY_004_CLOSURE_REPORT.md:25,46,487,502` — “GOAL-005 **não iniciado**”;
  “**Não** iniciar GOAL-005 automaticamente. Qualquer nova frente Fiscal exige GOAL próprio e gate humano.”
- `ROADMAP_FISCAL.md:59,196` — “**GOAL-005 não iniciado.**”; “Próximo passo: avaliação de backlog
  (dry-run auferível / ST / integridade) **sem** iniciar GOAL-005 automaticamente.”
- `MASTER_FISCAL_EXECUTION_PLAN.md:75` — “**GOAL-005 não iniciado.**”
- `docs/ai/CURRENT_STATUS.md:21,55` — “GOAL-005 **não** iniciado”; “sem iniciar GOAL-005 automaticamente.”

**Conclusão factual:** o nome/escopo do GOAL-005 nomeado **não existe** nos documentos. Existe
apenas uma **direção de backlog** (não um GOAL nomeado): “dry-run auferível / ST / integridade”.

---

## 5. Colisão de numeração

O número “005” está sobrecarregado por **quatro sistemas de numeração distintos** (mais uma
pendência “P-05”). Nenhum deles é o “GOAL-005 nomeado” — que permanece vazio.

| # | Sistema | Identificador “005” | Significado | Estado | Evidência |
|---|---|---|---|---|---|
| 1 | Sequência **nomeada** de execução | `FISCAL-…-005` | **não atribuído** | **VAZIO** (subject) | ausência em todos os docs |
| 2 | **Tabela histórica** reconciliada (GOALs 001–022) | GOAL **005** | “Versionar o pacote XSD oficial e sua proveniência” | **CUMPRIDO** no eixo XSD via nomeado 002 | `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md:12,34-35,74` |
| 3 | **Blueprint NFC-e** (rótulos de código `GOAL_00X`) | `GOAL_005` | “Snapshot Fiscal da Venda” | **IMPLEMENTADO DORMENTE** na `main` | commit `b5177cf`; `lib/fiscal/venda-fiscal-snapshot*.ts` |
| 4 | **Contador HUB** (trilha `contador-00X`) | “GOAL 005” | “Contrato canônico de competência mensal” | módulo distinto; branch `goal/contador-005-competencia` | commits `9472e8d` / `50c1db8`; `components/dashboard/contador/contador-hub-preview.tsx:16` |
| + | Pendência **P-05** (relatório reconciliado) | P-05 | “C14N interoperável” | **FECHADO** via nomeado 003 | `FISCAL_RECONCILE_REPORT_001.md:216,379`; `ROADMAP_FISCAL.md:40` |

Observações:

- A **tabela histórica** (item 2) e o **blueprint de código** (item 3) usam “005” para coisas
  diferentes, e **ambos já estão realizados** (XSD via GOAL-002; snapshot dormente via `b5177cf`).
  Reusar “005” para um novo trabalho **sem reconciliar** reintroduziria ambiguidade.
- O **Contador HUB “GOAL 005”** (item 4) é de **outra frente** (competência mensal do Contador HUB),
  não da emissão Fiscal. Não deve ser confundido com o slot Fiscal.
- A sequência nomeada mapeou os slots anteriores para itens da tabela histórica **fora de ordem**
  (002 nomeado → 005/006 histórico; 003 nomeado → 007/008; 004 nomeado → 002/P-04). Logo, **não há
  regra automática** que diga qual item histórico ocupa o slot nomeado 005.

**Veredito de colisão:** confirmada, de 4 vias. É a causa direta da classificação **G**.

---

## 6. Nome oficial recomendado

**Não há nome oficial** — e a auditoria **não inventa** um. O que se recomenda é uma **decisão de
reconciliação** (doc-GOAL curto, ver §46/§47) que:

1. registre a colisão de numeração 005 (tabela do §5) no
   `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`, sem renumerar histórico; e
2. **atribua explicitamente** o escopo do slot nomeado 005.

Se e quando o humano ratificar o menor escopo seguro (§14/§41), o nome recomendado é:

> **`FISCAL-DRY-RUN-INTEGRITY-005`** — “Prova interna de integridade do dry-run/snapshot”
> (determinismo, idempotência e imutabilidade), restrito aos casos Simples Nacional B2C **já
> suportados** (sem ST), fail-closed, dormente, sem autoridade contábil, sem schema, sem emissão.

Este nome é uma **recomendação sujeita a ratificação**, não uma definição oficial já existente.

---

## 7. Escopo oficial

**Inexistente.** O escopo oficial do GOAL-005 nomeado não está definido em nenhum documento
canônico (`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`, `…_COMMANDS_001.md`,
`FISCAL_RECONCILE_REPORT_001.md`, `ROADMAP_FISCAL.md`, `MASTER_FISCAL_EXECUTION_PLAN.md`,
`CURRENT_STATUS.md`, `FISCAL_FABLE5_CONTINUATION_MASTERPLAN_001.md`,
`FISCAL_CONTINUATION_ADRS_PROPOSTOS_001.md`).

O “próximo GOAL recomendado” do relatório reconciliado (`FISCAL_RECONCILE_REPORT_001.md:316`) era
“GOAL 002 — paridade `upsertProduto`”, que **já foi consumido** pelo GOAL nomeado 004. Esse ponteiro
está, portanto, **obsoleto** e não indica o 005.

Candidatos de escopo derivados do backlog remanescente (nenhum oficialmente atribuído ao 005):

| Candidato | Origem histórica | Precisa de contador? | Precisa de ADR? | Precisa de schema? | Toca emissão? | Classe |
|---|---|---|---|---|---|---|
| **A — Integridade interna dry-run/snapshot** (determinismo/idempotência/imutabilidade, só CSOSN já suportados) | tabela hist. ~010 | **não** | não (ou ADR-0016 se definir retenção — evitável) | **não** | **não** | **C** (menor escopo seguro) |
| B — Dry-run auferível **normativo** (critério de “verde”) | tabela hist. 009 | parcial (matriz precisa de contador) | **sim (ADR-0013)** | não | não | **D**, com parte **E** |
| C — ST / CSOSN 500 + matriz tributária + golden cases | tabela hist. 003–004 (P-07) | **sim (obrigatório)** | ADR tributário (sem nº) | não | não | **E — BLOQUEADO** |
| D — Decisão de provider SEFAZ × gateway | tabela hist. 011–012 (P-08) | não | **sim (ADR-0014)** | não | prepara F5 | **F — BLOQUEADO por G-F5** |

Recomendação: **Candidato A** como menor escopo seguro (§14/§41), sujeito a ratificação humana.

---

## 8. Pré-requisitos

| Pré-requisito | Estado | Bloqueante para o 005? |
|---|---|---|
| GOAL-001 (reconciliação) | **concluído** (G-C1) | não |
| GOAL-002 (XSD oficial) | **concluído** (G-C2, N4 eixo XSD) | não |
| GOAL-003 (C14N/XMLDSig + prova externa) | **concluído** (N4 eixo C14N; critério F4→F5 fechado) | não |
| GOAL-004 (`upsertProduto`) | **concluído** (N3 cadastro) | não |
| Contrato fiscal do Produto (`lib/produto-fiscal.ts`) | **concluído** | não |
| Snapshot fiscal (`venda-fiscal-snapshot*`) | **existente, dormente** (idempotência interna já codificada) | não (reuso) |
| XML builder (`lib/fiscal/xml`) | **existente, testado** | não |
| Signer (`lib/fiscal/signing`) | **existente, dormente** (só dry-run/testes) | não |
| Validação XSD (worker B2) | **real, fail-closed** | não |
| Prova externa C14N | **concluída** | não |
| Dry-run harness (`lib/fiscal/dry-run`) | **existente, fail-closed**; XSD/C14N agora reais | não (reuso) |
| **Autoridade tributária (contador nomeado)** | **ausente** | **bloqueante** para ST/matriz (Candidato C) |
| **Decisão de provider (G-F5)** | **aberta** (Rafael decide) | **bloqueante** para provider/transmissão (Candidato D) |
| Certificado A1 / senha / CSC / idToken | **ausentes** (proibidos até F4/F5) | **bloqueante** para emissão real |
| Ambiente de homologação SEFAZ | **ausente** | **bloqueante** para N6 |
| Isolamento multi-loja | **vigente** (store-scoped, sem `loja-1`) | não |
| Autorização humana de gate | **necessária** (o 005 exige “GOAL próprio e gate humano”) | **bloqueante** para iniciar |

Nenhum código dormente é tratado como fluxo produtivo concluído.

---

## 9. Gates

| Gate | Estado | Observação |
|---|---|---|
| G-C1 | **fechado** (GOAL-001) | reconciliação publicada |
| G-C2 | **fechado** (GOAL-002 XSD) | validação real fail-closed |
| Critério técnico C14N/XMLDSig do F4→F5 | **fechado** (GOAL-003) | prova externa Java/JSR 105 |
| **F4→F5 Fiscal global** | **ABERTO** | não avançado; falta ST + casos-alvo integrais + provider + dry-run íntegro |
| **G-F5** | **ABERTO** | decisão humana SEFAZ direto × gateway |
| **G-F7** | **ABERTO** | ativação da loja-piloto (homologação) |
| **G-F12** | **ABERTO** | virada para produção |
| G-C3 | **não existe** (não inventar) | — |

O menor escopo seguro (Candidato A) **não fecha** o gate global F4→F5 — apenas **avança evidência
interna** rumo a ele. Nenhum gate é fechado por esta avaliação.

---

## 10. Nível N

Vocabulário (relatório reconciliado): N0 ausente · N1 contrato · N2 código · N3 teste interno ·
N4 dry-run auferível · N5 runtime real · N6 homologação SEFAZ · N7 produção.

| Eixo | Nível atual | Teto permitido no 005 (menor escopo seguro) |
|---|---|---|
| XSD | N4 | inalterado |
| C14N/XMLDSig | N4 | inalterado |
| Cadastro/produto | N3 | inalterado |
| Dry-run/integridade interna | **N3** (dry-run existe, mas não auferível de ponta a ponta) | **até N4-interno** (integridade/determinismo dos casos já suportados) |
| Homologação SEFAZ | **N6 = 0** | **permanece 0** |
| Produção | **N7 = 0** | **permanece 0** |

**Regras:** não elevar N por mera existência de código. N4 pleno de dry-run “de ponta a ponta”
exige ST + golden cases com contador (fora do menor escopo). **N6/N7 não avançam** sem GOAL próprio,
credenciais, homologação, aprovação humana e evidência explícita.

---

## 11. Estado da `main`

- `origin/main = ba65cd0`; sem drift de schema (diff Prisma vazio no GOAL-001; schema fiscal
  inalterado desde então);
- 8 tabelas fiscais presentes, todas sem registros fiscais; 723 vendas, todas `NAO_FISCAL`
  (snapshot temporal do relatório reconciliado);
- `fiscalEnabled` sem caminho de ativação no runtime;
- motor Fiscal dormente no fluxo de venda; apenas guards de estado + rotas administrativas o tocam.

---

## 12. Componentes reais

| Componente | Caminho | Classificação |
|---|---|---|
| Máquina de estado da venda (guards) | `lib/fiscal/venda-fiscal-state-machine.ts` | **real e integrado** (6 callers de venda) |
| Rotas administrativas fiscais | `app/api/fiscal/config`, `app/api/fiscal/certificado[...]` | **real e integrado** (admin-only) |
| Validação XSD (worker B2) | `lib/fiscal/xsd`, `lib/fiscal/xsd-worker` | **real** (fail-closed; N4 eixo) |
| C14N/XMLDSig (signer) | `lib/fiscal/signing` | **real, dormente** (só dry-run/testes; N4 eixo) |
| Contrato fiscal do produto | `lib/produto-fiscal.ts`, `lib/produtos/produto-fiscal-upsert.ts` | **real e integrado** (N3) |
| Tax-engine (Simples Nacional) | `lib/fiscal/tax-engine` | **real, dormente**; **sem ST/CSOSN 500** |
| XML builder + chave | `lib/fiscal/xml` | **real, dormente** |
| Numeração por série | `lib/fiscal/numbering` | **real, dormente** |
| Snapshot da venda | `lib/fiscal/venda-fiscal-snapshot*.ts` | **real, dormente** (idempotência codificada) |
| Dry-run harness | `lib/fiscal/dry-run` | **real, dormente, fail-closed** |
| Vault de segredo | `lib/fiscal/vault` | **real, dormente** (EnvVault; KMS ausente) |

---

## 13. Componentes dormentes

Dormentes = existem, testados internamente, **sem caller no fluxo de venda**: snapshot, tax-engine,
XML builder, numeração, signer, pipeline de emissão, provider (só STUB), vault, dry-run. Toda a
esteira `snapshot → tributação(congelada) → XML → assinatura(teste) → verificação → XSD → relatório`
roda **em memória e descarta o XML** (`lib/fiscal/dry-run/dry-run-pipeline.ts`).

---

## 14. Mocks / placeholders

- **Provider:** registry com **apenas** `STUB_HOMOLOGACAO`; demais enums retornam
  `provider_nao_implementado` (`lib/fiscal/provider/resolver.ts`, `stub-homologacao.ts`).
- **Certificado do dry-run:** `DRY_RUN_TEST_CERT` — material sintético descartável, **nunca A1 real**
  (`lib/fiscal/dry-run/dry-run-fixtures.ts`).
- **Numeração no dry-run:** `numeracaoPlaceholder = true` quando sem contexto de série (não consome
  numeração real).
- **Sem mocks enganosos** que aparentem persistência/transmissão real. Persistência do snapshot é
  explicitamente marcada **DORMENTE** e sem caller.

Nenhum placeholder representa homologação ou produção como se fossem reais.

---

## 15. Histórico Git

Commits relevantes (todos já em `origin/main`, exceto onde indicado):

```text
ba65cd0  Merge PR #9 — GOAL-004 documental                 (origin/main)
b307337  Merge PR #8 — GOAL-004 técnico (upsertProduto)
e52d16b  Merge PR #6 — GOAL-003 C14N/XMLDSig
82c219c  Merge PR #4 — GOAL-002 XSD worker B2
ba0cc12  fundação dormente: tax/xml/xmldsig/vault/dry-run/provider/pipeline
b5177cf  feat(fiscal): snapshot fiscal da venda (GOAL_005 — blueprint NFC-e)
cd565c8  feat(fiscal): pipeline de emissão (GOAL_007 — blueprint)
a206dce  feat(fiscal): abstração de provider fiscal (GOAL_006 — blueprint)
```

Busca `git log --all --grep` por “GOAL-005 / GOAL 005 / GOAL_005 / P-05 / goal-005” retornou apenas:

```text
50c1db8  feat(contador): contrato canônico de competência mensal (GOAL 005)   [Contador HUB]
9472e8d  feat(contador): contrato canônico de competência mensal (GOAL 005)   [Contador HUB]
b5177cf  feat(fiscal): snapshot fiscal da venda (GOAL_005)                     [blueprint NFC-e]
```

**Nenhum commit** referente a um **GOAL nomeado 005 da sequência Fiscal** existe em qualquer branch.

---

## 16. Branches paralelas

Branches contendo “005”: apenas `audit/fiscal-goal-005-formal-evaluation` (esta) e
`goal/contador-005-competencia` (+ `remotes/origin/goal/contador-005-competencia`) — **Contador HUB,
outra frente**. `git log --all` dos arquivos `lib/fiscal/dry-run`, `venda-fiscal-snapshot*.ts`
retorna somente commits **já integrados** na `main` (`b5177cf`, `ba0cc12`, `775322a`, `cde2205`).

**Veredito:** **não há** implementação parcial, WIP abandonado, branch equivalente, superada ou
conflitante para um GOAL nomeado 005 Fiscal. O slot está **limpo e vazio**.

---

## 17. Callers

Callers de `lib/fiscal/**` **fora** da pasta (inventário verificado em `ba65cd0`):

| Caller | Símbolo | Tipo |
|---|---|---|
| `app/api/fiscal/config/route.ts` | identity service, validators, log, guard | admin |
| `app/api/fiscal/certificado/route.ts` | guard, validators, log | admin |
| `app/api/fiscal/certificado/[id]/route.ts` | guard, log | admin |
| `app/api/vendas/[id]/corrigir/route.ts` | `assertVendaFiscalEditavel` | guard de venda |
| `app/api/vendas/[id]/corrigir-itens/route.ts` | `assertVendaFiscalEditavel` | guard de venda |
| `app/api/vendas/[id]/corrigir-titulo/route.ts` | `assertVendaFiscalEditavel` | guard de venda |
| `app/api/vendas/[id]/corrigir-parcelas/route.ts` | `assertVendaFiscalEditavel` | guard de venda |
| `app/api/vendas/[id]/corrigir-item-meta/route.ts` | `assertVendaFiscalEditavel` | guard de venda |
| `app/api/vendas/[id]/cancelar/route.ts` | `assertVendaFiscalCancelavel` | guard de venda |

Todas as referências a `emitirNotaFiscalVenda` / `runEmissionPipeline` / `buildVendaFiscalSnapshot`
fora de `lib/fiscal` estão **em documentos ou em testes de honestidade** (que asseguram que o preview
**não** importa `@/lib/fiscal`) — **não** são callers produtivos.

---

## 18. Fluxo produtivo

| Métrica | Valor |
|---|---|
| Callers produtivos de emissão/assinatura no fluxo de venda | **0** |
| Callers de snapshot no fluxo de venda | **0** |
| Callers de XML/numeração no fluxo de venda | **0** |
| Callers dry-run produtivos | **0** (só testes/CI) |
| N6 | **0** |
| N7 | **0** |

**Qualquer proposta que crie caller produtivo, ative `fiscalEnabled`, monte/assine XML de venda real
ou transmita à SEFAZ está FORA do escopo de uma avaliação simples** e exige GOAL próprio, gate humano
e credenciais.

---

## 19. Contador HUB

O Contador HUB é **read-only** por contrato (lê documentos fiscais, cancelamentos, rejeições, pacote
por competência). **Não** emite, cancela, recalcula tributo, edita XML nem altera status Fiscal.

- O menor escopo seguro (Candidato A) **não** altera Prisma, contratos compartilhados, readers,
  APIs, status, documentos fiscais, competência, serialização nem campos usados pelo Contador HUB.
- **Cuidado de numeração:** o “GOAL 005” do Contador HUB (competência mensal) é frente **distinta**;
  o slot Fiscal 005 **não** deve reusar seu número sem a reconciliação do §5.
- Se o Contador HUB vier a depender de reader fiscal ainda inexistente (ex.: pacote por competência
  sobre notas autorizadas), isso é **dependência de GOAL Fiscal futuro** (pós-F5), **não** deve ser
  duplicado, e o GOAL responsável é o de persistência/eventos (F9) — **não** o 005.

**Impacto no Contador HUB pelo menor escopo seguro: nenhum.**

---

## 20. Cadastros

Cadastros V2 já grava `metadata.fiscal` canônica (GOAL-004). O menor escopo seguro **não** toca
`app/actions/cadastros.ts`, `produto-ia.tsx`, `lib/produto-fiscal.ts` nem
`lib/produtos/produto-fiscal-upsert.ts`. **Impacto: nenhum.** (Follow-ups R-1…R-5 do GOAL-004
permanecem fora deste slot.)

---

## 21. PDV

PDV é área protegida (core funcional). O menor escopo seguro **não** cria enfileiramento pós-commit,
não toca `finalizeSaleTransaction`, não reflete status fiscal no recibo. **Impacto: nenhum.**
(Enfileiramento/ativação é F7, sob G-F7 — fora deste slot.)

---

## 22. Caixa

Caixa é área protegida. O menor escopo seguro **não** o toca. **Impacto: nenhum.**

---

## 23. Produto

O item fiscal do produto (NCM/CEST/CFOP/origem via `getProdutoFiscal`) já é fonte do snapshot. O
menor escopo seguro **reusa** o contrato existente em fixtures internas; **não** altera o modelo
`Produto` nem seu `metadata`. **Impacto: nenhum.**

---

## 24. Snapshot

`buildVendaFiscalSnapshot` congela emitente/destinatário/itens/tributação (`deepFreeze`);
`createVendaFiscalSnapshot` persiste **1 NotaFiscal RASCUNHO idempotente** (dormente, sem caller).
A idempotência “1 venda → 1 NotaFiscal vigente” já está codificada
(`lib/fiscal/venda-fiscal-snapshot-service.ts`). O menor escopo seguro **prova** determinismo e
imutabilidade do snapshot; **não** ativa sua persistência produtiva.

---

## 25. XML

`buildNfceXmlResult` gera `infNFe` 4.00 + chave de acesso (44 díg + DV), valida o snapshot e lança
em erro bloqueante. Dormente. O menor escopo seguro exercita a geração **em memória** (já feito pelo
dry-run) e **descarta** o XML. Sem persistência, sem transmissão.

---

## 26. Signer

XMLDSig endurecido (RSA-SHA1/SHA-1, C14N 1.0 inclusivo, allowlist de algoritmos), com prova externa
independente (Java/JSR 105). **Dormente** — zero callers de venda; usado só em dry-run/testes. O
menor escopo seguro **não** cria import produtivo nem usa A1 real (só `DRY_RUN_TEST_CERT`).

---

## 27. XSD

Validação real fail-closed via worker B2 containerizado (`PL_010e_v1.02`, libxml2/xmllint). O XML
**assinado** é validado contra o schema (a NF-e exige `<Signature>`), garantindo que XML não assinado
reprove por definição. **N4 no eixo XSD.** O menor escopo seguro **reusa** o adapter existente.

---

## 28. Provider SEFAZ

Registry com **apenas** `STUB_HOMOLOGACAO`. Nenhum provider real. Nenhuma rede. A decisão SEFAZ
direto × gateway é **G-F5 (aberto)**, dependente de Rafael, e demanda **ADR-0014** (proposto). O
menor escopo seguro **não** implementa provider — isso é Candidato D (BLOQUEADO por G-F5).

---

## 29. Persistência

Banco fiscal vazio (8 entidades, 0 registros). Persistência do snapshot é dormente. O menor escopo
seguro **não** persiste nada fiscal (dry-run descarta artefatos; validação de integridade é em
memória). **Sem escrita em banco.**

---

## 30. Idempotência

- Snapshot: idempotência “1 venda → 1 NotaFiscal vigente” **já codificada** (dormente).
- Numeração: `allocateFiscalNumber` concorrência-segura por `(storeId, modelo, série, ambiente)`.
- Dry-run: determinístico (sem timestamps), hashes reproduzíveis.

O menor escopo seguro **prova** essas propriedades por teste, sem introduzir novo estado persistente.

---

## 31. Autoridade contábil

O menor escopo seguro (Candidato A) usa **apenas CSOSN já suportados** pelo baseline Simples Nacional
(`102`, `101`, `103`, `300`, `400` — `lib/fiscal/tax-engine/rules.ts`) e **não** decide nenhuma regra
tributária nova. Portanto **não requer** autoridade contábil.

Em contraste, **ST/CSOSN 500** está explicitamente **fora do escopo F2** (`CSOSN_COM_ST = {201, 202,
203, 500, 900}`; `isCsosnSuportado` retorna `false`). Qualquer GOAL que implemente ST/CSOSN 500,
matriz tributária, alíquotas, CFOP/CST/CSOSN derivados, ICMS/PIS/COFINS/IPI/FCP, benefício fiscal ou
golden cases **exige autoridade contábil/tributária nomeada** e, sem ela, é **classe E — BLOQUEADO**.
**Proibido default tributário falso.**

---

## 32. Schema

O menor escopo seguro **não requer schema**: as 8 tabelas fiscais já existem, sem drift, e a
validação de integridade não cria estado. Análise das opções:

| Opção | Aplica-se ao menor escopo? |
|---|---|
| A. sem schema | **sim** (recomendado) |
| B. metadata versionada | não |
| C. campos aditivos | não |
| D. novo modelo | não |
| E. mudança de estado | não |
| F. ADR antes de código | não para Candidato A; **sim** para B (ADR-0013) e D (ADR-0014) |

Nenhum schema é criado nesta auditoria.

---

## 33. ADR

- **Candidato A (menor escopo seguro):** ADR **não obrigatória** (é endurecimento de teste/validação
  interno). Se definir política de retenção de artefatos, aproxima-se de ADR-0016 (proposta) —
  evitável mantendo o escopo em determinismo/imutabilidade.
- **Candidato B (dry-run normativo):** exige **ADR-0013** (“critério normativo de dry-run verde”).
- **Candidato D (provider):** exige **ADR-0014** (SEFAZ × gateway; G-F5).
- **Candidato C (ST):** exige ADR tributário (sem número reservado) + autoridade contábil.

Nenhuma ADR é criada nesta auditoria. Antes de qualquer ADR, repetir a busca de colisão de número
em `origin/main` e branches remotas (política do projeto).

---

## 34. Migrations

**Nenhuma** migration é necessária para o menor escopo seguro (sem schema). `_prisma_migrations`
ausente (db:push) permanece um risco de governança **fora** deste slot (P-09).

---

## 35. Credenciais

| Segredo | Necessário no menor escopo? |
|---|---|
| Certificado A1 / senha | **não** (usa `DRY_RUN_TEST_CERT`) |
| CSC / idToken | **não** |
| Credenciais SEFAZ / endpoints homologação/produção | **não** |
| KMS / rotação / storage de segredo | **não** |

Segredos reais são **proibidos** neste slot. Nenhum segredo é criado ou solicitado nesta auditoria.
Credenciais tornam-se necessárias apenas em F4-real/F5 (Candidato D e além), sob gate.

---

## 36. Segurança

- Nenhum segredo em código/log/bundle; `fiscalEnabled` inalcançável; multi-loja estrito.
- O menor escopo seguro mantém tudo dormente e em memória; **não** abre superfície de rede.
- Blueprint de segurança preservado (`FISCAL_SECURITY.md`, ADR-0009 vault por referência).

---

## 37. Testes

Testes existentes relevantes (não editados nesta auditoria):

| Escopo | Arquivo |
|---|---|
| Dry-run | `lib/fiscal/dry-run/dry-run.test.ts` |
| Snapshot | `lib/fiscal/venda-fiscal-snapshot.test.ts`, `…-service.test.ts`, `…-tax.test.ts` |
| C14N / prova externa | `lib/fiscal/signing/c14n.test.ts`, `c14n-external-proof.test.ts`, `nfce-signer.test.ts` |
| XSD | `lib/fiscal/xsd-worker/client.test.ts` + fixtures |
| Tax-engine | `lib/fiscal/tax-engine/calculator.test.ts` |
| XML / chave | `lib/fiscal/xml/nfce-xml-builder.test.ts`, `nfce-chave-acesso.test.ts` |
| Numeração | `lib/fiscal/numbering/numbering.test.ts` |
| Produto fiscal (GOAL-004) | `lib/produtos/produto-fiscal-upsert.test.ts` |
| Honestidade (guardrail: preview não importa fiscal) | `components/operacoes-v4-preview/preview-honesty.test.ts` |

---

## 38. Evidências

| Ação | Status | Justificativa |
|---|---|---|
| `npx tsc --noEmit` | **reutilizado / bloqueado por ambiente** | worktree nova sem `node_modules` nem `generated/prisma`; instalação pesada não se justifica numa auditoria read-only de escopo ainda ambíguo. Evidência recente: GOAL-001 tsc verde (121 s); GOAL-004 tsc verde na merge readiness. |
| Testes focados fiscais | **reutilizado / bloqueado por ambiente** | idem. Evidência recente: suíte reconciliação **170 arquivos / 2353 passed / 2 expected fail**; auditoria GOAL-004 **61/61**. |
| `npm run build` | **não executado** | política da tarefa: não rodar build completo com escopo indefinido; máquina com restrição de RAM. |
| Inventário Git / grep / leitura de código e docs | **executado** | base factual desta auditoria. |
| `git diff --check` | **executado** | limpo (só o relatório novo). |

Classificação honesta: a auditoria **não re-executou** a bateria; **reutilizou** evidência recente e
documentada, e a execução fresca ficou **bloqueada por ambiente** (worktree sem dependências).

---

## 39. Riscos

### P0 — emissão indevida / segredo / ambiente / estado / duplicação / multi-loja

| ID | Descrição | Evidência | Mitigação | Bloqueante? |
|---|---|---|---|---|
| P0-1 | Um GOAL-005 que crie caller produtivo de emissão/assinatura ou ative `fiscalEnabled` | callers produtivos = 0 hoje | blocklist §44; escopo só interno/dormente | **sim** se violado |
| P0-2 | Escolher o “005” errado (colisão) e duplicar Contador HUB (competência) ou re-implementar snapshot dormente | §5, §15, §16 | reconciliação documental antes de codar | **sim** se violado |
| P0-3 | Qualquer chamada SEFAZ / certificado real / apontar produção | provider só STUB; N6=N7=0 | proibições permanentes; sem credenciais | **sim** se violado |

### P1 — regra tributária falsa / snapshot / XML / status / retry / Contador

| ID | Descrição | Evidência | Mitigação | Bloqueante? |
|---|---|---|---|---|
| P1-1 | Implementar ST/CSOSN 500 sem autoridade contábil → passivo fiscal | `CSOSN_COM_ST` fora do escopo | classe E; exigir contador nomeado | **sim** para Candidato C |
| P1-2 | Declarar “dry-run verde de ponta a ponta” sem golden cases (gate falso) | dry-run bloqueia em `trib.ok` para ST | ADR-0013 + casos-alvo com contador | não para Candidato A |
| P1-3 | Snapshot inconsistente / idempotência não provada | idempotência codificada, não gated por teste dedicado | Candidato A prova determinismo/imutabilidade | não |

### P2 — teste / UX / observabilidade / fallback / metadata legada

| ID | Descrição | Evidência | Mitigação |
|---|---|---|---|
| P2-1 | Lacuna de teste de integridade end-to-end do dry-run | dry-run testado por etapa | Candidato A fecha a lacuna |
| P2-2 | Resíduos legados `metadata.fiscal.tributacao` | follow-up R-1 do GOAL-004 | GOAL próprio de dados |

### P3 — documentação / nomenclatura / dívida sem impacto operacional

| ID | Descrição | Evidência | Mitigação |
|---|---|---|---|
| P3-1 | **Colisão de numeração “005”** não registrada no doc de continuação | §5 | doc-GOAL de reconciliação (§46) |
| P3-2 | Ponteiro “próximo GOAL” obsoleto (aponta upsertProduto já feito) | `FISCAL_RECONCILE_REPORT_001.md:316` | atualizar em doc-GOAL |

---

## 40. Classificação

> **G — ESCOPO AMBÍGUO; RECONCILIAÇÃO DOCUMENTAL NECESSÁRIA.**

Justificativa: o slot “GOAL-005 nomeado” **não tem escopo atribuído** em nenhum documento canônico;
o número “005” colide entre 4 sistemas (§5); o ponteiro “próximo GOAL” está obsoleto; e há candidatos
com classes distintas (C, D, E, F). **Não se inventa** definição. Antes de qualquer implementação é
obrigatório: (a) reconciliar a numeração e (b) ratificar o escopo com gate humano.

Classificação **condicional** dos candidatos, caso o humano ratifique um deles como GOAL-005:

| Candidato | Classe condicional |
|---|---|
| A — Integridade interna dry-run/snapshot | **C** (pronto sem schema) |
| B — Dry-run auferível normativo | **D** (exige ADR-0013) |
| C — ST/CSOSN 500 + matriz | **E** (bloqueado por autoridade contábil) |
| D — Provider SEFAZ × gateway | **F** (bloqueado por G-F5/ambiente) |

---

## 41. Escopo mínimo recomendado

**Candidato A — `FISCAL-DRY-RUN-INTEGRITY-005` (recomendado, sujeito a ratificação):**

- **Objetivo:** provar, por teste interno determinístico, a **integridade** da esteira dry-run e do
  snapshot — determinismo (hashes reproduzíveis), idempotência (1 venda → 1 snapshot) e imutabilidade
  (`deepFreeze`) — para os casos **Simples Nacional B2C já suportados** (CSOSN 102/101/103/300/400),
  com fail-closed comprovado (XML não assinado reprova; XSD indisponível reprova).
- **Não faz:** ST/CSOSN 500; matriz tributária; provider real; transmissão; persistência produtiva;
  caller de venda; ativação; schema; ADR bloqueante; segredo real; qualquer N6/N7.
- **Nível N:** até **N4-interno** no eixo dry-run/integridade; N6=0, N7=0.
- **Impacto:** Contador HUB, Cadastros, PDV, Caixa, Produto, motor Fiscal — **nenhum** (só testes +,
  no máximo, fixtures internas de `lib/fiscal/dry-run`).

**Pré-condição inegociável:** o doc-GOAL de reconciliação (§46) deve **preceder** a implementação,
registrando a colisão “005” e atribuindo o escopo — caso contrário, permanece classe **G**.

---

## 42. Arquivos recomendados

Somente **se** o humano ratificar o Candidato A (nenhum arquivo é tocado nesta auditoria):

| Arquivo | Papel provável |
|---|---|
| `lib/fiscal/dry-run/dry-run.test.ts` | ampliar prova de determinismo/idempotência/imutabilidade |
| `lib/fiscal/dry-run/dry-run-fixtures.ts` | fixtures dos casos SN B2C já suportados (sem ST) |
| `lib/fiscal/venda-fiscal-snapshot.test.ts` | prova de imutabilidade (`deepFreeze`) do snapshot |
| `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_005_*.md` | relatório do GOAL (allowlist própria) |

Blocklist de arquivos (não tocar): `prisma/schema.prisma`, migrations, `app/actions/cadastros.ts`,
`app/api/**`, PDV, Caixa, Estoque, Cadastros, Contador HUB, `auth`/`proxy`/`next.config`,
`lib/produto-fiscal.ts`, workflows, `package.json`/lockfile.

---

## 43. Testes recomendados

- Determinismo: mesma entrada → mesmos hashes de XML/relatório (sem timestamps).
- Idempotência: snapshot repetido não duplica; numeração não é consumida em placeholder.
- Imutabilidade: mutação do snapshot congelado é rejeitada (`deepFreeze`).
- Fail-closed: XML não assinado reprova; XSD indisponível → `FALHA_PERMANENTE` (nunca “ok” por omissão).
- Cobertura de CSOSN suportados (102/101/103/300/400); CSOSN com ST → **pendência explícita**, não default.

---

## 44. Blocklist

- ❌ criar caller produtivo de emissão/assinatura no fluxo de venda;
- ❌ ativar `fiscalEnabled`; ❌ enfileirar `FiscalEmissaoJob`;
- ❌ chamar SEFAZ; ❌ usar/subir certificado A1 real, CSC, idToken;
- ❌ apontar para produção; ❌ alegar N5/N6/N7;
- ❌ implementar regra tributária (ST/CSOSN 500/CFOP/CST/alíquota) sem autoridade contábil nomeada;
- ❌ alterar Prisma/schema/migration; ❌ tocar PDV/Caixa/Estoque/Cadastros/Contador HUB/auth/proxy;
- ❌ reusar o número “005” sem a reconciliação documental;
- ❌ merge/rebase/cherry-pick/reset/stash/force-push/push para `main`; ❌ abrir PR nesta tarefa.

---

## 45. Stop conditions

- Escopo escolhido exige regra tributária e **não** há contador nomeado → **PARAR** (classe E).
- Escopo exige decisão de provider/SEFAZ → **PARAR** até G-F5 (Rafael).
- `git diff` de schema Prisma não vazio (drift) → **PARAR** no checkpoint de drift.
- Qualquer candidato criaria caller produtivo/transmissão → **PARAR** (fora de avaliação simples).
- Ambiguidade de numeração não resolvida antes de codar → **PARAR** (permanece classe G).

---

## 46. Estratégia

1. **Reconciliação primeiro (doc-GOAL curto, sem código):** registrar a colisão “005” (tabela §5) e
   atribuir o escopo do slot nomeado 005 em `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`,
   atualizando o ponteiro obsoleto de “próximo GOAL”. Sujeito a gate humano.
2. **Menor escopo seguro (Candidato A):** implementar a prova de integridade dry-run/snapshot
   (classe C), dormente, sem schema, sem autoridade contábil, N4-interno.
3. **Somente depois**, em GOALs próprios e gated: ST/matriz com contador (E), dry-run normativo
   (ADR-0013, D), provider (ADR-0014, G-F5, F). N6/N7 permanecem 0 até homologação/produção com
   credenciais e aprovação humana.

---

## 47. Conclusão

O **GOAL-005 nomeado da frente Fiscal não está pronto para implementação**: ele **não tem escopo
oficial** e seu número **colide** com a tabela histórica (XSD, já cumprido), o blueprint de código
(snapshot dormente, `b5177cf`) e o Contador HUB (competência mensal) — além da pendência P-05 (C14N,
já fechada). Não existe implementação parcial, branch equivalente nem WIP de um GOAL nomeado 005.
GOAL-004 está fechado; a base é `ba65cd0`; signer dormente; provider só STUB; callers produtivos 0;
N6=0; N7=0; gate global F4→F5 e G-F5/G-F7/G-F12 abertos.

**Classificação: G — escopo ambíguo; reconciliação documental necessária.** O caminho seguro é:
(1) reconciliar a numeração e atribuir o escopo por doc-GOAL com gate humano; (2) então implementar o
**menor escopo seguro** — prova interna de integridade do dry-run/snapshot (classe C, N4-interno, sem
schema, sem autoridade contábil, sem emissão). ST, provider, homologação e produção permanecem em
GOALs próprios, gated, e **não** pertencem a este slot.

**Cadastro fiscal canônico ≠ regra tributária ≠ montagem de XML ≠ assinatura ≠ transmissão ≠
homologação ≠ produção.** Esta avaliação **não inicia** o GOAL-005.
