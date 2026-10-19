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
    "lib/pdv/parity-assistencia-finalize-audit.component.test.ts"
  ],
  "gates_liberados": [],
  "read_budget": 50,
  "plan_ref": "PDV-N5-C-REV2-UNBLOCK-PLAN-003",
  "plan_rev": 2,
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta: correcao local de auditoria Assistencia, teste real de componente, E2E isolados e documentos; sem motor/backend",
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

## Reabertura rev2 e limite da autorização

O bloqueio original permanece integralmente no commit
`af12ed3d0159f97bb125a62a0466362f4a89af8b`, no ledger append-only e nos documentos
originais de evidência/matriz. Motivo: `COVERAGE_BLOCKED_AUDIT_ASSISTENCIA`.
A reabertura move este mesmo GOAL de `_closed/goals/` para `goals/`, com
`status=READY` e `plan_rev=2`; não cria GOAL sucessor nem evento READY no ledger.
READY é estado de planejamento, não correção executada nem cobertura TESTED.
O histórico continua com 0 TESTED, 19 PARTIAL e 1 BLOCKED até nova prova.

Esta entrega de planejamento ocorre exclusivamente na branch
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
motor e inclui na rev2 somente a correção local de auditoria descrita acima.

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
  correção de auditoria Assistência autorizada nesta rev2 após merge humano.
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

## Encerramento

Staging por caminhos explícitos, commit `goal(pdv-002): ...`. Após testes e R,
usar `check pdv`/`close pdv`; apenas o script escreve o estado/ledger/registry.
Push somente desta branch, entrega para merge humano e parada após este GOAL.
Não iniciar N6/N7, Fiscal, Auth.js, reteste de produção ou novo GOAL.
