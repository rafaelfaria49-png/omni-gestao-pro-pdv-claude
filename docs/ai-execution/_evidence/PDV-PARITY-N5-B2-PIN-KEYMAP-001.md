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

## Revisão independente R ratificada

Registro em 2026-10-18 por Codex/openai, conforme parecer do revisor real fornecido pelo usuário no GOAL `PDV-N5-B2-AEP-CLOSE-AND-PUBLISH-003`. Este registro documental não constitui nova revisão OpenAI nem nova execução pelo revisor.

R_EXECUTOR=claude-code
R_FAMILY=anthropic
CLAUDE_CODE_VERSION=2.1.288
R_VERDICT=APPROVE
INDEPENDENCE_VALID=YES
REVIEWED_SHA=21df54b799bec74f2e1761f194221e0d550bb1e0
R_REVIEWED_SHA=21df54b799bec74f2e1761f194221e0d550bb1e0
TECHNICAL_COMMIT=21df54b799bec74f2e1761f194221e0d550bb1e0
TECHNICAL_BLOCKERS=NONE
USABILITY_ACCEPTANCE=PENDING_USER
R_PROBE_SESSION_ID=55accaa1-fdec-4356-958c-1d96b8cc8096

A família `anthropic` é declarada em `docs/ai-execution/executors.json`, distinta da família executora `openai`. O revisor conferiu diff/allowlist, PIN e keymap, 119/119 testes PASS (incluindo 100 testes de componentes) e typecheck PASS. ESLint e `verify --all` foram relatados pelo executor; não foram reexecutados pelo revisor.

A sondagem anterior do Claude Code havia falhado por limite semanal (API 429, sem uso de modelo/tokens), sem constituir revisão. O parecer APPROVE acima substitui aquele ponto de parada, preservando o histórico da indisponibilidade.

### Riscos residuais não bloqueantes

- Escape no modo rápido ficou menos acessível com foco permanente no campo de bipagem.
- O guarda estático tabela↔código-fonte foi removido.
- Algumas teclas periféricas têm cobertura parcial.
- F2 da Assistência não fecha seletor aberto.
- O listener do Supermercado é reinstalado a cada render.
- Os testes foram realizados em jsdom.

Esses itens permanecem residuais; não foram corrigidos neste GOAL. A homologação de usabilidade pelo usuário permanece pendente, distinta da aprovação técnica R. Nenhuma melhoria adicional foi implementada.

### Proveniência e fechamento

O SHA técnico revisado acima permanece a referência imutável da aprovação. O commit documental desta seção é separado do commit técnico: seu SHA será registrado no relatório de entrega e será o `head_commit` verificado pelo fechamento AEP. O commit de estado AEP é um terceiro objeto, gerado exclusivamente por `node scripts/track.mjs close pdv`. Os valores OPEN/READY e as validações no início deste arquivo descrevem a execução original; o estado final ratificado será o ledger/relatório gerado pelo close.

Publicação autorizada somente na branch B2, com PR contra main e merge humano. Não iniciar N5-C nem reabrir N5-B1. O encerramento e as verificações posteriores serão reportados com seus resultados efetivos.

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

Todos dentro da allowlist. `CURRENT_STATUS.md`, changelog e memória global não foram alterados: fora da allowlist nesta atualização documental. A worktree será mantida para integração por PR e merge humano.
