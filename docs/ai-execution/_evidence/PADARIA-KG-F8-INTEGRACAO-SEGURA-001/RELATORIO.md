# PADARIA-KG-F8-INTEGRACAO-SEGURA-001 — Relatório

Data: 2026-11-06 · Executor: Claude Code (Opus 5.5) · Revisor independente: Codex (gpt-6.1-sol, read-only)

## Escopo

Integração técnica da F8 (troca/devolução, PR #331) com a venda manual por peso e o estoque KG
(PR #335, empilhada sobre #315).

- PR **#336** DRAFT, base `claude/padaria-kg-venda-peso-integracao-001`.
- Branch `claude/padaria-kg-f8-integracao-segura-001`, worktree `.worktrees/kg-f8-001`.

Heads conferidos antes de começar (iguais aos do GOAL):

| PR | Head |
|---|---|
| #335 | `406ea48` |
| #331 | `b0de724` |
| #315 | `104d768` |

Nenhuma das três branches foi modificada.

## Commits

| Commit | Conteúdo |
|---|---|
| `d8254c2` | merge de `b0de724` em `406ea48` (histórico da #331 preservado), 6 conflitos resolvidos |
| `17dffc7` | travas KG portadas para o escritor único da F8, suíte PG F8 × KG |
| `6b85245` | E2E autenticado F8 × KG |
| `3e2e795` | correções dos achados da R1 (1 P1, 2 P2) |
| `065bdf5` | correções dos achados da R2 (1 P1, 3 P2) |
| (este) | correção do P3 da R3 + evidências finais |

## Conflitos resolvidos

| Arquivo | Resolução |
|---|---|
| `.github/workflows/{pdv-scale-visor,platform-pilot,ramos-cadastros}.yml` | Os dois lados fixam `ubuntu-24.04`. Mantidos o comentário da #331 e os gatilhos F8 da prova 11. |
| `app/api/ops/devolucao/route.ts` | Fica o escritor único da #331 (`registrarDevolucaoInTransaction`). O bloco inline da #335 sai. `ManualKgSaleError` / `ProductWeightNotOperationalError` / `ProductCommercialInvalidError` continuam respondendo 409. |
| `app/api/vendas/[id]/cancelar/route.ts` | Um único `FOR UPDATE` com releitura completa (`venda = current`), depois o ramo KG da #335 e as verificações da #331 (devolução concorrente, vale emitido × pago com vale/prazo). Venda já cancelada responde `venda_ja_cancelada` (409). |
| `components/dashboard/vendas/trocas-devolucao.tsx` | A trava KG da #335 soma-se a `enviando`/recuperação da #331 nos dois botões. |

## Por que foi preciso mais que o merge

A #331 trocou a rota inline, onde a #335 bloqueava a venda KG, por um escritor novo. Com o merge puro:

- a F8 lia `ItemVenda.quantidade = NULL` das linhas KG como 0;
- uma devolução de linha UN de venda KG chegava ao trigger `manual_kg_guard_return` e virava 500;
- a fila offline tratava esse 500 como "aguardar" e reenviava para sempre, com o vale local ativo.

Correções em `17dffc7`:
- `vendaKgBloqueiaDevolucao` → `DEVOLUCAO_KG_BLOQUEADA` (409) para a venda inteira;
- `PRODUTO_COMERCIAL_INVALIDO`;
- a elegibilidade mostra o peso exato vindo de `quantidadeKg`;
- os códigos KG entram como recusa definitiva na fila.

A prova por mutação (sem a trava) reprova 3 casos.

## Revisão independente

**R1 (17dffc7): REQUEST_CHANGES**, com 3 achados. Os três foram corrigidos em `3e2e795` e cada um foi provado RED com o código antigo e GREEN depois.

| Sev. | Onde | Achado | Correção |
|---|---|---|---|
| P1 | `product-keys.ts` | Mesmo nome em produtos diferentes da venda + SKU herdado: o catálogo de hoje decidia e devolvia o outro produto, pelo preço dele. | Código ambíguo só resolve por Produto.id ou chave exata; caso contrário, `ITEM_NAO_CONSTA_NA_VENDA`. |
| P2 | `operations-store.tsx` | O espelho local caía no SKU quando o Produto.id faltava no snapshot e somava UN num saldo KG (2,375 → 3,375). | Correspondência estrita com `produtoId`; produto por peso nunca recebe compensação. |
| P2 | `pendencia-financeiro.ts` | A referência ao Financeiro de uma linha KG saía 0. | A linha KG entra pelo valor pago. |

**R2 (3e2e795): REQUEST_CHANGES**, com 4 achados. Todos foram corrigidos em `065bdf5`, com RED provado antes e GREEN depois. Três vêm da #331 isolada e o quarto (fila) é a mesma proteção KG num segundo caminho.

| Sev. | Onde | Achado | Correção |
|---|---|---|---|
| P1 | rota + tela | Resposta perdida + período fechado: o reenvio recebia `periodo_fechado` e a tela abria outro `localId`, gerando vale e estoque em dobro. | Replay reconhecido antes de política, período e sessão; recusa transitória mantém o `localId`. |
| P2 | `operations-store.tsx` | A confirmação da fila mantinha o vale local (R$20) em vez do gravado (R$10). | Vale, linhas, `produtoId` e saldo reconciliados com o corpo 200. |
| P2 | `withPendingDevolucaoStock` | A reconstrução do estoque pendente somava UN num saldo KG pelo SKU. | Usa a mesma identidade do espelho. |
| P2 | `registrar-devolucao.ts` | Parciais arredondadas isoladamente perdiam centavos (R$9,00 de R$9,49). | Valor pelo acumulado do produto menos o já restituído. |

**R3 (065bdf5): APPROVE_WITH_LIMITATIONS**, com 0 P0/P1/P2.
- O Codex parou por limite de cota (só volta em 2026-11-10). A R3 foi feita por um revisor Claude de contexto limpo, somente leitura, com o mesmo pacote (`R3_PACOTE.md`).
- **P3 1**: 403 no reenvio da tentativa incerta descartava a anterior. Corrigido nesta rodada, com RED provado.
- **P3 2**: piso 0 só no espelho local, especulativo. Fica como risco residual.
- Detalhes em `R3_VEREDITO.md`.

Pendente: a R3 cruzada pelo Codex (família OpenAI) pode ser repetida a partir de 2026-11-10.

## Testes

Todos locais, em PostgreSQL 17 descartável (127.0.0.1:55479, cluster no scratchpad) com Node 22.

| Suíte | Resultado |
|---|---|
| `scripts/pdv/run-manual-kg-tests.mjs` (migration KG real + verify + 5 arquivos) | **79/79** |
| — dentro dele, `lib/pdv/devolucao/f8-venda-kg.pg.test.ts` (novo) | 8 casos |
| `lib/pdv/devolucao/troca-imediata.pg.test.ts` contra banco com o schema KG (8 triggers) | **34/34** (+3 casos: R1-P1, R2-P1, R2-P2 centavos) |
| Unit/component: F8, fila, PDV peso, contrato KG, sale-from-db-row, cancelar, parity | **229/229** (12 arquivos; trocas 16, fila 11) |
| E2E autenticado `scripts/pdv/run-manual-kg-e2e.mjs` (`next start`, NextAuth real, Chromium) | **13/13** no `065bdf5`, após rebuild |
| CI da PR #336 no `065bdf5` | **10/10** — `validate` do pdv-scale-visor teve flake (botão "Salvar visor"); passou 3/3 localmente e na reexecução; o mesmo workflow já falhou uma vez na branch da #335 |
| `npm run typecheck` | 0 erros |
| eslint dos arquivos alterados | limpo |
| `npm run build` | `Compiled successfully`, `PROXY_PRISMA_ARTIFACT_VERIFIED` |

Casos da suíte `f8-venda-kg.pg.test.ts`:
1. venda KG mista: troca, vale, estoque e KG recusados; dinheiro bloqueado por política; replay paralelo sem efeito; a busca mostra o peso exato e o bloqueio;
2. trigger do banco recusa a escrita direta;
3. troca UN → vale → nova venda KG paga com o vale → cancelamento integral restaura o vale e o estoque KG exatos, sem tocar a venda UN;
4. corrida: cancelamento × 5 devoluções;
5. SKU alterado numa loja KG;
6. declaração comercial inválida;
7. pendência KG com referência correta;
8. isolamento entre lojas.

O E2E 11 da F8 (cadastros-ramos) roda no CI, porque o runner usa PG na 5432.

O E2E KG registra `KG_BROWSER_ERROR ... reading 'waiting'`. O erro vem de `components/pwa/pwa-update-prompt.tsx`, sem service worker no headless, e já aparece no E2E da #335. Fica fora do escopo.

## Política preservada

- `DEVOLUCAO_KG_BLOQUEADA`.
- `REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA`.
- SEM_RECEBIMENTO (devolução sem venda de origem no servidor): `VENDA_ORIGEM_OBRIGATORIA` / `VENDA_ORIGEM_NAO_ENCONTRADA`.
- A venda KG confirmada só sai pelo cancelamento integral autorizado.
- Cálculos em centavos e baixas em milésimos da #335: intocados.
- Guards de estoque e de venda KG, CI `ubuntu-24.04`, schema Prisma e migrations: intocados.

## Produção

`PRODUCTION_ACCESS=NO` · `PRODUCTION_WRITES=0` · `PRODUCTION_MIGRATION=NO` · `PRODUCTION_DEPLOY=NO` ·
`MERGE_MAIN=NO` · `AUTO_MERGE=NO` · `KG_PRODUCTION_RELEASE=DISABLED`.

## Ordem futura de merge

1. #315
2. #335
3. #336

A #331 isolada contra a main fica supersedida pela #336 para o caminho KG. Mergeá-la direto na main antes da #335 obrigaria a refazer esta integração. Decisão humana.

Pendências produtivas, herdadas e não alteradas por este GOAL:
- gates A4–A8 do rollout KG (#315);
- leitura RO de produção da auditoria F8 legada (`itens_devolucao_venda` com `inventoryId` nulo);
- smoke presencial da F8;
- protocolo Toledo.

## Worktrees

- Criada só `.worktrees/kg-f8-001`. O `node_modules` dela é uma junction para o de `.worktrees/kg-venda-peso-001`: remover a junction antes de `git worktree remove`.
- Nenhuma outra worktree ou WIP foi tocado: `kg-venda-peso-001`, `estoque-manual-kg-001`, `.claude/worktrees/pdv-f8-troca-001` e `pdv-kg-gh-integration-e2e-001` (WIP de outra sessão) seguem intactos.
