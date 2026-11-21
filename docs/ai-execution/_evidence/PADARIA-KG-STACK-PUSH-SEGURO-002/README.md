# PADARIA-KG-STACK-PUSH-SEGURO-002 — 2026-11-21

Executor: Claude Code. Continuação de `PADARIA-KG-STACK-CONTINUIDADE-RECONCILIACAO-001`.
Escopo: integrar a main `464190a` na pilha KG reconciliada, provar o isolamento dos Previews,
testar e atualizar as 4 PRs existentes por push fast-forward. **Sem merge na main, sem migration
em Production, sem env alterada, KG desligado.**

## 1. Isolamento dos Previews (somente leitura — Vercel GET, nenhum valor de credencial lido)

Os valores de `DATABASE_URL`/`DIRECT_URL` são do tipo **sensitive**: nem a CLI nem a API devolvem o
valor (o `env pull` grava string vazia). A prova é por metadados + o registro da aplicação P3:

| Env (id) | Alvo | `updatedAt` hoje | Destino gravado na P3 (2026-10-27T22:05Z, `11-p3-apply.md`) |
| --- | --- | --- | --- |
| `DATABASE_URL` `CAgFUTJYNOJb64j1` | Preview genérico | 2026-10-27T22:05:32.158Z | Neon `nameless-frost-19035275` / `br-lively-feather-b6esh64a` · `ep-purple-morning-b6ajdsfk-pooler` · papel `preview_runtime` · db `omnigestao_preview` |
| `DIRECT_URL` `WfY0iLLQ8cbQOXHd` | Preview genérico | 2026-10-27T22:05:32.473Z | idem, `ep-purple-morning-b6ajdsfk` |
| `DATABASE_URL` `VUjVxPk2VgPGdjEW` | Preview `claude/estoque-manual-kg-001` (#315) | 2026-10-27T22:05:33.337Z | branch filho `pr315-kg` `br-wandering-band-b6ov7vmt` · `ep-red-wave-b6bbj667-pooler` · `preview_runtime` · `omnigestao_preview` |
| `DIRECT_URL` `BWFYesLFr0hAJWjT` | Preview #315 | 2026-10-27T22:05:33.656Z | idem, `ep-red-wave-b6bbj667` |
| `DATABASE_URL` `p2OLtFuiyUymtIRA` / `DIRECT_URL` `38TkKDEr1OIgsxy0` | **somente** Production | 2026-07-27 | Production: `dry-mouse-36002471` · `ep-summer-tooth-acltc6wi` · `omnigestao_prod` |

- Os `updatedAt` são os mesmos, ao segundo, da aplicação P3: os valores não mudaram desde então.
  A P5 (2026-10-28) provou em runtime que o Preview da #315 lê só o `pr315-kg`.
- Preview e Production estão em **projetos Neon diferentes** (org QA × produção). O papel do Preview
  é `preview_runtime`, não o dono, e não existe no projeto de produção.
- As branches #335/#336/#337 não têm override e usam o Preview genérico (QA). Há 0 envs
  compartilhadas de team e nenhuma `PDV_MANUAL_KG_*` em Preview: o KG fica desligado nos Previews.
- **Migration:** `scripts/vercel-build.mjs` → `migration-authority-guard.mjs` só devolve RUN com
  `VERCEL_ENV=production` + project id canônico + flag. Preview → `MIGRATION_SKIPPED` sempre.
  `MIGRATION_AUTHORITY_ENABLED` existe só no alvo Production (e nos overrides de 4 branches `qa/`/`goal/` alheias).
- O segundo projeto Vercel ligado ao repo (`omni-gestao`, `prj_IbJi…`) tem `DATABASE_URL`/`DIRECT_URL`
  só em Production, tem SSO e o ignore step cancela Production: o Preview dele não tem banco.
- **Limitação:** não havia credencial local do projeto QA para reconfirmar o alvo por conexão hoje.
  A prova de hoje é imutabilidade dos metadados + registro P3/P5.
- **Ressalva conhecida:** o `pr315-kg` tem o schema KG antigo (colunas double). O Preview da #315 pode
  falhar em telas KG, mas só no banco QA.
- **Ressalva pré-existente:** o Preview genérico tem `WHATSAPP_*` e `AUTH_SECRET`, compartilhado com
  Production. A pilha KG não toca nesses caminhos.

## 2. Integração com a main `464190a`

`merge --no-ff` em cadeia, sem conflito: #315 `4411fce` → #335 `968b415` → #336 `f2f95c2` → #337 `0467a49`
(+ `15b7dd4` teste + este registro). `lib/relatorios` da pilha é idêntico à main (#382 intacta).
`prisma/` e `scripts/vercel-build.mjs` têm a mesma árvore da prova anterior de ordem/drift.

## 3. Testes (PG 17 descartável 127.0.0.1:55479, dados sintéticos; Node 22)

| Prova | Resultado |
| --- | --- |
| Suíte oficial KG (`run-manual-kg-tests.mjs`, banco recriado) | **98/98** + **35 checks** migration/Prisma315/RLS |
| Novo: mista KG + aparelho **a prazo** sem recebimento | títulos `cancelado`, KG +0,5 exato, IMEI `em_revisao` sem saldo, 0 saída de caixa, replay 409 sem efeito |
| Novo: mista KG + aparelho a prazo com **recebimento parcial** | 409 `APARELHO_CANCELAMENTO_BLOQUEADO`, nada muda |
| Mutação (sem `cancelarTitulosAparelhosTx`) | os 2 testes novos ficam vermelhos; mutação revertida (rota sem diff) |
| Relatórios (#382): `lib/relatorios` + `app/api/relatorios` | 90/90 unidade; `run-local-qa.mjs` (cluster novo) **42/42** PG (enterprise, revogação, geral) |
| Vitest dirigido (vendas, devolução, aparelhos, estoque, pdv, components/dashboard/vendas) | 2169 pass; só `pdv-scan-autoclear.static` 6 (igual na main, provado no 001) |
| Typecheck | exit 0 (heap 5,5 GB) |
| ESLint `.` | 0 erros (68 avisos pré-existentes) |
| Build local sem env de produção (`npm run build`) | `MIGRATION_SKIPPED`, "✓ Compiled successfully", exit 0 |
| E2E autenticado KG (`run-manual-kg-e2e.mjs`, sobre o build) | **13/13** passed; 18× `KG_BROWSER_ERROR … reading 'waiting'` = `pwa-update-prompt` sem SW (pré-existente desde a #335) |

## 4. Pendências de rollout (inalteradas)

R3 Codex (cota até 2026-11-22 09:23) · **relatórios KG (bloqueador da ativação comercial)** · A6 execução ·
A7/A8 (caixa aberto) · N1/L1 · numeração da piloto vazia · F1 desligado · teste físico da balança.
