<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-C-E2E-002",
  "track": "pdv",
  "title": "N5-C — cobertura automatizada mínima e matriz final do PDV Core",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-c-e2e-002",
  "worktree": "C:/Projetos/omni-gestao/.worktrees/pdv-n5-c-e2e-002",
  "test_command": "npx playwright test --config e2e/pdv-core.playwright.config.ts",
  "allowlist": [
    "e2e/pdv-core.playwright.config.ts",
    "e2e/fixtures/pdv-core.ts",
    "e2e/specs/pdv-core-n5.spec.ts",
    "docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md",
    "docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "lib/pdv/parity-assistencia-finalize-audit.component.test.ts",
    "components/dashboard/vendas/pdv-classic.tsx",
    "lib/pdv/parity-classic-finalize-audit.component.test.ts",
    "generated/prisma/**",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "lib/pdv/parity-supermercado-finalize-audit.component.test.ts",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "lib/pdv/parity-venda-completa-finalize-audit.component.test.ts",
    "lib/pdv-pending-post-sale-effects.static.test.ts",
    "lib/pdv/current-main-correction.component.test.ts"
  ],
  "gates_liberados": [],
  "read_budget": 50,
  "plan_ref": "PDV-N5-C-REV5-REGRESSION-REOPEN-006",
  "plan_rev": 5,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta: auditoria local, remount Assistencia, compatibilidade de dois testes herdados, componentes reais, E2E isolados e documentos; sem motor/backend",
  "depends_on": [
    "PDV-PARITY-N5-B2-PIN-KEYMAP-001"
  ],
  "stop_after_goal": true,
  "autorizacoes": {
    "commit": true,
    "push": true,
    "branch_only": "goal/pdv-parity-n5-c-e2e-002",
    "merge": false
  }
}
-->

# N5-C — cobertura mínima e fechamento técnico do Core

## Entrada e autorização

Sucessor de `PDV-PARITY-N5-B2-PIN-KEYMAP-001` na trilha existente `pdv`.
READY é estado de planejamento; `depends_on` documenta a dependência e não é
um gate automático do AEP. Antes de executar, confirmar B2 DONE no ledger,
R favorável e merge da entrega B2 em `origin/main`. Novo comando humano e
sessão própria são necessários. Na retomada, integrar o planejamento mergeado
e a main atualizada na branch/worktree de implementação declaradas, preservando
o commit BLOCKED; rodar `status pdv` e `open pdv` e ler este GOAL.
Não iniciar C na entrega de planejamento nem na sessão de B2.

Planejamento original: `PDV-N5-FINAL-HANDOFF-B2-C-001`, 14/10/2026.
Replanejado por autorização humana `PDV-N5-C-REV2-UNBLOCK-PLAN-003`, 18/10/2026,
revisão 2, pelo ritual de planejamento do AEP §§2–3.
Commit/push autorizados somente na branch acima e allowlist. Merge é humano.
Nenhum gate de dados/auth/CI/deploy liberado; ausência de ambiente isolado
ou necessidade de caminho adicional exige parar, sem improvisar produção.

## Histórico da reabertura rev2 (preservado; limites atualizados pela rev4)

O bloqueio original permanece integralmente no commit
`af12ed3d0159f97bb125a62a0466362f4a89af8b`, no ledger append-only e nos documentos
originais de evidência/matriz. Motivo: `COVERAGE_BLOCKED_AUDIT_ASSISTENCIA`.
A reabertura move este mesmo GOAL de `_closed/goals/` para `goals/`, com
`status=READY` e `plan_rev=2`; não cria GOAL sucessor nem evento READY no ledger.
READY é estado de planejamento, não correção executada nem cobertura TESTED.
Naquela reabertura, o histórico era 0 TESTED, 19 PARTIAL e 1 BLOCKED.
A evidência rev2 posterior mantém 3 TESTED, 16 PARTIAL e 1 BLOCKED; esta rev4
não altera essas contagens nem substitui a matriz preservada.

