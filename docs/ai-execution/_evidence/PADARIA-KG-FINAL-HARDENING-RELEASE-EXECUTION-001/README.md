# PADARIA-KG-FINAL-HARDENING-RELEASE-EXECUTION-001

2026-11-08 · Claude Code (Opus 5.5). Produção **somente leitura**. Nesta execução: **0 escritas, 0 migrations,
0 deploys de Production, 0 envs alteradas, 0 merges na `main`, 0 flags KG ativadas**. Nenhuma sessão de caixa foi
tocada e nenhum branch Neon foi criado ou removido. As frentes #327/#334/#328/#339 não foram alteradas.

## Baseline e heads

| | Antes | Depois |
| --- | --- | --- |
| main | `ce9228c` | `ce9228c` (não andou) |
| #315 | `df828d0` | `2284491`: runbook com decisão A6, §0.2 V1/MIG-X/Neon e gate do J9 |
| #335 | `2a5a8f2` | `dd264a6`: merge da #315 (só docs) |
| #336 | `709c64e` | `20d2210` (fix do cancelamento) + `a413ad5` (merge da #335) |
| #337 | `fcccc34` | `28ef9e2` (merge da #336) + este registro |

Todas as atualizações foram por merge commit e fast-forward, sem rebase, force-push ou retarget. #335/#336/#337
continuam em draft.

## Decisão A6

- `A6_OWNER_DECISION=APPROVED_APPLY_07` · `A6_APPLY_TIMING=W1_J9_ONLY` · `A6_PRODUCTION_EXECUTION=NOT_YET_AUTHORIZED`.
- Origem: decisão expressa do proprietário no texto deste GOAL (2026-11-08).
- Script `docs/padaria/pesagem/rollout/07-guard-check-opcional.sql`: 4.996 bytes LF, sha256 LF
  `dea40868a5458e1cceeeae90c9db5ff91a7e291432326269fca932fca5d51935`. É idêntico ao registro A6
  (`ESTOQUE-MANUAL-KG-001/a6-guard-review-011/07-decision.json`) e à revisão independente APPROVE (`06-independent-review.md`).
  Os bytes não foram alterados.
- Reensaio em PG 17 descartável:
  - harness A6 original: [235/235](03-a6-proof-235-checks.json) e [161/161](04-a6-scale-edge-161-checks.json).
    Valores KG/UN válidos aceitos; NaN, ±Inf, subnormais (bits de cliente Int), excesso de casas e `0.30000000000000004`
    recusados. Os SETs não-zero do cliente Prisma Int foram bloqueados.
  - suíte KG oficial com o 07 aplicado depois das migrations: **80/80** e os 5 CHECKs validados. O 07 não bloqueia
    entrada nem venda KG válidas.
- Runbook atualizado (A6 e J9). O 07 **não** foi executado em produção.

## V1 — escritores antigos

Inventário em [01](01-vercel-inventory-both-projects.json) (Vercel GET, sem decriptar) e
[02](02-neon-console-project-metadata.json) (API do Console Neon, GET). Tabela completa no runbook §0.2.

- **Projeto secundário `omni-gestao`: não alcança o Neon de produção.**
  - `DATABASE_URL` e `DIRECT_URL` existem só em Production e foram criadas/alteradas em 2026-05-08 17:56Z.
  - O projeto Neon `dry-mouse-36002471` e o endpoint `ep-summer-tooth-acltc6wi` foram criados em 2026-07-27 15:49:12Z.
  - Logo, nenhum desses valores contém o host de produção.
  - Os Previews desse projeto não têm env de banco. Os builds novos de Production são ignorados (CANCELED).
  - Não há integração Vercel–Neon na conta.
