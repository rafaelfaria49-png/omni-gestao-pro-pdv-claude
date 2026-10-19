# PDV-PARITY-N5-C-E2E-002 — REV2, novo blocker comprovado

Data: 2026-10-19. Executor: Codex; família `openai`.
Branch/worktree: `goal/pdv-parity-n5-c-e2e-002`,
`C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
Main/base: `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`.
Tentativa AEP REV2: 1/3. Resultado técnico: **BLOCKED**.

## Retomada canônica

- ENTRYPOINT, CLAUDE.md e governança lidos. Worktree inicialmente limpa;
  `.aep-active` ausente. Checkout principal e WIPs externos preservados.
- `git fetch origin main`: PASS após liberar escrita de FETCH_HEAD.
  GitHub confirmou PR #285 MERGED, merge `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`.
- `git merge --no-edit origin/main`: fast-forward de `af12ed3` para `9eb59d0`,
  sem reset. `git merge-base --is-ancestor af12ed3d0159f97bb125a62a0466362f4a89af8b HEAD`: exit 0.
- `node scripts/track.mjs status pdv`, seguido de `open pdv`: PASS.
  GOAL 002 READY, plan_rev=2, sete caminhos, zero gates, base correta.
  Somente o GOAL indicado pelo open foi lido.

## Candidato local da Assistência — sem commit técnico

`pdv-assistencia-enterprise.tsx` passa a guardar o payload enviado ao motor.
Após o guard FAILED/PENDING, usa `result.saleId`/`clientSaleId` e total/breakdown
desse payload. Nenhum total/pagamento foi inventado no tipo de retorno do motor.
Como Reenviar não chama novamente o handler do modal, a resolução canônica da
identidade PENDING nas `sales` reais do motor é observada para emitir o mesmo
log com o snapshot da venda confirmada, sem reconstruir valores do carrinho.
Deduplicação local usa identidade/loja e a entrada já existente no log local.
Não cria garantia transacional de auditoria entre abas/servidor ou além da
retenção do log local; não há mudança na API de auditoria.

O contrato de retorno do modal, guard PENDING, reenvio, limpeza, impressão,
cache financeiro e pós-venda permanecem. O teste monta componente, modal e
OperationsProvider reais; fetch e providers periféricos são sintéticos.
Não substitui `handlePaymentConfirm`, `finalizeSaleTransaction` ou `retrySyncSale`.

Cinco casos finais PASS:

1. CONFIRMED: identidade canônica e total 190; dinheiro 10, PIX 20, débito 30,
   crédito 40, prazo 50 e vale 40; log usa exatamente esses valores.
2. FAILED: breakdown inválido rejeitado pelo motor; zero log, carrinho preservado;
   nova tentativa consciente é aceita.
3. PENDING: zero log; reconfirmação bloqueada; retry real envia mesma identidade,
   confirma uma venda e emite um log; repetir retry não cria POST/evento novo.
4. Remount com carrinho alterado: log usa os 190 da venda enviada, não preço 999
   do draft; outro restore não duplica a entrada local.
5. Duas chamadas reais concorrentes: motor compartilha a confirmação e log sai uma vez.

## Blocker funcional fora da allowlist

`COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT`.

Comando reproduzível no candidato preservado:

```powershell
npx playwright test --config e2e/pdv-core.playwright.config.ts --grep 'classic.*D PENDING'
```

Resultado: 1 FAILED, exit 1, em `e2e/specs/pdv-core-n5.spec.ts:159`:

```text
expect(audits()).toHaveLength(1)
Expected length: 1
Received length: 0
Received array: []
```

Passaram antes dessa asserção: zero evento final no PENDING, caixa sem entrada,
modal impedido de reconfirmar, dois POSTs com a mesma clientSaleId, uma venda
CONFIRMED, um `venda_finalizada`, segundo Reenviar sem POST nem evento adicionais.
O teste completo continua FAILED. `venda_finalizada` não substitui `sale_finalized`.
O transporte apenas confirma identidade: não injeta auditoria nem chama o
handler de pagamento para simular o retry.

No código real, Classic retorna no ramo `result.pending`; o único emissor
`sale_finalized` desse componente fica no ramo de confirmação imediata.
`retrySyncSale` confirma no OperationsProvider, sem retornar àquele handler.
`components/dashboard/vendas/pdv-classic.tsx` e o motor compartilhado estão
fora da allowlist REV2. Não foram corrigidos. Não foi ampliado o GOAL.

## Ambiente e limites

Config dedicada seleciona somente o spec N5, sem globalSetup/login produtivo.
Servidor próprio via esbuild em memória, bind `127.0.0.1:4179`, reutilização
desativada, sem Next, `.env`, banco, proxy de rede ou writer de negócio.
Bundle recusa imports de Prisma/server writers não explicitamente isolados.
Playwright intercepta requests de bootstrap, caixa, crédito, venda, audit,
retry e enriquecimento. Origem externa, loja não sintética e rota desconhecida
são recusadas; asserções finais verificam zero requests inesperados/page errors.
Fixtures usam somente loja `n5-c-synthetic`, cliente/produto/operador sintéticos.

Quatro componentes e PaymentModal reais estão no bundle. Motor cliente,
identidade, confirmação, retry, audit local e helper de parcelas são reais.
O driver de Reenviar é sintético e chama `retrySyncSale` real por evento DOM;
não homologa o Histórico de Vendas. Subárvores periféricas de troca, impressão,
recebimento e seleção de acessórios são isoladas e não contam como cobertura.
CSS mínimo serve ao harness; não é auditoria visual do produto.

Provas servidor H-A..H-E são as do inventário histórico preservado na matriz,
com seus SHAs/limites. Não foram repetidas as suítes N5-B1/R4, build, Docker,
smoke autenticado, migrations ou seeds. Nenhum banco/endpoint produtivo foi acessado.

## Validações e resultados

| Comando | Resultado observado |
| --- | --- |
| `npx vitest run lib/pdv/parity-assistencia-finalize-audit.component.test.ts` | PASS final: 1 arquivo, 5 testes; 19/10 00:15:25, 46,23s |
| `npx playwright test --config e2e/pdv-core.playwright.config.ts` | 20 selecionados; 3 PASS (Classic A/B/C), 1 falha de clique do driver, 16 NOT_RUN; exit 1 |
| Playwright focado Classic D, após corrigir o driver | FAILED funcional: auditoria esperada 1, observada 0; exit 1 |
| `npm run typecheck` | FAIL: `generated/prisma` ausente e erros em cadeia; não PASS |
| ESLint focado nos cinco paths `.ts`/`.tsx` do GOAL | PASS final, exit 0 |
| `git diff --check` | PASS antes da ratificação do bloqueio |
| `node scripts/track.mjs verify --all` | PASS: 11 trilhas, ledger/state/REGISTRY/GATES coerentes; repetir após block |
| R / `close pdv` / push / PR | Não executados: aceite funcional não satisfeito |

Tentativas anteriores de infraestrutura, sem cobertura contabilizada: EPERM no
cache temporário do sandbox, import do bundler no jsdom, cwd/module format do
servidor e seletor de cliente/stacking do driver. Foram corrigidas somente na
infra autorizada; o último retry falhou na asserção de negócio, não no driver.
O primeiro lint encontrou `children` como prop no teste (corrigido); outra
execução não resolveu um módulo Babel, mas a execução final passou.

A worktree tinha somente cache `.vite` em node_modules. Os lockfiles da raiz e
da worktree foram conferidos idênticos; cache preservado em temporário e criada
junction ignorada para as dependências já instaladas, sem mudar package/lock.
O typecheck então executou e terminou com 241 arquivos com diagnósticos. Além
da ausência de Prisma, havia um erro novo na fixture À Prazo do teste; foram
completados `primeiroVencimento`/`intervalDias`. Vitest e lint finais passaram.
O typecheck global não foi reexecutado após a parada; não se afirma tipos verdes.
Não se gerou Prisma nem se alteraram paths produtivos fora da allowlist para contornar o gate.

## Matriz, preservação e ratificação

Matriz REV2: **3 TESTED, 16 PARTIAL, 1 BLOCKED, 0 UNSUPPORTED_BY_DESIGN**.
São 20 células explícitas. TESTED apenas Classic A/B/C, com limite de I/O
sintético. Classic D é PARTIAL porque o teste completo falha; Classic E é
BLOCKED pela prova de retry. Assistência tem prova de componente, não E2E.
As outras superfícies permanecem PARTIAL; 16 NOT_RUN nunca contam como PASS.

Os documentos REV1 foram preservados integralmente abaixo e no commit original.
Código/testes ficam sem staging/commit na worktree: não há candidato técnico
aprovado. Somente matriz/evidência do blocker são commitadas como documentação,
e `node scripts/track.mjs block pdv --by=gate --reason=...` ratifica o estado
por meio do próprio protocolo. Ledger/state/REGISTRY/GOAL não são editados à mão.
Não se executa `close`, não se marca DONE, não se solicita R sobre SHA inexistente,
não se faz push nem merge. Nova decisão humana de escopo é necessária.

Fingerprints dos cinco arquivos técnicos locais (conteúdo, não SHAs de commit):

| Caminho | `git hash-object <path>` |
| --- | --- |
| `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | `b74eccd202a9a1eef0a12cd26393ffa26a112fbd` |
| `lib/pdv/parity-assistencia-finalize-audit.component.test.ts` | `5114c9adc813bd6879e136310563b04a42da2556` |
| `e2e/pdv-core.playwright.config.ts` | `cb8a7652f45fbffe48a7b7bcc708b01091597ad7` |
| `e2e/fixtures/pdv-core.ts` | `5bc8b515c058111d2c0decbf58a5f9adcb8c7718` |
| `e2e/specs/pdv-core-n5.spec.ts` | `ec67ad61774164d09e92d0d6518cddec6e42e1b8` |