A entrega de planejamento rev2 ocorreu exclusivamente na branch
`plan/pdv-n5-c-rev2-audit-assistencia`, worktree dedicada
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev2-audit-assistencia`,
criada do commit BLOCKED validado. Commit/push e um PR contra main autorizados
somente para bloqueio original + plano rev2. Sem código produtivo, implementação,
E2E, `open`/`close` AEP ou merge nesta entrega. A implementação só poderá
começar após merge humano deste planejamento e retomada em sessão própria.

## Contrato original rev2 (ampliado pelas rev3 e rev4 após merge humano)

Os cinco paths anteriores de E2E/documentação são preservados. Na rev2, a allowlist
acrescentou somente o componente Assistência e seu teste de componente acima.
Nenhum outro componente, backend, motor compartilhado, schema, Auth.js, API de
auditoria, financeiro, configuração global ou dependência poderá ser modificado.
Nenhum gate de dados/auth/CI/deploy é liberado por esta revisão.

- Emitir `sale_finalized` pelo padrão `appendAuditLog` já existente, somente
  depois de `finalizeSaleTransaction` retornar `CONFIRMED` na Assistência.
- Nunca emitir em `FAILED` ou `PENDING`; retry que confirma deve emitir uma
  única vez, sem duplicar evento para a mesma confirmação.
- Usar `saleId`, total e pagamentos reais retornados pela finalização confirmada,
  sem reconstruir valores do carrinho ou de respostas fabricadas pelo teste.
- Preservar carrinho, retry, impressão, efeitos pós-venda e financeiro vigentes.
- Provar pelo componente/handler real no arquivo
  `lib/pdv/parity-assistencia-finalize-audit.component.test.ts`: CONFIRMED com
  payload real do resultado, FAILED e PENDING sem evento, PENDING→retry→CONFIRMED
  e repetição da mesma confirmação sem duplicação. Pode isolar transportes,
  mas não substituir o handler sob teste nem usar só inspeção estática.
- Validação futura focada: `npx vitest run lib/pdv/parity-assistencia-finalize-audit.component.test.ts`,
  seguida dos E2E previstos e `npm run typecheck`, com SHA/comandos/resultados
  registrados. A correção local não substitui os cinco cenários F-08.

## Objetivo e inventário antes de criar testes

Fechar a cobertura automatizada mínima do PDV Core usando os cinco cenários
F-08 de `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md`: split, vale, À Prazo,
PENDING/retry e audit-log. Reutilizar provas existentes, identificando contrato,
arquivo/caso, SHA, resultado e limite. Não duplicar testes do mesmo contrato.
Criar somente os E2E/fixtures que faltam para ligar interações reais das quatro
superfícies ao contrato já provado. C é C3/ALTO pelo contrato entre bordas e
motor e inclui as correções locais de auditoria delimitadas nas rev2, rev3 e rev4.

Referências iniciais read-only (reavaliar na main após B2):

| Cenário F-08 | Prova existente a reaproveitar | Lacuna a verificar antes de adicionar E2E |
| --- | --- | --- |
| split | `lib/pdv-payments.test.ts`, `lib/pdv/parity-payment-props.test.ts`, `lib/pdv/parity-finalize-behavior.test.ts` | entrada pelo runtime/modal, breakdown e confirmação; F12 onde implementado, caminho do modal na Venda Completa |
| vale | `lib/ops-upsert-venda-vale.test.ts`, `lib/ops-upsert-venda-vale-concorrencia.test.ts`, contratos de props/finalização | seleção/atribuição do crédito, saldo e readback conforme estado confirmado |
| À Prazo | `lib/ops-upsert-venda-aprazo.test.ts`, `lib/ops-upsert-venda-pix-aprazo-resync.test.ts` | cliente, entrada/parcelas e títulos no caminho de UI, sem refazer provas transacionais |
| PENDING/retry | `lib/vendas/sale-client-sync.test.ts`, `lib/vendas/local-sale-identity.test.ts`, `lib/pdv/parity-finalize-behavior.test.ts` | pendência sem sucesso/efeitos finais; Reenviar mesma identidade e confirmação única |
| audit-log | `lib/pdv-pending-post-sale-effects.static.test.ts` e chamadas `appendAuditLog` das superfícies | evento `sale_finalized` nas quatro superfícies só após CONFIRMED; ausente em FAILED/PENDING e sem duplicação após retry |

`e2e/specs/02-pdv-vendas.spec.ts` e `06-pdv-caixa-historico.spec.ts` são referências
de infraestrutura, não prova dos cinco fluxos completos. R4 já publicado é
evidência reaproveitável; não repetir a execução R4, smoke produtivo, build ou
Docker. Se um contrato já tiver prova suficiente, citar a prova e criar apenas
a ligação de UI ainda sem cobertura. Testes herdados podem ser executados de
forma focada quando necessário para validar a evidência do SHA atual, sem
reescrevê-los ou criar cópias.

## Ambiente sintético ou isolado — zero escrita produtiva

A configuração dedicada `e2e/pdv-core.playwright.config.ts` deve selecionar
somente `pdv-core-n5.spec.ts`, sem herdar o setup de login produtivo nem carregar
`.env`/credenciais de produção por conveniência. Fixtures próprias, IDs de loja,
terminal, produto e cliente sintéticos. Antes de qualquer ação, validar origem
local/isolada, recusar aliases produtivos e bloquear requests não previstos.
Não reaproveitar servidor local que possa estar conectado ao banco produtivo.

Preferir backend/transportes sintéticos isolados, mantendo componentes, handlers
e fluxo do Core reais sob teste. Requests de negócio devem ser interceptados
antes de alcançar writers reais; cobrir também bootstrap, caixa, audit e retry.
Se for indispensável DB, aceitar apenas instância descartável comprovadamente
isolada, sem credenciais, tenants ou endpoints produtivos. Setup/teardown não
pode escrever em produção. Sem migrations, seeds globais ou novo bypass de auth.
Asserções não podem apenas repetir respostas programadas pela fixture: observar
interação, payload emitido pelo runtime, transições e efeitos reais do cliente.

Registrar explicitamente quais provas usam I/O sintético e quais garantias
server-side vêm dos testes existentes. Fixture não comprova persistência real,
homologação operacional, Auth.js ou smoke de produção. Falta de ambiente seguro
é BLOCKED; skip, toast isolado ou shell aberto não são PASS.

## Critérios de aceite e matriz final

- Inventário dos cinco cenários e cobertura final para `classic`, `assistencia`,
  `supermercado`, `venda-completa`, com referência verificável para cada célula.
  Matriz distingue TESTED/PARTIAL/BLOCKED/UNSUPPORTED_BY_DESIGN e preserva
  diferenças intencionais; Next/Black seguem experimentais, fora da exigência.
- E2E/fixtures faltantes mínimos implementados somente na allowlist;
  `test_command` verde, zero skip mascarando lacuna; `npm run typecheck` verde
  quando houver `.ts`. Registrar SHA, contagens, comandos e isolamento.
- Split conserva soma/meios; vale conserva atribuição/saldo; À Prazo conserva
  entrada/parcelas/títulos; PENDING não gera efeitos de CONFIRMED; retry usa
  mesma `clientSaleId` e confirma uma vez; audit não antecipa nem duplica evento.
  Cada afirmação deve indicar se foi provada no cliente sintético ou no servidor.
- Consolidar resultado em `docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md` e evidência
  própria. Declarar cobertura técnica mínima completa somente quando as cinco
  linhas nas quatro superfícies tiverem prova suficiente; registrar lacuna real
  e parar se a allowlist não permitir resolvê-la. Código produtivo limitado às
  correções de auditoria Assistência e Classic preservadas e às correções locais
  Supermercado e Venda Completa delimitadas na rev4, após merge humano.
- Registrar riscos operacionais não homologados: acesso autenticado, loja/terminal,
  oito combinações do smoke B1, operação física/hardware/ambiente real quando
  aplicável. `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` e
  `N5_B1_CLOSEOUT=BLOCKED` permanecem conforme PR #269/GOAL 004; nunca PASS.
- Encerramento técnico do Core não depende de N6/N7, Fiscal completo ou Auth.js
  legado. Não declarar homologação produtiva como consequência dos E2E isolados.
- R obrigatório por família declarada diferente de `openai` (`anthropic` ou
  `humano`, conforme `executors.json`), revisando SHA/diff, allowlist, cobertura,
  isolamento e evidências. Registrar família, identidade, SHA e veredito;
  segunda instância OpenAI não cumpre R. Sem R favorável, não encerrar DONE.


## Histórico da reabertura rev3 — causa demonstrada e fronteira daquela revisão

Autorização humana: `PDV-N5-C-REV3-RETRY-AUDIT-PLAN-004`, 19/10/2026.
`PLAN_REV=3`, `STATUS=READY`. Mesmo GOAL; sem evento READY no ledger.
Os dois BLOCKED anteriores permanecem append-only, inclusive o commit
`bc9fab7cf853f3b03759b84bcf7a63b11869c3a6` e o bloqueio original
`af12ed3d0159f97bb125a62a0466362f4a89af8b`. Evidência e matriz anteriores
permanecem como resultados históricos, sem promoção de qualquer célula.

Planejamento somente na branch `plan/pdv-n5-c-rev3-retry-audit`, worktree
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev3-retry-audit`,
criada do BLOCKED validado e integrada por merge normal com origin/main
`a6777234bcc336fef64ecb7491d5705bdd404b39`. Commit/push e PR contra main
autorizados apenas para governança nesta branch, sem merge. Sem implementação,
geração Prisma, E2E, open/close de execução ou DONE nesta sessão de planejamento.
Após merge humano e novo comando, retomar na branch/worktree de implementação
já declaradas nos metadados, integrando o plano por merge normal e preservando
integralmente o WIP da Assistência, E2E e fixtures. Não usar stash/reset/checkout
na worktree original. Se o merge não preservar esse WIP, parar e reconciliar
com o humano; não descartar nem substituir os arquivos por cópias antigas.