- **`omni-gestao-pro` (cliente Prisma Int, papel `neondb_owner`):**
  - Escritores: Production atual, 7 Production antigos sem alias (URL direta pública) e os previews anteriores a
    2026-10-27 22:05Z (credencial do candidate no mesmo endpoint).
  - Barreira: J6 `04` (CONNECT só para `omni_runtime_v2`/`omni_migrator`) + `05`, conferida no J7.
  - As memberships de `neondb_owner` em `omni_*` têm `inherit=f` e `set=f` ([06](06-neon-role-memberships-readonly.txt)),
    portanto não reabrem o CONNECT. Mas `admin_option=t` permite re-concessão manual, o que é risco humano coberto por A7/congelamento.
- Status: **V1 = PASS de inventário**. A demonstração da barreira em produção só pode ocorrer no J6/J7 da janela,
  já ensaiada em PG 17 com a mesma topologia (`ESTOQUE-MANUAL-KG-001/rollout-remediation/`, ensaio Neon 002).

## MIG-X e Neon (RO, identidade lida do servidor)

Retrato em [05](05-neon-production-readonly.txt):

- Identidade: `omnigestao_prod`, `neon.project_id=dry-mouse-36002471`, `neon.endpoint_id=ep-summer-tooth-acltc6wi`,
  `transaction_read_only=on`, PostgreSQL 17.11.
- Migrations: 24 finalizadas, 0 falhas. Os checksums são idênticos aos arquivos do repositório, inclusive o da `20261107` (`57b39143…`).
- Pendentes:
  - main: nenhuma;
  - #315 `df828d0`: exatamente `20261025`;
  - topo da pilha: exatamente `20261025`, `20261029` e `20261106`.
- Nenhuma PR aberta de outra frente adiciona migration. **MIG-X = PASS.**
- Estado do schema e dos dados:
  - 5 colunas KG e `venda_itens.quantidade` em `integer`;
  - 0 CHECKs, 0 objetos `manual_kg_*`, 0 frações;
  - extensões: só `plpgsql`; `cron.job` inexistente, então A7b continua PASS.
- Caixa: **1 sessão ABERTA**, 242 fechadas.
- Conexões: só a sessão RO desta leitura.

## Revisões