```text
TECHNICAL_COMMIT=NONE
BLOCKED_HISTORY_PRESERVED=YES
ENVIRONMENT_ISOLATED=YES_SYNTHETIC_IO
N5_B1_CLOSEOUT=BLOCKED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
R_EXECUTOR=NONE
R_FAMILY=NONE
R_VERDICT=NOT_REQUESTED_ACCEPTANCE_FAILED
AEP_CLOSE_COMMIT=NONE
GOAL_STATUS=BLOCKED
PUSH_BRANCH=NOT_PUSHED
PR_NUMBER=NONE
PR_URL=NONE
BLOCKERS=COVERAGE_BLOCKED_CLASSIC_RETRY_AUDIT;TYPECHECK_GENERATED_PRISMA_MISSING
NEXT_STEP=RESOLVER_GATE_COM_EVIDENCIA
```

CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não alterados: fora da allowlist e sem
entrega técnica aprovada. Nenhum N6, N7 ou outro GOAL foi iniciado.

---

## Histórico REV1 preservado

# PDV-PARITY-N5-C-E2E-002 — evidência de bloqueio

Data: 2026-10-18. Executor: Codex; família `openai`.
Main/base: `180a2f2ab450cc2686b5087dc09b1a0ee58b5f72`.
Branch: `goal/pdv-parity-n5-c-e2e-002`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002`.
Tentativa AEP: 1/3. Resultado: **BLOCKED — COVERAGE_BLOCKED_AUDIT_ASSISTENCIA**.

## Inicialização

`git fetch origin main` atualizou `origin/main` de `1751080` para `180a2f2`.
A primeira execução no sandbox não pôde escrever FETCH_HEAD; a execução com
permissão para os metadados Git terminou com exit 0. Consulta GitHub confirmou
PR #281 MERGED, merge `17510806bdfe736f6bc8a19ec732b7fd035de69b`, ancestral
da base. Ledger contém N5-B2 DONE; N5-C era READY e único GOAL atual.

Criadas somente a branch/worktree pedidas, a partir de `origin/main`.
`node scripts/track.mjs status pdv` e `open pdv`: exit 0, base correta,
árvore limpa e allowlist de cinco paths. Nenhum gate produtivo liberado.
Nenhum marcador AEP foi encontrado nas outras worktrees PDV inventariadas;
o app não mostrou outra sessão PDV ativa. WIPs da checkout principal e de
outras sessões não foram alterados.

## Evidência que impede o aceite

Análise do AST dos quatro arquivos de superfície, com TypeScript já instalado,
sem executar aplicação, callbacks, requests ou writers:

```text
classic: appendAuditLog/sale_finalized em 2286
assistencia: appendAuditLog/sale_finalized = ZERO
supermercado: appendAuditLog/sale_finalized em 1823
venda-completa: appendAuditLog/sale_finalized em 1055

