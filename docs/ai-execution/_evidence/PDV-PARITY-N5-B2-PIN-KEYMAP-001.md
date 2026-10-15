# Evidência — PDV-PARITY-N5-B2-PIN-KEYMAP-001

EXECUTOR=codex
FAMILY=openai
DATE=2026-10-14
MAIN_BASE=6b0b240f7ceb5cd9b8c87e55be55a52ccb04eca2
PUBLISHED_BASE=d5d61b98ac644690203f73d68c673f5c485461d4
BRANCH=goal/pdv-parity-n5-b2-pin-keymap-001
WORKTREE=C:/Projetos/omni-gestao/.worktrees/pdv-n5-b2-pin-keymap-001
AEP_ATTEMPT=1/3
GOAL_STATUS=READY
AEP_SESSION=OPEN
B2_READY=true
NEXT_C_READY=true
PR_270_MERGED=true
B1_004_STATUS=BLOCKED
DATABASE_ACCESSED=false
PRODUCTION_WRITES=false
DOCKER_RUN=false
FULL_BUILD_RUN=false
MERGE_MAIN=false
N5_C_STARTED=false

## Escopo implementado

PIN do Supermercado preservado, inclusive as exceções pré-existentes de administrador/rápido. Clique e Escape rápido usam a mesma solicitação de remoção. PIN negado, erro e cancelamento conservam o carrinho; resposta tardia após cancelamento não autoriza nenhuma ação. Não há novo PIN de remoção/limpeza nas outras superfícies. Autorizações existentes de desconto/formas no PaymentModal permanecem intactas.

F1 do Supermercado é alias da primeira forma rápida ativa, com os mesmos gates de F2/clique e sem fallback quando não há forma ativa. F5 da Assistência pede confirmação da linha selecionada/última e informa que recebimento é F9. As diferenças F2/F4/F5/F10 e F3/F8/F9/F12 existentes permanecem. Ajuda e hints correspondem ao runtime por superfície.

Escape exige modo rápido explicitamente ativo para remover último item: fora de campos, sem busca e sem overlay. Input/textarea/select/contenteditable, modal/menu/listbox, repetição e evento consumido bloqueiam remoção/limpeza acidental. Cada evento consumido termina no handler responsável. Finalização em voo conserva o busy do modal compartilhado e o mutex da Venda Completa.

Matriz final: `docs/pdv/PDV_N5_B2_PIN_KEYMAP_001.md`.

## Prova e limites

Quatro superfícies oficiais montadas em jsdom. Shell Classic, PaymentModal, ItemAvulsoModal, VendaEsperaModal, PIN, F5 e ajuda executam código real. Providers, rede, cliente/recebimento, trocas, acessórios e impressão têm I/O/subárvores sintéticas identificadas no teste. Não substituímos handlers de teclas, autorização PIN, carrinho, espera ou finalização. A confirmação de pagamento atravessa os botões e o delay real de 50ms, mantendo a Promise do motor sintético em voo para provar bloqueio de reentrada/Escape/remoção.

Os testes não equivalem a sessão autenticada, loja/terminal reais ou smoke produtivo. N5-B1-004 não foi reaberto; nenhuma auditoria B1/R4 foi repetida. Nenhuma mudança em auth, proxy, schema, rotas, Server Actions, motor ou infraestrutura. Build completo não se aplica à mudança local de componentes/handlers e foi expressamente excluído do GOAL.

## Validação final

| Verificação | Comando | Resultado |
| --- | --- | --- |
| GOAL canônico | `npx vitest run lib/pdv/parity-keymap.test.ts lib/pdv/parity-pin-keymap.component.test.ts lib/pdv-assistencia-shortcuts.test.ts` | PASS: 3 arquivos, 119 testes, exit 0, 26,45s |
| Componentes/handlers reais | `lib/pdv/parity-pin-keymap.component.test.ts` no comando canônico | 100 testes PASS |
| Matriz aprovada | `lib/pdv/parity-keymap.test.ts` no comando canônico | 13 testes PASS |
| Serviços/atalhos existentes | `lib/pdv-assistencia-shortcuts.test.ts` no comando canônico | 6 testes PASS |
| TypeScript | `npm run typecheck` | PASS, exit 0 |
| ESLint focado | comando abaixo | PASS, exit 0; 0 erros e 9 warnings em trechos pré-existentes |
| Diff | `git diff --check` | PASS, exit 0 |
| Governança | `node scripts/track.mjs verify --all` | PASS, exit 0: 11 trilhas, REGISTRY e GATES sem divergências |

