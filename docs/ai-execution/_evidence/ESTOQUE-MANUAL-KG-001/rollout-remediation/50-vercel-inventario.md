# Inventário de deployments Vercel — leitura em 2026-10-25 (API `/v6/deployments`, somente leitura)

Fonte: `vercel api` autenticado como o dono do time. Nenhum deployment, env ou configuração foi alterado.
Valores de variáveis `sensitive` não são legíveis pela API e não foram lidos; a classificação usa nomes, alvos e datas.

## Contagem

| Projeto | Alvo | Estado | Qtde | Alcança `omnigestao_prod`? | Por quê |
| --- | --- | --- | ---: | --- | --- |
| omni-gestao-pro | production | READY | 14 | **SIM — escritor** | `DATABASE_URL` Production = `neondb_owner@omnigestao_prod` (env de 2026-07-27, inalterada); URL pública (sem Deployment Protection) |
| omni-gestao-pro | preview | READY | 52 | não pelo código; **a credencial sim** | `DATABASE_URL` Preview = `neondb_owner@omnigestao_prod_candidate` — **mesmo papel e mesma senha** da produção, só muda o database |
| omni-gestao | production | CANCELED | 12 | não | build cancelado pelo Ignored Build Step; não há função publicada |
| omni-gestao | preview | READY | 50 | não | projeto sem `DATABASE_URL` em Preview; Vercel SSO ligado |
| omni-gestao | preview | CANCELED | 2 | não | build cancelado |
| omni-gestao | production | READY | 3 | não | `DATABASE_URL` Production de 2026-05-08 (anterior ao corte Neon de 2026-07-27) → Supabase congelado; Vercel SSO `all_except_custom_domains` |
| **Total** | | | **133** | | |

Escritores efetivos no banco canônico hoje: **14** (todos os deployments de Production do `omni-gestao-pro`, um deles o atual).
Os demais 119 são artefatos sem caminho de código até `omnigestao_prod` — mas 52 previews carregam a mesma credencial que alcança produção.
A política de retenção do projeto (`expirationDays` 30, Production 30, `deploymentsToKeep` 10) já apaga deployments antigos sozinha (compatível com o mais antigo vivo ser de 2026-08-16 e o Production mais antigo, de 2026-10-23).

