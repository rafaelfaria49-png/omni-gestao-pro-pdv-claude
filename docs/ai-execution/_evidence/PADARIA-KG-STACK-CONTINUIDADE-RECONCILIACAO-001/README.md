# PADARIA-KG-STACK-CONTINUIDADE-RECONCILIACAO-001 — 2026-11-21

Executor: Claude Code. Escopo: reconciliar a pilha KG (#315 → #335 → #336 → #337) com a main
`09e9764` (conferida no início e no fim), validar em PostgreSQL descartável e revisar.
Nada foi enviado ao remoto: **0 push, 0 PR, 0 escrita em Production, 0 env alterada, KG desligado.**

## 1. Base e heads

| PR | origin (antes) | branch local reconciliada | head local | árvore |
| --- | --- | --- | --- | --- |
| #315 | `8028511` | `rec/kg-001-315` | `f58c295` | `b41f9f5` |
| #335 | `ae8c9d5` | `rec/kg-001-335` | `875c13b` | `888c5c7` |
| #336 | `a0bf107` | `rec/kg-001-336` | `b972a54` | `ac44c6d` |
| #337 | `5ee473a` | `rec/kg-001-337` | `24b0b88` (+ commit desta evidência) | `ae9bb8b` |

Worktree isolada: `.worktrees/kg-stack-rec-001`. Branches e worktrees originais intactas
(só leitura; WIP de outra sessão em `estoque-manual-kg-001` e `pdv-kg-gh-integration-e2e-001` não tocado).
Somente `merge --no-ff`; sem reset/stash/rebase/cherry-pick/force-push. Cada branch contém a
anterior e a main (`merge-base --is-ancestor` = sim).

## 2. Conflitos e junções resolvidos

| # | Onde | Causa | Resolução |
| --- | --- | --- | --- |
| C1 | `app/api/vendas/[id]/cancelar/route.ts` (merge #335) | KG (lock + revalidação + recebíveis KG na tx) × #372 (títulos de aparelho na tx, IMEI sem reposição) | União. Venda mista KG+aparelho usa o contrato do aparelho (título exclusivo, sem recebimento) e pula `cancelManualKgReceivables`; pós-tx pulado se `kgSale \|\| vendaComAparelho`; produto não resolvido em venda KG segue STALE; IMEI não repõe saldo. Declaração duplicada de `titulosCancelados` removida. |
| C2 | mesmo arquivo (merge #336) | travas F8 (devolução concorrente, vale sem saída) | Travas F8 mantidas; títulos de aparelho logo depois, mesma tx. |
| J1 | `lib/estoque/stock-ledger-service.ts` (merge limpo #315, quebra semântica) | main lê `cmd.kind` antes de `cmd` existir na versão fracionada | `input.kind` (`f58c295`). Sem isto: TS2448 e ReferenceError em runtime para produto serializado. |
| J2 | `app/api/vendas/[id]/cancelar/route.test.ts` | main passou a rodar `app/api/vendas` no CI `aparelhos`; mock casava só por `pedidoId` e a releitura sob lock busca por `id` | mock aceita `id` (`875c13b`), código inalterado. 19 falhas só na pilha → 36/36. |

## 3. Testes (PG 17 descartável em 127.0.0.1:55479, dados sintéticos)

| Prova | Resultado |
| --- | --- |
| Suíte oficial KG (`run-manual-kg-tests.mjs`) | **96/96** + **35 checks** migration/Prisma315/RLS ([04](04-kg-suite.txt)) |
| Novos cenários (`manual-kg-continuidade.pg.test.ts`) | A, B/C, F, G, H, J + mista KG+aparelho (bloqueio e sucesso real) — verdes; mutação de "IMEI não repõe saldo" → vermelho |
| Ordem prod: banco = schema main + 30 resolvidas; `migrate deploy` | aplica só `20261025/20261029/20261106/20261108`, **drift 0** ([03](03-ordem-migrations.txt)) |
| Ordem inversa (preparo do CI `aparelhos`) | KG antes de 20261110…20261118, todas OK, **DRIFT_ZERO** ([03b](03b-ordem-kg-antes-aparelhos-ci.txt)); `test/aparelhos` **52/52** |
| Vitest dirigido (app/api/vendas, ops/devolucao, lib/aparelhos, estoque, vendas, pdv, components/dashboard/vendas), Node 22 | pilha: só `pdv-scan-autoclear.static` 6 (**igual na main**); main: mesmas 6 + `ops/devolucao/route.test` 8 (corrigidas na pilha) |
| `cancelar/route.test.ts` | 36/36 (antes 19 falhas só na pilha) |
| Typecheck | exit 0 no head final — **com heap 5,5 GB**; `npm run typecheck` (4 GB) estourou o heap nesta pilha (main a 4 GB não medida) |
| ESLint `.` | 0 erros (68 avisos pré-existentes) |
| `npm run build` (local, sem env de produção) | `MIGRATION_SKIPPED`, "Compiled successfully", exit 0 |
| E2E autenticado KG (`run-manual-kg-e2e.mjs`) | **13/13** (§3.1) |

### 3.1 E2E

`run-manual-kg-e2e.mjs` sobre o build local: **13/13 passed** ([05](05-e2e-autenticado.txt)). `KG_BROWSER_ERROR … reading 'waiting'` (18×) vem de `components/pwa/pwa-update-prompt.tsx` sem service worker no headless — já registrado como pré-existente desde a #335.

## 4. Revisão independente

- R3 Codex: **não executada** — `codex exec` (0.167, gpt-6.1-sol) devolveu limite de uso até 2026-11-22 09:23. Cota não contornada.
- Substituta: subagente Claude de contexto limpo, só leitura, sobre `3ee7376`: **APPROVE_WITH_NOTES**, sem P0/P1.
  - P2-1 **(aberto, fora do escopo)**: relatórios da main (#377/#381 — `lib/relatorios/products.ts`, `produtos-vendidos.ts`, `geral.ts`, `origins.ts`) somam só `quantidade`, que é NULL em linha KG → quantidade 0, preço médio 0 e devolução KG descartada (`qtd <= 0`). Sem efeito financeiro; erra relatório assim que o KG for ligado. Frente de Relatórios em homologação — não alterado. **Gate antes do F1.**
  - P2-2 corrigido (`24b0b88`): cenário de sucesso com aparelho real.
  - P3-1 corrigido: J afirma 409 `VENDA_ORIGEM_NAO_ENCONTRADA`.
  - P3-2 corrigido (J2).
  - P3-3 registrado: venda mista com título parcialmente pago recebe 409 (contrato do aparelho, mais estrito); merge com guard em RUN aplicaria as KG no build — manter `MIGRATION_AUTHORITY_ENABLED` fora de RUN e seguir o runbook.
  - Lacuna conhecida: cancelamento de venda mista KG+aparelho **a prazo** não tem teste PG (o teste de sucesso é em dinheiro).

## 5. Production (somente leitura, identidade conferida no servidor) — [01](01-production-readonly.txt), [02](02-migrations-repo-vs-production.txt)

- `omnigestao_prod` · projeto `dry-mouse-36002471` · endpoint `ep-summer-tooth-acltc6wi` · `transaction_read_only=on`.
- 30 migrations aplicadas, 0 pendentes/rolled back; pendentes do repo = exatamente as 4 KG. `20261113_admin_session_revocation` e `20261118_solicitacoes_teste_comercial` com checksum de CRLF (conteúdo igual).
- 7 colunas ainda `integer`; 0 funções/gatilhos `manual_kg*`; 0 CHECK do 07.
- Caixas ABERTOS: **1** (`loja-1`, desde 2026-11-19 14:50).
- Loja piloto `cliente-bc1c8ad5-5c08-4aaa-b125-7c1076a72f2e`: nome cadastrado **"Padaria TESTE"** (não renomeada), `codigoNumeracaoVenda` **vazio**, 1 ADMIN STORE, 1 produto KG (`PAO FRANCES`, saldo 0), 0 vendas/caixas/devoluções/movimentos, sem `pdvTrocasPeso` (= padrão ativado quando o KG for liberado).
- Vercel Production: nenhuma `PDV_MANUAL_KG_*`. Preview: override de banco só para `claude/estoque-manual-kg-001`; branches #335–#337 e qualquer branch nova usam o Preview genérico (destino não reconferido hoje).
- MIG-X: PR aberta de outra frente com migration = **#367** (`20261116090000_identificadores_etiquetas_p03`, DRAFT): só cria tabelas novas com FK para `estoque_produtos(id,storeId)`; não toca colunas KG. Reavaliar no J4.

## 6. Gates

| Gate | Estado |
| --- | --- |
| Técnico (merge, testes, build, lint, typecheck) | **GO técnico local**; CI remoto ainda não rodou nestes heads |
| R3 Codex | PENDENTE (cota) |
| P2-1 relatórios KG | PENDENTE — corrigir na frente de Relatórios antes do F1 |
| A6 | decidido (07 no J9); execução não autorizada |
| A7 / A8 | PENDENTE — 1 caixa aberto (loja-1), janela não marcada |
| A7b | PASS (só `plpgsql`) |
| MIG-X | PASS hoje (#367 sem sobreposição) |
| N1 / L1 | PENDENTE (janela / presencial) |
| Numeração da piloto | PENDENTE — `codigoNumeracaoVenda` vazio; dono provisiona pelo app |
| F1 | desligado; allowlist futura = só `cliente-bc1c8ad5-5c08-4aaa-b125-7c1076a72f2e` |
| Balança | visor #322 compatível; Toledo sem parser; checklist em `docs/padaria/pesagem/BALANCA_TESTE_FISICO_CHECKLIST.md` |