**Classe: APPLICATION_AUDIT_GAP.** No E2E existente Classic D, a expectativa
é um `sale_finalized` via `appendAuditLog` após retry CONFIRMED. O resultado
registrado foi zero logs e um `venda_finalizada`. A fixture não substitui o
handler Classic, retrySyncSale ou auditoria; apenas intercepta I/O. Não é troca
de nomes nem fixture defeituosa. Não afrouxar a asserção para obter PASS.

`sale_finalized` é auditoria local com envio best-effort à API de auditoria.
`venda_finalizada` no browser é notificação local de UI, deduplicada por
identidade no motor; a automação definitiva do mesmo nome nasce server-side
no create-vs-replay da persistência. Esses três papéis não são equivalentes.
O harness não prova automação/persistência server-side real.

O Classic emite auditoria na confirmação direta, retorna antes desse emissor
em PENDING, e o retry confirma no motor sem reentrar no handler. O componente
já observa `sales`; portanto a correção pode acompanhar a identidade pendente
e sua confirmação real, usando o contrato existente, sem modificar o motor.
Os paths novos de código são exclusivamente:

- `components/dashboard/vendas/pdv-classic.tsx`.
- `lib/pdv/parity-classic-finalize-audit.component.test.ts`.

Escopo futuro: registrar somente vendas iniciadas por esse Classic; zero log
em FAILED/PENDING; confirmação direta e PENDING→retry→CONFIRMED devem emitir
exatamente um `sale_finalized` da mesma identidade/loja, com saleId canônico,
total e breakdown reais da venda enviada/confirmada. Não reconstruir do
carrinho editado nem auditar vendas históricas indiscriminadamente. Deduplicar
o caminho direto e a observação de confirmação; repetir retry, render ou
restauração não pode duplicar a mesma auditoria local. Preservar fluxo de
pagamento, carrinho, guard de pendência, impressão e demais efeitos atuais.
Não criar garantia transacional de auditoria entre abas/servidor ou além da
retenção do log local. Se isso ou qualquer mudança em operations-store, motor,
persistência ou auditoria compartilhada for necessário, PARAR e reportar
`NEXT_STEP=AUTORIZACAO_HUMANA_CONTRATO_AUDITORIA`, sem ampliar caminhos.

