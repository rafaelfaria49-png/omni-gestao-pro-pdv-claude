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
    "generated/prisma/**"
  ],
  "gates_liberados": [],
  "read_budget": 50,
  "plan_ref": "PDV-N5-C-REV3-RETRY-AUDIT-PLAN-004",
  "plan_rev": 3,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta: auditoria local Assistencia e Classic, testes reais de componentes, E2E isolados, Prisma gerado local ignorado e documentos; sem motor/backend",
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

## Histórico da reabertura rev2 (preservado; limites atualizados pela rev3)

O bloqueio original permanece integralmente no commit
`af12ed3d0159f97bb125a62a0466362f4a89af8b`, no ledger append-only e nos documentos
originais de evidência/matriz. Motivo: `COVERAGE_BLOCKED_AUDIT_ASSISTENCIA`.
A reabertura move este mesmo GOAL de `_closed/goals/` para `goals/`, com
`status=READY` e `plan_rev=2`; não cria GOAL sucessor nem evento READY no ledger.
READY é estado de planejamento, não correção executada nem cobertura TESTED.
Naquela reabertura, o histórico era 0 TESTED, 19 PARTIAL e 1 BLOCKED.
A evidência rev2 posterior mantém 3 TESTED, 16 PARTIAL e 1 BLOCKED; esta rev3
não altera essas contagens nem substitui a matriz preservada.

A entrega de planejamento rev2 ocorreu exclusivamente na branch
`plan/pdv-n5-c-rev2-audit-assistencia`, worktree dedicada
`C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev2-audit-assistencia`,
criada do commit BLOCKED validado. Commit/push e um PR contra main autorizados
somente para bloqueio original + plano rev2. Sem código produtivo, implementação,
E2E, `open`/`close` AEP ou merge nesta entrega. A implementação só poderá
começar após merge humano deste planejamento e retomada em sessão própria.

## Correção local autorizada após merge humano

Os cinco paths anteriores de E2E/documentação são preservados. A allowlist
acrescenta somente o componente Assistência e seu teste de componente acima.
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
motor e inclui na rev2 somente a correção local de auditoria descrita acima e na seção rev3 abaixo.

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
  e parar se a allowlist não permitir resolvê-la. Código produtivo limitado à
  correção de auditoria Assistência preservada e à correção local Classic
  delimitada na rev3, após merge humano.
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


## Reabertura rev3 — causa demonstrada e fronteira exata

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

## Encerramento

Staging por caminhos explícitos, commit `goal(pdv-002): ...`. Após testes e R,
usar `check pdv`/`close pdv`; apenas o script escreve o estado/ledger/registry.
Push somente desta branch, entrega para merge humano e parada após este GOAL.
Não iniciar N6/N7, Fiscal, Auth.js, reteste de produção ou novo GOAL.