| Revisão | Resultado |
| --- | --- |
| R3 Codex (#336) | **PENDING**: exec real às 2026-11-08 devolveu `You've hit your usage limit … try again at Nov 10th, 2026 9:48 PM` (codex-cli 0.166.0-alpha.5.1). Cota não contornada |
| Substituta, contexto limpo, só leitura (pilha, foco #336) | 1ª passada **APPROVE_WITH_NOTES**: P2-1 real, P2-2 conhecido (migration 20261106 da #337, já no MIG-X), P3-1 e P3-2. 2ª passada sobre os heads finais `a413ad5`/`28ef9e2`: **APPROVE** |

Achados e destino:

- **P2-1 (corrigido).** Uma venda com o marcador `manualKgSale` e só linhas UN (produto passou a UN antes do reenvio
  offline) não podia ser cancelada: o gatilho do banco exige o writer KG pelo marcador, mas a rota escolhia o
  caminho KG só por linha KG, e a resposta era 503 genérico.
  - Correção em `20d2210`: o mesmo critério do banco (marcador OU linha KG).
  - RED→GREEN em [07](07-kg-suite-red-green.txt).
  - O defeito nasceu na #335, mas é inalcançável com o F1 desligado. O F1 só ocorre após W3, então o fix entra
    junto com a #336.
- **P3-1 (aceito por desenho).** Recusas sem código (401/403/404/422) ficam em "aguardar" e são reenviadas.
  - Não foi alterado: 401/403/404 podem ser transitórios (sessão expirada, re-login, caixa reaberto), e parar a
    retentativa perderia devoluções legítimas.
  - Há saída manual no painel F8 (encaminhar como bloqueio persistente).
- **P3-2 (aceito).** Uma quantidade KG corrompida no cancelamento devolve 503 genérico. É fail-closed, sem efeito;
  só a mensagem é pobre.
- **Contrato, decisão do dono.** A F8 recusa todas as linhas de uma venda KG mista (UN inclusive); a saída é o
  cancelamento integral. Está documentado e testado, mas precisa de confirmação do dono.

## Testes ([07](07-kg-suite-red-green.txt), [08](08-build-e2e-lint-tsc-catalog.txt), [09](09-vitest-targeted-head-vs-main.txt))

- KG oficial: **80/80 + 35** (3 rodadas verdes, uma delas com o 07 ativo).
- E2E KG autenticado: **13/13**.
- Catálogo PG: **12/12** sobre o banco migrado pela cadeia KG.
- Typecheck: PASS. ESLint: 0 erros. Build: `MIGRATION_SKIPPED`/`PROXY_PRISMA_ARTIFACT_VERIFIED`.
- `migrate status` em dia e `migrate diff` vazio.
- Vitest dirigido (estoque, PDV, vendas, cadastros, catálogo, caixa, rotas de vendas/ops/estoque, actions, telas de
  vendas/estoque; Node 22):
  - head: 3.737 passed / 97 failed;
  - main: 3.570 passed / 105 failed;
  - **0 falhas novas**: todas as falhas do head também falham na main (ambientais/pré-existentes), e a main tem 8
    a mais que a pilha corrige.
- `app/api/vendas/[id]/cancelar/route.test.ts`: 27 falhas idênticas na main → pré-existente, fora do escopo.

## Matriz GO/NO-GO (estado em 2026-11-08)

| Gate | Estado |
| --- | --- |
| Técnico (código, testes, build, CI, revisão substituta) | **GO técnico** |
| A6 | decidido (aplicar no J9); execução não autorizada |
| A7 conectores/sessões | **NO-GO** — pendente |
| A7b | PASS |
| A8 janela | **NO-GO** — pendente; 1 caixa ABERTA |
| V1 | PASS de inventário; barreira só demonstrável no J6/J7 |
| MIG-X | PASS (repetir no J4/J8/9b) |
| N1 | **NO-GO** — não autorizado |
| L1 presencial | **NO-GO** — pendente |
| R3 Codex | **NO-GO** — PENDING (ou exceção expressa do dono) |
| F1 | desligado; autorização separada |

**FINAL_STATUS=NO_GO_WITH_SPECIFIC_BLOCKERS.** Os bloqueios são todos de autorização, presenciais ou da cota Codex;
nenhum é técnico.

## Plano de execução e falhas

Sem mudança de sequência: runbook da #315 (A/J0–J13/F0–F4, agora com o gate do J9 e as proteções do J6/J7 do §0.2)
e `KG_RELEASE_READINESS_A4_A8.md` §4 (W1–W3, 9b). Pendências presenciais: checklist `KG_RELEASE_CHECKLIST_DONO.md`.

## Observações de segurança fora do escopo (relatadas, não alteradas)

| Prioridade | Observação | Recomendação |
| --- | --- | --- |
| P1 | `AUTH_SECRET` único para Preview e Production no `omni-gestao-pro` (cookie de Preview vale em Production) | gerar segredo próprio por ambiente em GOAL de plataforma |
| P2 | projeto `omni-gestao` expõe credenciais reais WhatsApp/Stripe a Previews (66 READY, SSO ativo) | remover ou escopar essas envs, ou arquivar o projeto, que não recebe builds de Production |
| P2 | `neondb_owner` (credencial em arquivos locais e no Console) tem `admin_option` sobre os papéis novos | após W1, rotacionar a senha de `neondb_owner` e restringir quem a possui |
| P3 | Node 20.x no `omni-gestao-pro` (depreciado pela Vercel; hoje só aviso no build) | migrar para 24.x em GOAL próprio |
| P3 | branch Neon `kg-rehearsal-002-temp` com cópia de dados de produção de 2026-10-26 | remover com autorização N própria |