O novo teste deve montar componente/PaymentModal/OperationsProvider reais,
isolando somente transportes e providers periféricos: confirmação direta,
FAILED, PENDING sem evento definitivo, retry confirmado com a mesma
clientSaleId, total/breakdown do snapshot enviado mesmo com draft alterado,
e repetição/remount sem duplicação. Não substituir o handler, finalização ou
retry reais. Manter o E2E existente e suas asserções distintas para auditoria
e notificação; eventual espera assíncrona só pode sincronizar o efeito real.
Validação futura focada: `npx vitest run lib/pdv/parity-classic-finalize-audit.component.test.ts lib/pdv/parity-assistencia-finalize-audit.component.test.ts`,
os cinco cenários F-08 nas quatro superfícies e `npm run typecheck`.
Sem evidência correspondente, nenhuma das 20 células recebe TESTED.
Se outra superfície falhar fora da allowlist, registrar e parar.

### Prisma local para o typecheck futuro

O schema já declara `output = "../generated/prisma"`; lib/prisma.ts importa
esse destino. Ele é gitignored e não vem do checkout. A worktree original
não tem generated/prisma; sua node_modules é junction para a raiz, sem geração
local. Postinstall declara prisma generate, mas a reutilização das dependências
não o executou nessa worktree; a sessão anterior não gerou por falta de escopo.
É ausência de artefato local, não necessidade de mudar schema/package/scripts.

Acrescentar `generated/prisma/**` somente para geração local ignorada, nunca
staging/commit. Antes de gerar, verificar caminho absoluto, ancestrais e destino:
nenhum pode redirecionar para outra sessão por junction/symlink/reparse point.
Não sobrescrever diretório compartilhado nem alterar a junction node_modules.
Usar o CLI Prisma já instalado, com schema explícito dessa worktree e sem
instalar dependências ou rodar postinstall compartilhado: `node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma`.
Antes do CLI, verificar ausência de .env na raiz/prisma e demais arquivos de
env que ele carregaria automaticamente; se existirem credenciais, parar sem
mover/apagar arquivos do usuário. Desabilitar autoinstall com
`PRISMA_GENERATE_SKIP_AUTOINSTALL=1`, sem escrita nas dependências compartilhadas.
Não carregar .env produtivo; se o CLI exigir URLs na validação, fornecer somente
URLs descartáveis loopback em processo, nunca conectar. Sem migration, db push,
seed, introspecção ou conexão ao banco. Preservar schema, package.json, lockfiles
e scripts. Destino compartilhado ou necessidade de escrevê-lo implica parada.
Gerar só na retomada autorizada, depois rodar typecheck e registrar o resultado
real; não presumir que a geração resolve outros diagnósticos.

