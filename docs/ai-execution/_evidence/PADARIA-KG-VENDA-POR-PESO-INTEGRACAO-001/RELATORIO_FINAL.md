# Relatório final — PADARIA-KG-VENDA-POR-PESO-INTEGRACAO-001

Data: 2026-11-06 · Branch: `claude/padaria-kg-venda-peso-integracao-001` · Base da PR: `claude/estoque-manual-kg-001` (#315, `104d768`).
Nada foi publicado em produção: sem merge, deploy, acesso ao banco produtivo ou migration aplicada fora do PostgreSQL 17 descartável.

```text
STOCK_KG_CODE_READY=YES (#315 intacta; 2,500+0,750=3,250 e 5,000−0,350=4,650 provados no boundary real)
MANUAL_KG_SALE_CODE_READY=YES (atrás de PDV_MANUAL_KG_RELEASE + PDV_MANUAL_KG_STORES, padrão OFF)
PDV_KG_E2E=PASS (12/12 em 5 rodadas completas (3 em 1249fe8, 2 no HEAD 008d56b), 0 retries, 0 flaky)
POSTGRES_INTEGRATION=PASS (71/71: 44 em PostgreSQL real + 27 de contrato; migração/cliente #315/RLS 35/35)
MONEY_PRECISION=PASS (gramas inteiras × centavos, half-up por linha; vetor 0,001…9,999 kg)
STOCK_CONSISTENCY=PASS (produto, depósito e livro iguais em texto do PostgreSQL; replay sem 2ª baixa)
OFFLINE_RECOVERY=PASS (resposta perdida, reenvio, reconciliação automática da #326, refresh)
TOLEDO_ADAPTER_PREPARATION=PASS (sintético; captura física bloqueada)
REGRESSION=PASS (0 falha nova vs main nos arquivos comparados)
TYPECHECK=PASS
LINT=PASS (0 erros nos arquivos tocados; avisos preexistentes)
BUILD=PASS (MIGRATION_SKIPPED, PROXY_PRISMA_ARTIFACT_VERIFIED)
CI_STATUS=ver PR
INDEPENDENT_REVIEW=APPROVE (R6; R1–R5 REQUEST_CHANGES, todos os achados corrigidos)
PRODUCTION_MIGRATION=PENDING_APPROVAL
PHYSICAL_SCALE_TEST=PENDING
PRODUCTION_WEIGHT_SALES=DISABLED
F8_KG_RETURNS=BLOCKED
TOLEDO_REAL_CAPTURE=PENDING_PHYSICAL_TEST
PRODUCTION_WRITES=0
```

## O que foi reaproveitado

A venda manual KG já estava implementada e revisada (APPROVE) na branch local `codex/pdv-padaria-venda-manual-kg-mvp-001` / `codex/pdv-kg-gh-integration-e2e-001` (`26dbb19..b169d64`, hardening-002, sem push). Esta PR empilha esses commits **sem reescrevê-los** sobre a #315 e acrescenta o trabalho abaixo. A worktree `.worktrees/pdv-kg-gh-integration-e2e-001` (WIP de outra sessão, 161 arquivos) **não foi tocada**; os commits foram usados pelo SHA.

## O que esta etapa fez

| Commit | Conteúdo |
| --- | --- |
| `bdd52cf` | Merge de `origin/main` (37acc3b: #322 visor, #324/#325 Produto.id no carrinho, #326 sync confiável). 3 conflitos resolvidos por união (`ops-upsert-venda`, `inventory/route`, `operations-store`). |
| `a6a746d` | Teste PostgreSQL do fluxo padaria; `lib/pesagem/sale-capture.ts` (proposta de peso sobre a WeightSession, nenhum perfil homologado, Toledo sem parser, diagnóstico passivo de porta); doc `TOLEDO_PRIX3_FIT_PROTOCOLO.md`. |
| `a8aaf8a` | Recovery KG só por `clientSaleId`; `manualKgSale` explícito no payload do Clássico; taxa KG do cupom; harness de recebimento com a barreira `set_config`. Fecha as 7 falhas que a pilha introduzia vs main. |
| `5c203b6` | Correções R1 (P1 pré-trava com `produtoId` + `NOT_FOUND` abortando no PDV ao vivo; P2 timeout do snapshot KG; P2 reenvio manual estruturado; P2 catálogo; P3 recusa explícita "Peso inválido"). |
| `978ffe3` | E2E aceita a reconciliação automática da #326 no cenário de resposta perdida. |
| `2525082` | Comprovante: peso "0,350 kg" + "R$ 20,00/kg" em ESC/POS, texto, HTML e tela; `quantityUnit` opcional em `PdvReceiptInput`. |
| `475f4bc` | Correções R2 (`invalidate()` do catálogo, `saleMatches` sem casar id vazio, corrida determinística nos testes de exclusão, `PRODUTO_NAO_RESOLVIDO` para linha fracionada sem produto). |
| `055489c` | Correção R3: fallback HTML de impressão com peso e preço/kg. |
| `1249fe8` | Snapshot KG deixa de forçar recarga no pós-venda; E2E coerente com a sessão de caixa semeada sem terminal. |
| `20c60de` | Correção R4: `scheduleCatalogRevalidation` (invalida e recarrega com retentativa, sem depender do PDV montado). |
| `008d56b` | Correção R5: prazo de 15 s por tentativa e repetição contínua do último atraso (120 s) até aplicar um snapshot. |

## Exemplo obrigatório (provado em PostgreSQL 17, writer real)

Queijo R$ 20,00/kg · entrada 5,000 kg pelo boundary da #315 · venda 0,350 kg → **R$ 7,00**, item `quantidadeKg=0.35` (`quantidade` NULL), livro `[+5 → 5] [−0,35 → 4,65]`, produto e depósito `4.65` (texto do PG), financeiro R$ 7,00. Replay da mesma venda: `replayed=true`, sem 2ª baixa. Vetor 0,001 / 0,125 / 1,250 / 2,350 / 9,999 kg × R$ 20 = 0,02 / 2,50 / 25,00 / 47,00 / 199,98. Recusas sem escrita: peso 0, negativo, 0,0005, 0,3505 (com totais coerentes, mensagem "Peso inválido"), preço divergente, pagamento divergente, produto sem preço, produto de outra loja, estoque insuficiente. Dois caixas concorrentes somam gramas exatas; produto excluído durante a venda (KG com SKU antigo + `Produto.id`, e UN) aborta com `PRODUTO_NAO_RESOLVIDO` — prova de mutação: sem as correções do P1 a venda era gravada sem baixa.

## Migrations

Nenhuma migration nova nesta etapa. Já existentes na pilha (checksums do blob):

| Migration | sha256 | Origem |
| --- | --- | --- |
| `20261025120000_estoque_quantidade_fracionada` | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` | #315 (int→double nas 5 colunas de estoque) |
| `20261029120000_manual_kg_sale_quantity` | `8757ee993cf0fd233d8d0ace7027717009e064b68f39a4a4f07123861d83ddb3` | hardening-002 (aditiva: `venda_itens.quantidade` int nulo + `quantidadeKg numeric(65,30)` + CHECK + 8 triggers) |

Ensaio em PG 17 descartável (`127.0.0.1:55479`, recriado a cada rodada): schema anterior sintético → #315 → aditiva, histórico UN 2147483647 preservado, cliente Prisma exato da #315 + RLS: 35 verificações PASS. A proteção contra escritor antigo continua: cliente `Int` sobre coluna `double` corrompe (prova da #315) e cliente da #315 lendo KG falha com P2032 (fail-closed).

## Revisão independente (Codex gpt-6.1-sol, read-only)

- R1 (`a6a746d`): REQUEST_CHANGES — 1 P1, 3 P2, 1 P3 → corrigidos em `5c203b6`.
- R2 (`5c203b6`): REQUEST_CHANGES — 2 P2, 1 P3 → corrigidos em `475f4bc`.
- R3 (`475f4bc`): REQUEST_CHANGES — 1 P2 (fallback HTML) → corrigido em `055489c`.
- R4 (`1249fe8`): REQUEST_CHANGES — 1 P2 (sem watchers nenhuma revalidação) → `20c60de`.
- R5 (`20c60de`): REQUEST_CHANGES — 2 P2 (retomada após esgotar; consulta pendurada) → `008d56b`.
- **R6 (`008d56b`): APPROVE — sem P0/P1/P2 restantes em R1–R6, sem P3 novo.**

Pareceres completos em `INDEPENDENT_REVIEW.md`.

## Regressão

Suíte Vitest completa local (Node 22): 10.732 passam / 304 falham em 78 arquivos. Os mesmos 78 arquivos rodados na main (`37acc3b`) e na base `b169d64`: as falhas são ambientais/preexistentes (sem `TEST_DATABASE_URL`, `xmllint`, Java, mocks de rota) — **7 testes falhavam só nesta pilha** e foram corrigidos (`a8aaf8a`). Regressão final PDV/vendas/estoque/caixa/pesagem/impressão: 0 falha nova vs main.

## Compatibilidade com outras PRs (merge-tree, sem tocar nelas)

| PR | Resultado |
| --- | --- |
| #327 Omni Print 004C | merge limpo |
| #334 Omni Print D05 | merge limpo |
| #331 F8 | conflita em `app/api/ops/devolucao/route.ts`, `app/api/vendas/[id]/cancelar/route.ts`, `trocas-devolucao.tsx` (barreiras KG da hardening-002). Exige integração própria; **devolução KG continua bloqueada** e não é habilitada aqui. |
| #318 Relatórios | já conflita com a main (`next.config.mjs`), independente desta PR. |

## Bloqueios de produção (todos mantidos)

1. **Migrations**: nenhuma aplicada fora do PG descartável. Ordem obrigatória: gates A4…A8 da #315 (runbook `ESTOQUE_MANUAL_KG_RUNBOOK.md`) → migration de estoque com escritores antigos isolados (papel `omni_runtime_v2`, corte de CONNECT, deployments antigos fora) → migration aditiva de venda **antes** dos novos binários → binário com flag KG desligada → retirada de leitores/agregadores antigos → nova autorização para allowlist de uma loja (`VENDA_MANUAL_KG_RELEASE_HARDENING.md`).
2. **Venda KG produtiva**: `PDV_MANUAL_KG_RELEASE` ausente em todos os ambientes; nenhuma loja liberada.
3. **Balança Toledo Prix 3 Fit**: sem protocolo comprovado; nada transmite bytes; coleta segura descrita em `docs/padaria/pesagem/TOLEDO_PRIX3_FIT_PROTOCOLO.md`.
4. **F8/devolução KG**, recovery histórico que criaria KG, fiscal KG: bloqueados.
5. Estabilidade do E2E: com a recarga forçada do catálogo logo após o snapshot KG, o cenário de resposta perdida reabria o PDV com "Caixa Fechado" após o reload (3/3). Sem ela, passou 12/12. Causa provável: a sessão de caixa é por terminal (F-01 002A), mas o runner semeia uma sessão sem terminal; a ordem entre o clique em "Usar" e a reconciliação do caixa decidia o resultado. A versão final não recarrega no instante da confirmação (a 1ª tentativa sai 2 s depois, com retentativa) e o E2E passa a escolher "Continuar sem terminal". Ficou fora do escopo verificar se, na main, uma requisição de catálogo concorrente pode atrasar a reconciliação do caixa depois de um F5 num terminal real.

## Ambiente local

PostgreSQL 17.10 descartável no scratchpad (initdb próprio, porta 55479), Node 22.23 para Vitest/runners (Node 26 da máquina quebra jsdom), build via `scripts/vercel-build.mjs`. Worktrees temporárias `kgb-main`/`kgb-hd2` só para comparação de baseline.

## Próximo passo exato

Revisão humana desta PR draft. Depois: concluir A4 da #315 (login do runtime, read-only) com autorização própria; integrar #331 sobre esta pilha mantendo devolução KG bloqueada; agendar a coleta física do protocolo da Toledo na loja.