Assistência handlePaymentConfirm: linhas 1918–2181
Blob: 185085ca7536a4f9d263b988e9d609ea46421678
Última alteração do componente: 21df54b799bec74f2e1761f194221e0d550bb1e0
PENDING: 2095–2111, retorno antes do pós-venda
CONFIRMED: reset em 2150, toast Venda finalizada em 2164
sale_finalized: ausente no componente inteiro
```

O AST percorreu chamadas `appendAuditLog`, leu a propriedade literal `action`
dos argumentos e registrou somente `sale_finalized`. A inspeção textual de
todo `lib`, `app` e `components` corroborou a ausência de emissor Assistência.

Busca reproduzível no objeto imutável:

```powershell
git grep -n 'sale_finalized' 180a2f2ab450cc2686b5087dc09b1a0ee58b5f72 -- components/dashboard/vendas/pdv-assistencia-enterprise.tsx
git grep -n 'sale_finalized' 180a2f2ab450cc2686b5087dc09b1a0ee58b5f72 -- lib/operations-store.tsx lib/pdv-finalize-integrity.ts lib/events/event-bus.ts lib/automation/automation-engine.ts
```

Ambas retornam exit 1, zero ocorrências (resultado esperado da busca, não de um
teste). O primeiro script auxiliar de inventário tratou esse exit 1 como erro;
a busca foi repetida com tratamento explícito e confirmou zero ocorrências.
Isso não é falha do produto em runtime nem teste executado.

`venda_finalizada` do motor é notificação local separada, sem emissão
`sale_finalized` nesses arquivos. O teste
`lib/pdv-pending-post-sale-effects.static.test.ts` exige em Assistência apenas
`setAutoPrintInput` e `Venda finalizada` no ramo CONFIRMED. Portanto sua aprovação
anterior não é evidência positiva do requisito de auditoria nessa superfície.

O GOAL exige audit-log nas quatro superfícies e determina parar se uma lacuna
real não puder ser resolvida na allowlist. O componente produtivo está fora
dela. Não houve alteração do componente, do motor, de auth, proxy, schema,
configuração global, CI ou deploy. Não houve ampliação da allowlist.

## Inventário e matriz

`docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md` contém as 20 células, dez arquivos de
contrato com SHA/caso/limites e a distinção entre cliente sintético e motor
servidor com TransactionClient fake. R4 histórico: 46 arquivos/662 testes PASS
e 34/34 testes de componentes, conforme a evidência R4 existente; não reexecutado.
B2 histórico: 119 testes PASS; não reapresentados como E2E desta base.

Resultado da matriz: 0 TESTED, 19 PARTIAL, 1 BLOCKED, 0 UNSUPPORTED_BY_DESIGN.
Ausência de audit na Assistência é blocker, não diferença intencional.

## Validação desta execução

| Comando/ação | Resultado |
| --- | --- |
| `node scripts/track.mjs status pdv` | PASS; pré-condições descritas acima |
| `node scripts/track.mjs open pdv` | PASS; tentativa 1/3, cinco paths, zero gates |
| Inventário AST/fontes | Blocker E1 comprovado por inspeção, sem execução funcional |
| `npx playwright test --config e2e/pdv-core.playwright.config.ts` | NOT_RUN: parada no inventário antes de criar config/fixture/spec |
| `npm run typecheck` | NOT_RUN: parada de cobertura; apenas documentos alterados |
| `node scripts/track.mjs verify --all` | PASS antes do bloqueio; 11 trilhas e arquivos gerados coerentes |
| `git diff --check` | PASS antes do bloqueio |
| Revisão independente R | NOT_SUBMITTED: não há candidato técnico com testes aprovados |
| `check pdv` / `close pdv` | NOT_RUN: aceite não satisfeito; usar `block` canônico |

O bloqueio é registrado por `node scripts/track.mjs block pdv --by=gate`.
Estado, ledger, movimentação do GOAL e REGISTRY são escritos somente pelo AEP.
Estes dois documentos acompanham o commit canônico de bloqueio; não há commit
técnico de implementação, fechamento DONE, push, PR ou merge nesta execução.

Nenhum ambiente E2E foi iniciado ou comprovado isolado. Nenhuma credencial ou
`.env` de produção foi lida; nenhum servidor existente foi reutilizado. Zero
vendas/caixa/estoque/pagamentos reais. Não foram executados Docker, build,
migrations, seeds, smoke produtivo, R4 inteiro ou instalação de dependências.

## Pendências e parada

```text
ENVIRONMENT_ISOLATED=NOT_STARTED
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
N5_B1_CLOSEOUT=BLOCKED
TECHNICAL_COMMIT=NONE
R_EXECUTOR=NONE
R_FAMILY=NONE
R_VERDICT=NOT_SUBMITTED
AEP_CLOSE_COMMIT=NONE
PUSH_BRANCH=NOT_PUSHED
PR_NUMBER=NONE
NEXT_STEP=RESOLVER_GATE_N5_C
```

Decisão humana necessária pelo rito AEP para tratar a ausência de auditoria
no código produtivo e retomar o escopo. Nenhum GOAL adicional iniciado.
Worktree preservada com a evidência; limpeza depende de integração/validação
posteriores. CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não alterados: fora da
allowlist e nenhuma feature implementada. Riscos de smoke autenticado,
loja/terminal e hardware continuam abertos nos registros anteriores.


---

## Diagnóstico focado REV3 — 19/10/2026, GOVERNANCE_ONLY

Autorização: PDV-N5-C-REV3-RETRY-AUDIT-PLAN-004. Nenhum código implementado,
nenhum E2E/teste técnico executado, nenhum Prisma gerado nesta sessão.
Main confirmada após fetch: a6777234bcc336fef64ecb7491d5705bdd404b39.
BLOCKED local: bc9fab7cf853f3b03759b84bcf7a63b11869c3a6. Rev2 (PR #285,
commit de plano 4f7a110) é ancestral de origin/main. Ambos os eventos BLOCKED
permanecem byte a byte no ledger; o segundo é levado a main por este PR.

Os cinco fingerprints do WIP acima foram reconferidos e coincidem. A worktree
original não recebeu stash, reset, checkout, merge nem edição técnica.
Branch de plano criada do BLOCKED, merge normal de origin/main: 7aac8bb.
open pdv na original recusou por inexistir READY; não abriu marcador.
O rito humano de planejamento AEP §§2–3 permite reabrir o mesmo GOAL, sem close
de execução. Registry/verify reconciliam exclusivamente o plano e as projeções.

### Causa e contrato

APPLICATION_AUDIT_GAP localizado no Classic. Inspeção estática corrobora a
falha runtime registrada na rev2, sem reexecução nesta sessão:

- e2e/specs/pdv-core-n5.spec.ts:81,159: auditoria filtra sale_finalized;
  o caso D já exige separadamente um venda_finalizada e um log de auditoria.
- e2e/fixtures/pdv-core.ts:53–67,121–126: backend confirma clientSaleId,
  captura POST de auditoria e driver chama retrySyncSale real; não injeta log.
- pdv-classic.tsx:2187–2243: finalização real; FAILED retorna; PENDING registra
  identidade e retorna antes dos efeitos definitivos.
- pdv-classic.tsx:2286–2290: único sale_finalized da finalização está no
  caminho direto CONFIRMED. Não há observador de confirmação que o emita
  após retry. O componente já recebe sales na linha 276.
- operations-store.tsx:1507–1533,1653–1688: retry busca a venda pendente
  pela mesma clientSaleId/id e chama persistPendingSale; confirmação atualiza
  sales e emite notificação UI uma vez, sem voltar ao handler Classic.
- audit-log.ts:66–83: appendAuditLog adiciona log local e envia pelo audit-sync
  à API. audit-sync.ts:3–21 é best-effort, não autoridade transacional.
- operations-store.tsx:1357–1387 e automation-engine.ts:190–207 distinguem
  notificação UI de automação definitiva. sale-automation-dispatch.ts:1–27
  documenta create-vs-replay server-side; sem alteração desses caminhos.

O retry observado antes do bloqueio preservou identidade em dois POSTs, uma
venda confirmada e um evento UI; repetir Reenviar não acrescentou POST/evento.
Auditoria esperada: sale_finalized=1; real: sale_finalized=0. PENDING: ambos
zero. Confirmação direta: chamada de auditoria presente no código (Classic
A/B/C passaram historicamente). Não há novo PASS declarado nesta sessão.
TEST_ASSERTION_INCORRECT e FIXTURE_DEFECT não explicam a ausência: a fixture
conserva os emissores reais e captura auditoria em canal próprio; o contrato
F-08 exige esse canal. venda_finalizada não o substitui.

Fronteira: somente Classic + teste comportamental específico, observando a
identidade própria nas sales confirmadas e usando snapshot real. Nenhuma
mudança compartilhada é necessária para o contrato local demonstrado.
Exigência futura de garantia durável/cross-tab exige autorização específica
para o contrato compartilhado; não está incluída nesta rev3.

### Prisma e preservação das provas

Schema linhas 1–4 já aponta ../generated/prisma; .gitignore:20–21 o exclui;
lib/prisma.ts:1 importa esse destino. generated e generated/prisma ausentes
na original; node_modules é junction para C:/Projetos/omni-gestao/node_modules.
package.json tem postinstall=prisma generate. Reutilizar node_modules não
gera o artefato ignorado por worktree. Geração futura restrita ao destino
local verificado, sem .env produtivo, banco, migrations ou mudança de schema,
package/scripts. Não foi tentada nesta sessão.

Allowlist adicional rev3: components/dashboard/vendas/pdv-classic.tsx;
lib/pdv/parity-classic-finalize-audit.component.test.ts; generated/prisma/**
(artefato ignorado, sem commit). Os sete paths rev2 são preservados.
Matriz permanece integralmente 3 TESTED / 16 PARTIAL / 1 BLOCKED, baseada
somente nas execuções rev2 registradas. Cinco F-08 e vinte combinações
continuam exigidos; R independente ainda pendente.
N5_B1_CLOSEOUT=BLOCKED; PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED.
Plano READY não resolve o gap técnico nem comprova tipos verdes.
NEXT_STEP=HUMANO_MERGEAR_N5_C_REV3.

Validação de governança REV3: registry PASS; verify --all PASS (11 trilhas);
git diff --check PASS. Typecheck/build não aplicáveis à entrega somente
documental; E2E e geração Prisma reservados à retomada. Nenhuma promoção
de cobertura. CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT sem alteração, pois
não há nova entrega funcional. WIP e matriz preservados.