Os cinco F-08, ambiente E2E isolado, R independente por outra família e os
estados `N5_B1_CLOSEOUT=BLOCKED` e `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED`
continuam obrigatórios. Esta rev3 não libera gates de dados/auth/CI/deploy.

## Reabertura rev4 — auditoria das superfícies restantes

Autorização humana: `PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005`, 20/10/2026.
`PLAN_REV=4`, `STATUS=READY`, no mesmo `PDV-PARITY-N5-C-E2E-002`. O ritual de
planejamento AEP §§2–3 move o GOAL fechado de volta a `goals/` e regenera os
derivados por `registry`; READY não produz evento no ledger. Esta seção atualiza
os limites históricos das rev2/rev3; as demais exigências continuam vigentes.

Pré-flight: `origin/main=13700862405a89da3c7d16702318735a88348133`, ancestral do
BLOCKED rev3 `0ca9eb1a28d254822db60f69cdcd6be868424101`. Seu pai documental
`d0ef175f2438f1c302431f81dbe5530968c5a658` contém somente matriz e evidência.
Os três BLOCKED de 18/10, 19/10 e 20/10 UTC permanecem literalmente no ledger,
sem remoção, reescrita, compactação ou nova classificação. Matriz/evidências
REV1–REV3 permanecem integrais: E2E rev3 **13 PASS, 1 FAIL, 6 NOT_RUN** e matriz
**13 TESTED, 6 PARTIAL, 1 BLOCKED**; replanejar não promove cobertura.