```text
npx eslint components/dashboard/vendas/pdv-classic.tsx components/dashboard/vendas/pdv-assistencia-enterprise.tsx components/dashboard/vendas/pdv-supermercado.tsx components/dashboard/vendas/venda-completa-enterprise.tsx lib/pdv-keymap.ts lib/pdv/parity-keymap.ts lib/pdv/parity-keymap.test.ts lib/pdv/parity-pin-keymap.component.test.ts
```

ESLint: cinco warnings no Classic, dois no Supermercado e dois na Venda Completa (deps de hooks e diretivas não utilizadas). Não houve correção de código vizinho fora do GOAL.

Preparação local: dependências existentes reutilizadas por junction gitignored `node_modules`. A primeira execução do Vitest no sandbox falhou com EPERM em rename de cache; os comandos finais rodaram fora do sandbox. O cliente Prisma compartilhado estava defasado e causou erros de tipos em Pessoas: somente a junction `generated` desta worktree foi substituída por cliente local gerado via `npx prisma generate --schema prisma/schema.prisma` (v6.19.3), sem alterar o schema ou acessar banco. Nenhuma alteração no cliente da outra checkout, pacote instalado, migration ou build completo. As falhas de fixtures durante desenvolvimento (cliente no draft vazio, label de débito e delay de confirmação), bem como dois ajustes de tipos do teste, foram corrigidas antes da validação final acima.

## Revisão independente e ponto de parada

R_EXECUTOR=claude-code
R_FAMILY=anthropic
CLAUDE_CODE_VERSION=2.1.288
R_AVAILABILITY=false
R_VERDICT=NOT_RUN_429_WEEKLY_LIMIT
R_REVIEWED_SHA=NONE
R_PROBE_SESSION_ID=55accaa1-fdec-4356-958c-1d96b8cc8096
AEP_CHECK=NOT_RUN_PENDING_R
AEP_CLOSE=NOT_RUN_PENDING_R
NEXT_STEP=REVISAO_INDEPENDENTE_N5_B2

A família `anthropic` é declarada em `docs/ai-execution/executors.json`. O Claude Code estava instalado e autenticado, mas a sondagem de disponibilidade retornou API 429, `terminal_reason=api_error`, `is_error=true` e a mensagem `You've hit your weekly limit`, sem uso de modelo/tokens. Isso não constitui revisão R nem parecer sobre SHA. Nenhuma instância OpenAI foi apresentada como R.

Publicar somente o candidato técnico autorizado na branch B2. O SHA exato do candidato é o commit que contém esta evidência, informado no relatório de entrega e conferido no remoto. AEP permanece aberto e o GOAL não é DONE. A revisão de outra família declarada deve avaliar esse SHA e o diff contra MAIN_BASE, a allowlist e as provas acima. Só após R favorável poderá haver check/close canônico e novo push do fechamento. Não fazer merge nem iniciar N5-C nesta sessão.

## Arquivos da entrega

- `components/dashboard/vendas/pdv-classic.tsx`
- `components/dashboard/vendas/pdv-assistencia-enterprise.tsx`
- `components/dashboard/vendas/pdv-supermercado.tsx`
- `components/dashboard/vendas/venda-completa-enterprise.tsx`
- `lib/pdv-keymap.ts`
- `lib/pdv/parity-keymap.ts`
- `lib/pdv/parity-keymap.test.ts`
- `lib/pdv/parity-pin-keymap.component.test.ts` (novo)
- `docs/pdv/PDV_N5_B2_PIN_KEYMAP_001.md` (novo)
- `docs/ai-execution/_evidence/PDV-PARITY-N5-B2-PIN-KEYMAP-001.md` (novo)

Todos dentro da allowlist. `CURRENT_STATUS.md`, changelog e memória global não foram alterados: fora da allowlist e sem ratificação de DONE. A worktree será mantida para a revisão independente.