O número 109 do pré-flight não foi reproduzido: o relatório não está no repositório e a lista muda a cada push e a cada expiração (5 deployments da própria branch da PR #315 foram criados hoje).

## Escritores efetivos (Production `omni-gestao-pro`, READY)

| Criado (UTC) | Commit | Prefixo da URL | Incremento/decremento Int no código |
| --- | --- | --- | --- |
| 2026-10-25 15:21 | `745fb55` | `omni-gestao-mgdtmf5cr` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-25 13:59 | `57cab7c` | `omni-gestao-e7i3e1qr8` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-25 11:38 | `a288ea2` | `omni-gestao-321mw56sn` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-25 02:43 | `913864f` | `omni-gestao-formhgqel` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-25 02:21 | `b3712e1` | `omni-gestao-6j803sz90` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-24 22:21 | `0f5f563` | `omni-gestao-f90uft0nx` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-24 20:16 | `460d294` | `omni-gestao-8sq88arq2` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-24 15:36 | `f44cb8d` | `omni-gestao-rlhs3utbu` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-24 12:09 | `9dd6311` | `omni-gestao-8cxyau27j` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-24 11:28 | `7ee1566` | `omni-gestao-pjsq7lwxw` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-23 11:37 | `40bf623` | `omni-gestao-kh8zmsrk7` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-23 03:15 | `0adec21` | `omni-gestao-hn2oysk8i` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-23 03:08 | `4f2c245` | `omni-gestao-6ybl18pvx` | só `lib/os-itens-stock.ts` (sem chamador) |
| 2026-10-23 00:21 | `040fcc7` | `omni-gestao-a350wed8u` | só `lib/os-itens-stock.ts` (sem chamador) |

Todos gravam estoque com valor ABSOLUTO pelo ledger (`stock: estoqueDepois`), exatamente o caminho que corrompe em coluna double (13 → 6e-323).

## Previews do `omni-gestao-pro` (READY) por branch

| Branch | Qtde |
| --- | ---: |
| `codex/cliente-basico-configuracoes-estoque` | 7 |
| `codex/piloto-primeiro-acesso-padaria` | 6 |
| `claude/estoque-manual-kg-001` | 5 |
| `codex/cadastro-manual-padaria` | 4 |
| `codex/cadastro-categoria-estoque-feedback` | 3 |
| `goal/pdv-parity-n5-c-e2e-002` | 3 |
| `codex/pessoas-001b-recovery-002-auth-plan` | 1 |
| `codex/pdv-padaria-comprovante-nao-fiscal-g2-001` | 1 |
| `codex/pdv-padaria-historico-pagamento-g1-001` | 1 |
| `codex/pdv-n5c-numbering-tests-011-01a16e07` | 1 |
| `codex/pdv-n5c-pr299-audit-fix-011-01a16e07` | 1 |
| `codex/pdv-n5c-legacy-regressions-triage-010` | 1 |
| `plan/pessoas-001b-recovery-002` | 1 |
| `codex/pdv-n5-c-e2e-driver-focus-007` | 1 |
| `goal/pessoas-001b-recovery-001` | 1 |
| `goal/fiscal-025b-archive-foundation-001` | 1 |
| `codex/aep-pessoas-001b-blocked-reconciliation` | 1 |
| `goal/fiscal-022-pilot-homologation-activation` | 1 |
| `cursor/fiscal-017-h9-h10-expired-window-recovery-84f7` | 1 |
| `cursor/ops-v4-checklist-rajada-fix-08c0` | 1 |
| `cursor/setup-dev-environment-b543` | 1 |
| `cursor/fiscal-017-h9-h10-new-window-materialization-a58c` | 1 |
| `cursor/pdv-vendas-writer-v2-006f-d-audit-ef3b` | 1 |
| `cursor/vendas-polling-bounded-003b-8dd3` | 1 |
| `cursor/fiscal-021-danfce-qr-regulatory-audit-b491` | 1 |
| `cursor/fiscal-020a-contingencia-nfce-policy-contracts-5be7` | 1 |
| `cursor/fiscal-020-contingencia-nfce-audit-plan-4646` | 1 |
| `cursor/fiscal-019-inutilizacao-nfce-offline-foundation-493f` | 1 |
| `cursor/fiscal-018-cancelamento-regulatory-package-39c6` | 1 |
| `cursor/fiscal-018-cancelamento-offline-foundation-39c6` | 1 |

Overrides de Preview por branch com `DATABASE_URL` próprio (2026-10-14/15): `codex/release-ops-v4-vercel`, `goal/ops-v4-financeiro-retirada-garantia-002`, `codex/release-ops-v4-datas`, `codex/ops-v4-goal003-family-regularization`. Nenhum deployment READY usa esses overrides hoje; o destino (valor sensitive) não é legível — confirmar com quem os criou ou removê-los.

## Configuração lida

- `omni-gestao-pro`: `ssoProtection = null` (nenhuma Deployment Protection), domínio único `omni-gestao-pro.vercel.app`, Node 20.x, Firewall ligado (regras gerenciadas), sem cron.
- `omni-gestao`: `ssoProtection = all_except_custom_domains`, domínio `omni-gestao-pi.vercel.app`.
- Sondagem HTTP só leitura (GET `/login`, sem credencial): `omni-gestao-pro.vercel.app` 200; `omni-gestao-a350wed8u-…vercel.app` (Production mais antigo vivo, 2026-10-23) **200 público**; `omni-gestao-pi.vercel.app` 200 — isto é, no modo `all_except_custom_domains` o domínio `.vercel.app` de **produção** continua público e só as URLs de hash ficam protegidas.