Esta entrega usa somente `plan/pdv-n5-c-rev4-retry-audit`, em
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev4-retry-audit`, criada do
BLOCKED rev3 validado. `git merge --no-edit origin/main` é seguro e retorna
Already up to date porque main já é ancestral. Commit/push e um único PR contra
main autorizados somente nessa branch de planejamento. Não executar implementação,
E2E, geração Prisma, `open`/`close` de execução, merge do PR ou DONE nesta entrega.
Relatório e fingerprints: `_closed/reports/PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005.md`.

### Fronteira adicional e verificação read-only da Venda Completa

Todos os dez padrões da allowlist rev3 permanecem, inclusive `generated/prisma/**`
apenas local e ignorado. As únicas quatro inclusões são:

- `components/dashboard/vendas/pdv-supermercado.tsx`.
- `lib/pdv/parity-supermercado-finalize-audit.component.test.ts`.
- `components/dashboard/vendas/venda-completa-enterprise.tsx`.
- `lib/pdv/parity-venda-completa-finalize-audit.component.test.ts`.

Supermercado: falha E2E comprovada na rev3, caso D, `sale_finalized=0` após retry
CONFIRMED; `venda_finalizada=1` não satisfaz esse contrato de auditoria.

Venda Completa: inspeção read-only na base acima confirmou exposição equivalente.
`venda-completa-enterprise.tsx:960` chama `finalizeSaleTransaction`; o guard em
989–1016 registra a identidade PENDING no draft e retorna antes do único
`action: "sale_finalized"`, linha 1056, no handler direto. Os usos de `sales` nos
guards 803/876 protegem a identidade; os efeitos 365–449 restauram/salvam draft
e foco/teclado, sem emissor de auditoria de retry. `lib/operations-store.tsx:1681`
delega `retrySyncSale` ao retry compartilhado; a confirmação em 1518–1528 atualiza
`sales` e emite `venda_finalizada`, sem reentrar no handler de pagamento nem emitir
`sale_finalized`. Blob da Venda Completa: `d70fdd07ea2b69c7a8c74fcd4d41a81896a4e1c7`.
É confirmação estática da exposição de contrato, **sem falha E2E comprovada**:
os cinco casos da Venda Completa continuam NOT_RUN/PARTIAL até execução própria.

### Contrato obrigatório da implementação futura

Nas superfícies autorizadas, preservar as correções e provas já registradas do
Classic e da Assistência e estender o mesmo contrato local ao Supermercado e à
Venda Completa, sem alterar motor compartilhado ou API/helper de auditoria:

- CONFIRMED direto emite exatamente um `sale_finalized`; FAILED e PENDING emitem
  zero; PENDING seguido de retry CONFIRMED emite exatamente um.
- A mesma `clientSaleId` acompanha tentativa e retry. O evento pertence à loja e
  à venda original iniciada naquela superfície; nunca auditar outra origem,
  outra loja ou vendas históricas indiscriminadamente.
- Usar `saleId` canônico, total e breakdown do snapshot real confirmado,
  obtido pelo contrato existente e associado à identidade original. Alterar o
  draft/carrinho enquanto pendente não altera os valores auditados. Não reconstruir
  auditoria do carrinho atual nem de dados inventados pela fixture.
- Deduplicar confirmação direta e observação do retry. Render, remount/restauração
  e retry repetido não duplicam a mesma auditoria local. Manter o limite honesto
  da retenção do log local; não prometer deduplicação transacional entre abas ou
  servidor. `sale_finalized` e `venda_finalizada` mantêm papéis distintos.
- Preservar guards de pendência, carrinho, pagamento, cupom, impressão, rascunho,
  enriquecimento existente e efeitos pós-venda/financeiro. Correção de auditoria
  não autoriza reexecutar esses efeitos nem refatorar outros fluxos.

Os novos testes devem montar componente, PaymentModal e OperationsProvider reais,
isolando somente transportes/providers periféricos. Cobrir CONFIRMED, FAILED,
PENDING, retry confirmado com identidade estável, payload canônico/loja/snapshot
com draft alterado e repetições de render/remount/retry sem duplicação. Não
substituir handlers, finalização ou retry reais nem relaxar asserções para PASS.
Se o contrato exigir mudar `lib/operations-store.tsx`, motor, persistência ou API
de auditoria, parar e reportar `NEXT_STEP=AUTORIZACAO_HUMANA_CONTRATO_AUDITORIA`.
Nenhum gate de dados/auth/CI/deploy é liberado por esta rev4.

### Retomada, cobertura e aceite

Após merge humano e novo comando, retomar exclusivamente na branch/worktree de
implementação declaradas nos metadados. Preservar os sete WIPs, seus fingerprints
e os commits BLOCKED; conferir hashes antes/depois de integrar o plano por merge
normal. Não usar stash/reset/checkout, descartar ou reconstruir o WIP da sessão
anterior. Conflito que ameace preservação exige parar para decisão humana.

Corrigir o caso D Supermercado e executar os seis casos ainda NOT_RUN: Supermercado
E e Venda Completa A..E. Manter os cinco cenários F-08 e as 20 combinações, incluindo
regressão Classic/Assistência. Validação focada futura:

```text
npx vitest run lib/pdv/parity-classic-finalize-audit.component.test.ts lib/pdv/parity-assistencia-finalize-audit.component.test.ts lib/pdv/parity-supermercado-finalize-audit.component.test.ts lib/pdv/parity-venda-completa-finalize-audit.component.test.ts
npx playwright test --config e2e/pdv-core.playwright.config.ts
npm run typecheck
```

Ambiente isolado obrigatório, interceptação fail-closed e nenhuma escrita
produtiva. Fixtures não comprovam persistência/automação server-side. Matriz e
evidência finais exigem SHA, comando, caso, contagens e limites; nenhuma célula
PARTIAL/BLOCKED pode virar TESTED sem prova, nenhum NOT_RUN pode contar como PASS.
R independente por `anthropic` ou `humano` permanece obrigatória para implementação,
testes e matriz final, com identidade/família/SHA/veredito registrado; sem R
favorável não há close DONE. Uma segunda instância OpenAI não satisfaz R.
`N5_B1_CLOSEOUT=BLOCKED` e `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` permanecem;
nenhum N6/N7, Fiscal, Auth.js, smoke produtivo ou novo GOAL funcional é autorizado.
Próximo passo desta entrega: `HUMANO_MERGEAR_N5_C_REV4` e parar.

## Reabertura rev5 — regressões herdadas e confirmação fora da montagem

Autorização humana: `PDV-N5-C-REV5-REGRESSION-REOPEN-006`, 20/10/2026.
Mesmo `PDV-PARITY-N5-C-E2E-002`, `STATUS=READY`, `PLAN_REV=5`. Esta seção
substitui as instruções de retomada/aceite anteriores; os registros rev1–rev4
permanecem históricos. READY reabre o planejamento e não ratifica implementação.
O quarto BLOCKED de `2026-10-20T22:09:52.691Z` e os três anteriores permanecem
literais no ledger, sem edição, remoção, compactação ou evento READY.

Relatório: `_closed/reports/PDV-N5-C-REV5-REGRESSION-REOPEN-006.md`.
Provas individuais e reprodução: `docs/ai-execution/_evidence/PDV-N5-C-REV5-REGRESSION-REOPEN-006/`.
O parecer Anthropic integral sobre `cdda74979e6008e5391a9defe6af1efdca6b7e4e`,
`R_VERDICT=REQUEST_CHANGES`, permanece na evidência histórica do GOAL.

### Fronteira desta entrega documental

Branch `plan/pdv-n5-c-rev5-regression-closeout`, worktree dedicada
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev5-regression-closeout`,
criada diretamente de `origin/main=a874342f5366427f8f7cfebc96a9c14c8efe39ad`.
Main observada da rev4: `16c496ad2ffe56fc6a89de237b204842494b8cbb`.
Sem cherry-pick, merge ou ancestralidade dos commits técnicos locais
`cdda74979e6008e5391a9defe6af1efdca6b7e4e` e
`01b9c0e94dc3867744b54764ee2d36620e10769d` neste PR.
Foram transportados somente a evidência/matriz documentais e o ledger
produzido pelo AEP. Derivados são regenerados exclusivamente por `registry`.

Os dois checkouts detached de diagnóstico mantêm a base exata e o candidato
separados. Somente o teste comportamental da Assistência recebeu uma extensão
RED no checkout descartável; nenhum código produtivo foi alterado, nenhum dos
dois testes herdados foi editado. Essa extensão é evidência, não implementação
rev5 nem teste adicionado ao PR. Worktree original e demais WIPs preservados.
Não abrir/fechar execução AEP nesta branch documental; aplicar AEP §§2–3.
Commit/push e PR contra main autorizados somente na branch de planejamento.
Sem merge do PR ou início da implementação nesta sessão.

### Classificação demonstrada das 17 falhas

Mesmos dois arquivos, configuração canônica importada, dependências, Node
`v24.14.1` e Vitest `4.1.4`, sem cache ou env produtivo:

- Base `16c496a`: **45 PASS / 0 FAIL / 0 skip**, exit 0.
- Candidato `cdda749`: **28 PASS / 17 FAIL / 0 skip**, exit 1.
- Base e main corrente têm diff vazio nos arquivos PDV diagnosticados.
- **0 baseline; 3 regressões de compatibilidade estática introduzidas pelo
  candidato; 14 problemas de fixture/mock; 0 inconclusivas.** As 17 são novas
  relativamente à base. As categorias são exclusivas; os 14 problemas de mock
  também foram expostos pelo candidato, não por instalação/infraestrutura.

As três falhas em `lib/pdv-pending-post-sale-effects.static.test.ts:180` são
Classic, Supermercado e Venda Completa: a auditoria foi movida para um observador
de venda confirmada declarado antes do handler; o recorte textual posterior ao
guard deixa de conter `sale_finalized`. Isso comprova quebra do contrato do teste
estático, sem comprovar perda funcional de auditoria nessas três superfícies.

Os 14 casos de `lib/pdv/current-main-correction.component.test.ts` param no mock
da linha 56, que só exporta `appendAuditLog`, diante do novo consumo de
`getAuditLogs`. São nove Assistência e cinco Venda Completa; todos passam na base.
Os fixtures `resolved()` também fornecem só identidade/syncPending, não uma
venda completa para auditoria. Não presumir que acrescentar um export basta:
as asserções comportamentais deverão ser reexecutadas com fixtures completas.

### Duas inclusões exatas, justificadas pelo contrato

Preservar, na mesma ordem, os **14 padrões rev4**. Acrescentar somente:

- `lib/pdv-pending-post-sale-effects.static.test.ts`.
- `lib/pdv/current-main-correction.component.test.ts`.

Na execução futura, adaptar a fiação estática ao observador CONFIRMED real,
mantendo todos os 11 casos, as negativas de FAILED/PENDING, guards e efeitos
pós-venda. A prova positiva deve acompanhar identidade própria, condição de
confirmação e emissor real, corroborada pelos testes comportamentais das quatro
superfícies. Procurar o token no arquivo inteiro, acrescentar strings artificiais
ou retirar asserts não satisfaz o contrato.

No teste de componente herdado, manter todos os 34 casos e suas asserções de
cache, TTL, loja, identidade, snapshots antigos, hold/resume e bloqueio de
reconfirmação. Completar o transporte de auditoria/mock e os dados confirmados
com valores coerentes de venda real; manter audit-log real sempre que viável,
isolando seu transporte. Não substituir o comportamento sob teste para obter PASS.
Nenhum teste removido, skip, supressão de erro ou assert afrouxado é autorizado.

### Assistência: reprodução e corretivo mínimo futuro

Achado R P2 agora comprovado comportamentalmente: **cinco testes existentes
PASS e um diagnóstico novo FAIL**, esperado `sale_finalized=1`, observado `0`.
A venda PENDING conserva a clientSaleId em dois POSTs; o retry real confirma
uma única `VDA-N5C-1`, total 190, enquanto somente a tela está desmontada.
O `OperationsProvider` real permanece montado, como no layout da aplicação.
Retornar à Assistência com draft alterado não emite a auditoria esperada.
As verificações de deduplicação depois do primeiro assert falho são NOT_REACHED,
não PASS. Esse defeito funcional é adicional às 17 falhas herdadas.

Causa em `pdv-assistencia-enterprise.tsx:1163–1199,1293–1321`: identidade de
auditoria em state volátil; fallback em ref restaurado depois do observador;
alterar ref não agenda o efeito novamente se `sales` já estiver confirmado.
Limpar/expirar o carrinho também pode apagar a única proveniência restaurável.

Correção permitida somente em
`components/dashboard/vendas/pdv-assistencia-enterprise.tsx` e
`lib/pdv/parity-assistencia-finalize-audit.component.test.ts`, já autorizados:

- Persistir as identidades próprias a auditar em marcador local separado do
  carrinho e da sua validade, por loja, no padrão já usado nas outras três
  superfícies; restaurar em state reativo. Chave proposta:
  `omnigestao:pdv-assistencia-finalize-audit:${storeIdKey}`.
- Registrar id/clientSaleId retornados pelo handler real após `result.ok`,
  inclusive PENDING, antes de perder a montagem; nunca marcar FAILED nem
  identidade histórica/alheia. Preservar a loja de origem durante await/troca
  de loja e não sobrescrever o marcador de outra loja com estado antigo.
- Observar só as identidades da loja ativa, com correspondência original e
  `syncPending === false`. Ler saleId canônico, total e breakdown da venda
  confirmada em `sales`; nunca do draft atual, toast ou resposta fabricada.
- Unificar a deduplicação dos caminhos direto/retry/remount pelo log local
  retido, uma vez por venda/loja; retirar marcador atendido sem repetir impressão,
  limpeza, enriquecimento, estoque, financeiro ou outros efeitos de finalização.
- FAILED/PENDING continuam sem evento definitivo. Preservar os cinco testes
  existentes e acrescentar o diagnóstico: provider global mantido, confirmação
  ausente da tela, retorno, draft diferente, snapshot/loja corretos e repetições
  de remount/retry sem duplicação. Cobrir também perda/TTL do cache de carrinho,
  loja alheia e resposta em voo sem atribuição à loja errada.

Não mudar `lib/operations-store.tsx`, motor, backend, persistência, API/helper
de auditoria, auth, schema, dependências ou configurações globais. Limite honesto:
deduplicação local dentro da retenção de 500 entradas; sem garantia transacional
cross-tab/servidor. Necessidade real de código fora desses paths exige parar e
registrar bloqueio para decisão humana, sem expandir a allowlist por conta própria.

### Retomada e aceite rev5

Somente após merge humano do plano e novo comando, retomar o mesmo GOAL na
branch/worktree de implementação já declaradas. Conferir o fingerprint completo
documentado, preservar `cdda749`, `a21e9a6` e `01b9c0e` e integrar o plano/main por
merge normal, sem stash/reset/descarte dos WIPs ou substituição por arquivos
anteriores. Conflito que ameace preservação é decisão humana. Rodar `status pdv`
e depois `open pdv`; usar apenas este GOAL rev5 READY como contrato vigente.

Corrigir remount e compatibilidades diagnosticadas, preservar Classic,
Supermercado e Venda Completa, incluindo guards, valores, loja, concorrência,
pagamento, impressão, enriquecimento e demais efeitos já aprovados parcialmente.
Validação futura obrigatória, no SHA corrigido e em ambiente isolado:

```text
npx vitest run lib/pdv-pending-post-sale-effects.static.test.ts lib/pdv/current-main-correction.component.test.ts
npx vitest run lib/pdv/parity-classic-finalize-audit.component.test.ts lib/pdv/parity-assistencia-finalize-audit.component.test.ts lib/pdv/parity-supermercado-finalize-audit.component.test.ts lib/pdv/parity-venda-completa-finalize-audit.component.test.ts
npx playwright test --config e2e/pdv-core.playwright.config.ts
npm run typecheck
```

Manter os 20 E2E, cinco F-08 nas quatro superfícies e a matriz honesta. **20/20
E2E rev4 é evidência histórica, não aceite automático rev5.** A matriz histórica
19 TESTED / 1 PARTIAL não muda no planejamento; a futura revisão registra prova
nova com SHA/caso/comando/resultado/limite, sem promover células por inferência.
As suites herdadas precisam ficar verdes com suas asserções preservadas; se
revelarem regressão produtiva real, corrigir somente dentro da allowlist ou parar.

Nova decisão R por `anthropic` ou `humano`, família distinta de `openai`, sobre
o SHA final corrigido, incluindo os dois blockers e implementação/testes/matriz.
O REQUEST_CHANGES rev4 permanece histórico e não conta como nova aprovação.
Sem R favorável, sem DONE. `N5_B1_CLOSEOUT=BLOCKED` e
`PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` permanecem. Nenhum gate adicional
de dados/auth/CI/deploy, smoke produtivo, N6/N7 ou novo GOAL é autorizado.
Próximo passo desta entrega: `HUMANO_MERGEAR_N5_C_REV5`. Parar.

## Encerramento da implementação futura

Staging por caminhos explícitos, commit `goal(pdv-002): ...`. Após testes e R,
usar `check pdv`/`close pdv`; apenas o script escreve o estado/ledger/registry.
Push somente desta branch, entrega para merge humano e parada após este GOAL.
Não iniciar N6/N7, Fiscal, Auth.js, reteste de produção ou novo GOAL.
