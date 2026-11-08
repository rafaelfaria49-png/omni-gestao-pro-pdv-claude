# Prontidão do rollout KG — A4–A8, #315 → #335 → #336

GOAL `PADARIA-KG-RELEASE-READINESS-A4-A8-001` · 2026-11-06 · Claude Code (Opus 5.5).
**Nada foi executado em produção** neste GOAL: sem acesso ao Neon/Vercel produtivos, sem merge, sem deploy,
sem migration, sem troca de env, sem papel novo. Todos os testes novos rodaram em PostgreSQL 17 descartável.

```text
FINAL_STATUS=NO_GO_WITH_SPECIFIC_BLOCKERS   (todos os bloqueios são autorização/presencial; o técnico de push — T1/T2 — foi concluído em 2026-11-07)
PRODUCTION_UNCHANGED=YES
KG_PRODUCTION_RELEASE=DISABLED
DEFEITO_NOVO_ENCONTRADO=1 (gatilho de título da #335 varria todas as vendas da loja) → corrigido nesta PR, equivalência provada
```

Este documento **complementa** o runbook da #315 (`ESTOQUE_MANUAL_KG_RUNBOOK.md`, sequência canônica
A1–A8 / J0–J13 / F0–F4), que continua valendo para o estoque. Ele acrescenta o que o runbook não cobre:
as migrations e binários da #335/#336, a ordem real dos merges com deploy automático da Vercel,
a compatibilidade de venda entre versões e as autorizações restantes.

> **Atualização 2026-11-07 (GOAL `PADARIA-KG-STACK-RECONCILIATION-FINAL-001`).** T1 e T2 estão **concluídas**:
> a #315 versionou o runbook/checklist do A5, o `07` revisado do A6 e os registros A1–A6 (`26febda`, `9127faf`)
> e incorporou a main por merge (`d1a5d50`, `bed911a` = main `7cac3d8`), com CI 9/9. Conferência contra
> `reused-evidence-manifest.txt`: 98 arquivos da #315 iguais (91 byte a byte, 7 só com CRLF/LF misto normalizado
> pelo Git); os 10 de `PADARIA-GO-LIVE-FASTTRACK-002` fora da Fase 1 seguem intencionalmente não versionados.
> `07-guard-check-opcional.sql` no head: sha256 LF `dea40868…` (o aprovado no A6). #335, #336 e esta PR foram
> ressincronizadas por merge commit (§1). Registro: `_evidence/PADARIA-KG-STACK-RECONCILIATION-FINAL-001/`.

> **Atualização 2026-11-08 (GOAL `PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001`) — prevalece sobre §1–§3
> onde divergir.** A main andou para **`ce9228c`** (#339, catálogo de aparelhos por loja, migration aditiva
> `20261107120000_catalogo_aparelhos_loja`). A pilha foi reconciliada por merge commit, em cascata, **sem conflito**:
> #315 `9631590` (+ gate MIG-X no runbook, `df828d0`) → #335 → #336 → esta PR. Fora de `prisma/schema.prisma` e
> `produto-ia.tsx` (ambos só com a parte KG), todo arquivo trazido pelo merge ficou idêntico à main; sha256 das três
> migrations KG e do `07` (`dea40868…`) inalterados.
>
> Leitura RO de Production (Neon + Vercel, sem decriptar valores): Production serve `ce9228c` (`MIGRATION_SKIPPED`);
> **24** migrations, a `20261107` aplicada fora do build pela frente do catálogo; nenhuma KG; 5 colunas `integer`;
> 1 sessão de caixa ABERTA; **A7b fechado: `cron.job` inexistente nos 4 databases** (pg_cron só pré-carregado pela
> plataforma, extensão não criada). Gate novo **MIG-X** (runbook §0.1): pendentes exatas antes de J4/J8/9b; migration
> de outra frente nunca entra por `migrate deploy` do KG. V1 consolidado em §11. Provas novas: suíte KG 79/79 + 35 (2×),
> E2E KG 13/13, ordem KG × `20261107` indiferente em PG 17, integração PG do catálogo 12/12 sobre o banco migrado
> pela cadeia KG, build `MIGRATION_SKIPPED`/`PROXY_PRISMA_ARTIFACT_VERIFIED`, revisão independente APPROVE.
> Registro: `_evidence/PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001/`.

## 1. Estado real conferido (atualizado 2026-11-07, GitHub; nada lido da produção)

| Item | Valor | Conferência |
| --- | --- | --- |
| main | `7cac3d8` (#338) | `gh api …/commits/main` |
| #315 | `bed911a`, OPEN, pronta (não draft), base `main`, MERGEABLE, CI 9/9 verde | contém a main `7cac3d8` (T2 concluída) e as evidências A1–A6 (T1 concluída) |
| #335 | `3ebbd76` (merge de `bed911a` sobre `406ea48`), DRAFT, base `claude/estoque-manual-kg-001` | merge sem conflito textual; código idêntico a `406ea48` (o lado #315 trouxe só docs) |
| #336 | `bc1c3fc` (merge de `3ebbd76` sobre `adbc66e`), DRAFT, base `claude/padaria-kg-venda-peso-integracao-001` | contém a #331 `b0de724`; código idêntico a `adbc66e` |
| Esta PR (#337) | merge de `bc1c3fc` sobre `1df1e79` | código idêntico a `1df1e79`; `20261106` intacta |
| #331 | `b0de724`, DRAFT, base `main` | supersedida pela #336 no caminho KG — **não mergear isolada** |
| Prisma | 6.19.3 em todos os heads (package.json idêntico main↔#336) | sem diferença de versão de pacote; a incompatibilidade é de **schema** (Int × Float) |
| Migrations novas | `20261025120000_estoque_quantidade_fracionada` (#315, sha256 `f07242c4…a06a47e`) · `20261029120000_manual_kg_sale_quantity` (#335, `8757ee99…`) · **`20261106120000_manual_kg_title_guard_indexed` (esta PR)** | produção: 23 migrations, nenhuma destas (A4) |
| Flags | `STOCK_WRITES_FROZEN` (só no código da #315+), `PDV_MANUAL_KG_RELEASE` + `PDV_MANUAL_KG_STORES` (ausentes, padrão OFF), `SALE_SERVER_NUMBERING_ENABLED` (**não alterar**), `MIGRATION_AUTHORITY_ENABLED=false` | valores Production são `sensitive`; não relidos |
| Revisões | #315 R4/R5/R7 APPROVE · #335 R6 APPROVE (Codex) · #336 R3 APPROVE_WITH_LIMITATIONS (Claude, Codex sem cota) | **R3 cruzada Codex da #336: ainda NÃO ocorreu**; possível a partir de 2026-11-10 |
| Production em uso | último registro: deployment `7UqN8Rrkz9…`, commit `ba010ac` (A4, 2026-10-29) | desde então a main andou até `37acc3b`; o commit atual em Production **não foi conferido** (exige acesso Vercel) |

Histórico (2026-11-06): `git merge-tree 37acc3b 104d768` = árvore `ff3870d4…`, sem CI na época. Superado: o J4
agora publica o head `bed911a` da #315, que já contém a main `7cac3d8` e tem CI 9/9 do head exato. Se a main
andar de novo antes da janela, repetir merge + CI na #315 e propagar por merge a #335/#336/esta PR.

## 2. Matriz A4–A8 (e gates que o A8 exige)

| Requisito | Classificação | Evidência / motivo |
| --- | --- | --- |
| **A1** baseline RO de produção | PASS_COM_EVIDENCIA (2026-10-28) | `a1-production-baseline-006/` — 5 colunas `integer`, só drift 0019. **Retrato vencido**: refazer no preflight da janela |
| **A1.1** loja-5 fechada | PASS_COM_EVIDENCIA | `a1-1-loja5-fechamento-007/` |
| **A2** credenciais offline | PASS_COM_EVIDENCIA | `PADARIA-GO-LIVE-FASTTRACK-002` fase 1, 30/30; não regenerar |
| **A3** papéis + GRANTs em produção | PASS_COM_EVIDENCIA (já executado; **01 não é idempotente**) | `a3-production-roles-grants-008/` |
| **A4** login runtime direto/pooler + migrator, RO | **PASS_COM_EVIDENCIA** (2026-10-29 12:08Z) | `a4-production-login-readonly-009/12-final-summary.json`. Limite: capacidade de migrar do migrator **não exercitada** em produção (só após o 03) |
| **A5** runbook consolidado | PASS_COM_EVIDENCIA (documental, versionado na #315 — T1 concluída) | `a5-runbook-consolidation-010/`, 55/55 checks locais |
| **A5+** plano cobrindo #335/#336 | PASS_COM_EVIDENCIA (este documento) | antes não havia plano para a migration aditiva, papel de sessão, ordem de merges |
| **A6** decisão do `07` (CHECK milésimos) | PASS técnico (APPROVE do sha `dea40868…`) + **PENDENTE_AUTORIZACAO** (aplicar ou não) | `a6-guard-review-011/`; ensaio novo confirma que bloqueia o cliente Int (§6) |
| **A7** conectores Neon/Vercel/GitHub indisponíveis a outras sessões | **PENDENTE_AUTORIZACAO** + PENDENTE_PRESENCIAL | depende do dono desconectar/confirmar (ChatGPT Neon, MCPs) — não verificável sem acesso |
| **A7b** leitura `cron.job` no database `postgres` | **PASS_COM_EVIDENCIA (2026-11-08)** — reconfirmar no J0 | extensão `pg_cron` não criada em `neondb`/`omnigestao_prod`/`omnigestao_prod_candidate`/`postgres`; `cron.job` inexistente (o A1 viu só o `shared_preload_libraries` da plataforma) |
| **A8** janela + congelamento §3 | **PENDENTE_AUTORIZACAO** + PENDENTE_PRESENCIAL | aviso às pessoas e sessões de IA; data/hora |
| Reconciliação #315 × main + CI do head exato | **PASS** (T2 concluída) | `bed911a` contém a main `7cac3d8`, CI 9/9; #335/#336/esta PR ressincronizadas por merge |
| Inventário integral de deployments no início da janela | **V1 atualizado 2026-11-08 (§11)**; refazer no J0/J7 | token Vercel CLI válido em 2026-11-08 (leitura de metadados); valores `sensitive` não legíveis → BLOCKED_WITH_REASON onde dependem do valor |
| Compatibilidade com a main `ce9228c` (#339) | **PASS_COM_EVIDENCIA** | merge limpo; catálogo 12/12 sobre banco migrado pela cadeia KG; revisão independente APPROVE |
| Dependência de migrations de outras frentes (MIG-X) | **PASS hoje** — reconferir antes de J4/J8/9b | runbook §0.1 |
| Checklist das duas lojas | **PENDENTE_PRESENCIAL** | modelo pronto (`KG_RELEASE_CHECKLIST_DONO.md`) |
| Ensaio Neon 002 (ACL, suspend/start, pooler, corte, 01–06/99, retrato) | PASS_COM_EVIDENCIA (reaproveitado) | `neon-rehearsal-002/`; **não cobre** a migration aditiva da #335 — coberta agora pelo ensaio sintético (§6), sem Neon |
| Isolamento do Preview (P1–P5) | PASS_COM_EVIDENCIA | `preview-isolation-003/` |
| Compatibilidade de venda entre versões | **PASS_COM_EVIDENCIA (novo)** | §6 |
| Desempenho dos gatilhos da #335 | era **BLOCKED** (defeito) → PASS após `20261106` | §6.3 |
| R3 cruzada Codex da #336 | PENDENTE_TECNICO — reconferido 2026-11-08: Codex CLI 0.166 sem cota até **2026-11-10 21:48** | não ocorreu; não declarar |

**GO/NO-GO:** NO-GO. Nenhum item técnico bloqueante sem caminho: os restantes são autorizações e
presença nas lojas.

## 3. Pendências reais (objetivas) e o próximo procedimento exato

| # | Pendência | Tipo | Por que bloqueia | Próximo procedimento exato |
| --- | --- | --- | --- | --- |
| ~~T1~~ | **Concluída 2026-11-07** — docs/evidências A1–A6 e `07` versionados na #315 (`26febda`, `9127faf`) | — | — | na janela, só reconferir `07-guard-check-opcional.sql` sha256 LF = `dea40868…` |
| ~~T2~~ | **Concluída 2026-11-07** — #315 `bed911a` contém a main `7cac3d8`, CI 9/9; #335/#336/esta PR atualizadas por merge | — | — | se a main andar antes da janela: novo merge na #315 + CI, e propagar |
| T3 | Revisão desta PR (migration `20261106`) | técnico | altera função SECURITY DEFINER da #335 | revisão independente (2 rodadas, APPROVE na 2ª, §8) + revisão humana; R cruzada Codex opcional a partir de 2026-11-10 |
| T4 | R3 cruzada Codex da #336 | técnico | política de revisão cruzada | repetir a partir de 2026-11-10 com `R3_PACOTE.md` |
| A6 | aplicar ou não o `07` | autorização | barreira extra contra cliente Int | **recomendado aplicar** no J9 (ensaio novo: com o 07 o banco recusa a escrita Int; sem ele, o banco aceitou NaN e só a releitura do Prisma reverteu) |
| A7 | conectores e sessões de IA | autorização + presencial | outra sessão com credencial age como o operador; o corte não distingue | dono desliga conector Neon do ChatGPT e MCPs com alcance a produção; lista de sessões encerradas |
| A7b | `cron.job` | autorização | escritor agendado fora do inventário | leitura RO com identidade travada no database `postgres` (consulta no runbook §0) |
| A8 | janela | autorização + presencial | — | marcar data/hora com as lojas fechadas; declarar congelamento §3 do runbook |
| L1 | checklist RAFACELL / RAFA BRINQUEDOS | presencial | fila vive no navegador, por endereço | dono/operador preenchem `KG_RELEASE_CHECKLIST_DONO.md` em cada terminal na janela |
| V1 | inventário Vercel e token | autorização | o corte depende de saber quem ainda alcança o banco | token Vercel válido (o A4 recebeu `invalidToken`) com permissão de leitura de deployments |
| N1 | ponto de recuperação Neon (J1) | autorização (possível custo de branch no plano Launch) | sem ele não há volta após o J8 | criar branch datado no projeto `dry-mouse-36002471`, anotar id + LSN |
| F1 | flags KG por loja | autorização separada | venda por peso | só depois de W1–W3 estáveis: `PDV_MANUAL_KG_RELEASE` + `PDV_MANUAL_KG_STORES` com IDs exatos |

## 4. Plano técnico de implantação

### 4.1 Onde ainda existe risco (explícito)

| Risco | Onde | Proteção |
| --- | --- | --- |
| **Deploy automático Vercel** | todo merge na `main` publica Production do `omni-gestao-pro` | só mergear no passo da janela; #335/#336 permanecem DRAFT até a hora; ninguém mais com permissão de merge durante o congelamento |
| Merge da #315 sem retarget | após o merge da #315, a #335 continua com base `claude/estoque-manual-kg-001`; "Merge" nela **não chega à main** | trocar a base da #335 para `main` (e da #336 depois), conferir que o diff é só da PR, esperar CI verde |
| **#335 publicada antes da migration aditiva** | o cliente da #335 seleciona `venda_itens.quantidadeKg`; sem a coluna, toda leitura de venda falha (P2022) | aplicar `20261029` + `20261106` **antes** do merge da #335 (W1-M, abaixo) |
| Migration aditiva sem papel de dono | a `20261029` exige `current_user` = dono das tabelas; após o 03 o dono é `omni_owner` e o login é `omni_migrator` | conexão com `options=-c role=omni_owner` (provado: sem ela falha com `KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED`, sem efeito) |
| `CREATE` em `public` para `omni_owner` | as funções da `20261029` são criadas por `omni_owner`; depende de `public` pertencer a `pg_database_owner` (padrão PG15+) e do 03 ter passado o database para `omni_owner` | preflight novo (§5.2) antes da migration aditiva |
| **Cliente Prisma Int × colunas Float** | qualquer build/script sem a #315 após o J8 | corte CONNECT + sessões (runbook J6/J7), `07`, congelamento; **Redeploy/Promote/Instant Rollback de deployment antigo proibidos para sempre** |
| **Rollback impossível** | depois do COMMIT do J8 (estoque) e depois da 1ª venda KG (venda) | §7 |
| Trocar o writer | `SALE_SERVER_NUMBERING_ENABLED` | **não alterar** em nenhuma etapa; o ensaio provou replay entre versões com o writer fixo, não com troca |
| **Lacuna de schema entre W1 e W2/W3** | depois do 9b, produção tem `quantidadeKg` + gatilhos, mas o `schema.prisma`/migrations da `main` (só #315) não | até o merge desta PR: **proibido** `prisma db push`, `migrate dev`, `migrate diff --script` aplicado ou qualquer script de schema a partir de checkout da `main`/#315 contra produção (derrubaria `quantidadeKg`; `manual_kg_guard_item` passaria a falhar em toda venda). Manter W1→W2→W3 curtos; o congelamento §3 do runbook vale até o merge desta PR |
| `MIGRATION_AUTHORITY_ENABLED` | se ligado antes do 9b, o build rodaria `migrate deploy` sem o papel de dono: a `20261029` falha e deixa linha `failed` (P3009) que trava as próximas | manter `false` (build com `MIGRATION_SKIPPED`) pelo menos até o merge desta PR |
| Método de merge | retarget de PR empilhada | usar **merge commit** (não squash) em #315/#335/#336; com squash o diff retargetado repete os commits anteriores |

### 4.2 Sequência (os 17 passos pedidos, revisados e ligados ao runbook)

Três janelas. **W1** com as lojas fechadas (é a única com corte e ponto de não-retorno). **W2/W3** podem ser
janelas curtas separadas; não há obrigação de fazer tudo no mesmo dia, e separar reduz o raio de falha.

| Passo pedido | Onde | Ação exata | Gate |
| --- | --- | --- | --- |
| 1. Pré-flight e autorização | antes de W1 | T3, A6–A8, V1, N1 autorizados (T1/T2 já concluídas); heads e SHAs (migrations, `07`, apply script) registrados na autorização | lista assinada |
| 2. Verificação das duas lojas | W1 / J0 | `KG_RELEASE_CHECKLIST_DONO.md` em cada terminal + consulta RO de **todas** as sessões ABERTA | ABERTA=0, pendências=0 |
| 3. Ponto de recuperação | W1 / J1 | branch Neon datado | id + LSN |
| 4. Trava de escrita | W1 / J2 | `STOCK_WRITES_FROZEN=true` em Production | env listada |
| 5. Deploy compatível | W1 / J3+J4 | envs → `omni_runtime_v2`; merge da #315 (já reconciliada: `bed911a`, ou o head que a reconciliar de novo) | build READY, `MIGRATION_SKIPPED`, `PROXY_PRISMA_ARTIFACT_VERIFIED`, só esse commit desde o J3 |
| 6. Troca controlada do runtime | W1 / J3–J5 | runtime novo no ar com trava | sonda "manutenção programada" |
| 7. Corte e drenagem dos escritores antigos | W1 / J6 | 03 → 04 → 05 (imediatamente) → 06 | `KG_CORTE_POSSE_OK`, `KG_CORTE_CONEXAO_OK`, `KG_SESSOES_ANTIGAS_ZERO`, 06 |
| 8. Conferência das sessões | W1 / J7 | 06 de novo ≥ 5 min; transações abertas; sonda de URL antiga; lista de deployments | quatro conferências |
| 9. Migration com retrato | W1 / J8 | `estoque-kg-migration-apply.sql` (migrator, `-1`) + `migrate resolve --applied 20261025…` — **PONTO DE NÃO-RETORNO** | `KG_MIGRATION_OK`, checksum |
| 9a. Barreira opcional | W1 / J9 | `07` se A6 autorizado | sem erro, 5 CHECKs validados |
| 10. Verificações pós-migration | W1 / J10 (**antes** do 9b) | frações/NaN/denormais = 0; 06; `migrate status` e `migrate diff` **do checkout do merge da #315** = só drift 0019 | os cinco itens |
| **10b. Migrations aditivas da venda (novo, "9b")** | W1, logo **depois** do J10, trava ligada | preflight §5.2; depois, **do checkout do head aprovado desta PR**: `prisma migrate deploy` com `DIRECT_URL`/`DATABASE_URL` do migrator **+ `options=-c role=omni_owner`** → aplica só `20261029` e `20261106` | `migrate status` **deste checkout** em dia; `migrate diff` **deste checkout** = só drift 0019 (o diff do checkout da #315 aqui acusaria `quantidadeKg` — esperado, **não "corrigir"**); funções `manual_kg_*` donas `omni_owner`; 8 gatilhos; `venda_itens.quantidade` ainda `integer` |
| 11. Remoção da trava | W1 / J11 | remover `STOCK_WRITES_FROZEN`; Redeploy **do deployment do merge da #315** (conferir SHA) | READY, pendências zerando |
| 12. Sincronização de filas | W1 / J11–J13 | terminais reabrem no endereço canônico; filas reenviam sozinhas (replay provado §6) | pendências = 0 em cada terminal |
| 13. Smoke estoque KG | W1 / J12 | loja de homologação, produto KG sintético: entrada 0,001 kg, histórico, ficha; venda por peso recusada | quatro itens |
| — | W1 / J13 | reabrir lojas com o binário da #315 | — |
| 14. Integração #335 | W2 | trocar base da #335 para `main`; CI verde; merge (deploy automático) **com `PDV_MANUAL_KG_RELEASE` ausente** | READY; venda UN normal; venda por peso recusada; leitura de histórico OK |
| 15. Integração #336 | W3 | trocar base para `main`; CI; merge | F8 UN funciona; `DEVOLUCAO_KG_BLOQUEADA` |
| 15a. Esta PR | após W3 (ou junto) | merge: só docs + migration já aplicada no 9b + runner de teste; sem mudança de runtime | `migrate status` em dia a partir da main |
| 16. Regressão | W1/W2/W3 | smoke UN em cada loja (venda, cancelamento, caixa), sem venda comercial real como teste automático | — |
| 17. Flags KG | depois, autorização separada | `PDV_MANUAL_KG_RELEASE=PDV-PADARIA-KG-RELEASE-HARDENING-002` + `PDV_MANUAL_KG_STORES=<storeId exato>` + Redeploy do mesmo commit | uma loja por vez |

**Por que a ordem é esta (revisão técnica):**
- 4 antes de 5: a env é retrato do build; trava depois do build não vale.
- 5 antes de 9: com a migration antes do código, o cliente Int corromperia; com o código antes, a escrita Float
  em `integer` falha fechada (`22P03`) e a trava já está ligada.
- 9b (10b) depois do J10 e antes de 14: a `20261029` exige `venda_itens.quantidade integer` (continua) e dono = papel
  de sessão (só existe depois do 03); a #335 não pode subir sem a coluna. O binário da #315 é compatível com o
  schema aditivo (35 verificações `Prisma315` da `verify-manual-kg-migration.mjs`, PASS nesta PR).
- 9b ainda dentro de W1: as funções de guarda devem existir antes de qualquer binário que grave venda KG, e
  aplicá-las com a trava ligada e o corte feito evita qualquer escritor concorrente.
- 14 e 15 separados: cada merge é um deploy automático; separar permite smoke e parada entre eles.

## 5. Isolamento do banco — Estratégia B (preparado, não executado)

### 5.1 Já pronto e reutilizado

`omni_owner` (NOLOGIN), `omni_migrator`, `omni_runtime_v2` **existem em produção** (A3) com credenciais
independentes (A2); isolamento do Preview em outro projeto Neon (P1–P5). Scripts `rollout/01–07, 99`
provados em PG local, no branch Neon 002 e, agora, de novo no ensaio sintético integrado (§6).
Proteções contra escritores antigos: corte `CONNECT` + `pg_terminate_backend` (o único efetivo),
congelamento §3 do runbook, `07` opcional, proibição permanente de Redeploy/Promote/Instant Rollback
de deployments anteriores à #315 e de scripts de checkouts antigos (`db:*`, backfills).

### 5.2 Preflight novo antes do 9b (somente leitura, migrator, `options=-c role=omni_owner`)

```sql
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT 'KG_9B_IDENTIDADE_OK' WHERE 1 / CASE WHEN current_setting('neon.project_id', true) = 'dry-mouse-36002471'
  AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
  AND current_setting('neon.endpoint_id', true) = 'ep-summer-tooth-acltc6wi'
  AND current_database() = 'omnigestao_prod' AND session_user = 'omni_migrator' AND current_user = 'omni_owner'
  AND NOT pg_is_in_recovery() THEN 1 ELSE 0 END = 1;
SELECT 'public dono=' || pg_get_userbyid(nspowner) || ' create_omni_owner=' || has_schema_privilege('omni_owner', 'public', 'CREATE')
  FROM pg_namespace WHERE nspname = 'public';                                         -- esperado: create_omni_owner=true
SELECT 'database dono=' || pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();  -- omni_owner
SELECT 'venda_itens.quantidade=' || data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'venda_itens' AND column_name = 'quantidade';            -- integer
SELECT 'tabelas_alvo_fora_do_dono=' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('vendas','venda_itens','estoque_produtos','devolucoes_venda','contas_receber_titulos',
   'movimentacoes_estoque','movimentacoes_financeiras','usos_credito_cliente','itens_devolucao_venda')
   AND (pg_get_userbyid(c.relowner) <> 'omni_owner' OR c.relforcerowsecurity);                        -- 0
SELECT 'funcoes_manual_kg=' || count(*) FROM pg_proc WHERE proname LIKE 'manual_kg_%';                 -- 0 antes do 9b
ROLLBACK;
```

`create_omni_owner=false` = NO-GO do 9b (não conceder CREATE ad hoc na janela; abrir decisão própria).

### 5.3 Comando do 9b (do checkout do head aprovado desta PR, credencial fora do argv)

```bash
# DIRECT_URL/DATABASE_URL = MIGRATOR_DIRECT_URL do A2 + "&options=-c%20role%3Domni_owner", exportadas a partir do arquivo de segredos
node node_modules/prisma/build/index.js migrate status    # pendentes: exatamente 20261029120000 e 20261106120000
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js migrate status    # "Database schema is up to date!"
```

Se `migrate status` listar qualquer outra pendente além dessas duas: **parar** (main mudou; reabrir o plano).

No ensaio (run-05/06) as duas foram aplicadas em dois `migrate deploy` com o mesmo `options` (a `20261029` do checkout
da #335, a `20261106` do topo). Um único `migrate deploy` do topo usa o mesmo mecanismo; se preferir reproduzir
exatamente o ensaio, fazer em dois passos.

## 6. Riscos de venda — compatibilidade real (provas)

### 6.1 Ensaio sintético integrado (novo) — `cross-version-run-06/`, PASS

Conclusivo: **run-06**, executado num HEAD **commitado e limpo** (`4385d3f`, `dirty=false`). Cadeia exata de versões que a produção vai atravessar, cada uma com o seu código real
e o seu cliente Prisma gerado, contra o mesmo banco descartável (commits e árvores registrados em
`cross-version-run-06/cross-version-summary.json` → `versions`):

| Versão | Commit / árvore | Papel |
| --- | --- | --- |
| main (Int; em produção na época do ensaio) | `37acc3b` | `neondb_owner`, antes do corte |
| J4 → J11 (#315 sobre a main) | probe local `e058d9c`, árvore `ff3870d4…` = `merge-tree 37acc3b 104d768` (o head atual `bed911a` = essa árvore + 4 pins `ubuntu-24.04` de CI, sem diferença de código de app) | `omni_runtime_v2` |
| W2 (#335) | `406ea48` | `omni_runtime_v2` |
| W3 (#336 + esta PR) | `4385d3f` (limpo; o código fora de `docs/` é idêntico ao head ressincronizado desta PR) | `omni_runtime_v2` |

Scripts oficiais do HEAD da #315 + `07` revisado do A6 (sha256 LF `dea40868…`); hashes LF de todos os scripts e
migrations no mesmo JSON. Run-05 (mesma cadeia, topo ainda com harness não commitado, fila só v1) e run-03/04 (só main → topo) ficam como histórico.

PostgreSQL 17.10 descartável, papel antigo `neondb_owner` herdando `pg_write_all_data` (topologia Neon),
schema da main criado por ele e 23 migrations resolvidas. Sequência: 01/02 (A3) → fase antiga → corte
03→04→05→06 com uma sessão antiga pendurada → migration de estoque pelo script verificado → 99 → **J10 do
estoque pelo checkout da #315** (diff vazio) → 9b: `20261029` por `migrate deploy` **do checkout da #335** e
`20261106` por `migrate deploy` do topo, **ambas com `options=-c role=omni_owner`** → J10 pelo topo →
fases #315 → #335 → topo. Em cada fase: todas as vendas anteriores reenviadas (sequencial + 3 paralelos),
1º envio **concorrente** (3 ao mesmo tempo) das vendas v1 **e** v2 deixadas na fila pela versão anterior, uma v1 e
uma v2 novas com resposta perdida; reenvio com fatos diferentes recusado com `PedidoIdConflitoMesmaLojaError` (v1) e
`ClientSaleIdReusedError` (v2).

| Prova | Resultado |
| --- | --- |
| Vendas v1 (`pedidoId`) e v2 (`clientSaleId`) gravadas por uma versão, resposta perdida, reenviadas a **cada** versão seguinte (main→#315, →#335, →topo) | 2 + 6 + 10 reenvios, todos `replayed=true`, mesmo `pedidoId`, **fingerprint idêntico** entre todas as versões |
| 3 reenvios paralelos de cada venda em cada versão | todos `replayed=true`, mesmo `pedidoId` |
| Vendas v1 e v2 que ficaram só na fila de uma versão, 1º envio concorrente (3×) na seguinte e reenvio | exatamente 1 gravação por venda, mesmo `pedidoId` nos 3, reenvio `replayed=true` — nas três transições |
| Reenvio com fatos diferentes | recusado em cada versão pela classe de erro específica (não vira venda nova) |
| Totais ao fim | 14 vendas, 14 itens, 14 movimentos de estoque, 1 movimento financeiro por venda, saldo 33 = 50 − Σ quantidades, `double precision` |
| Corte | `KG_CORTE_POSSE_OK`, `KG_CORTE_CONEXAO_OK`, `KG_SESSOES_ANTIGAS_ZERO`, papel antigo `connect=false` e login recusado (`permission denied for database`) |
| `99` depois do J8 | recusa `KG_DESFAZER_PROIBIDO_MIGRATION_JA_APLICADA` |
| Migration aditiva sem papel de dono (psql e `migrate deploy`) | recusada `KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED`, sem efeito |
| Migrations aditivas por `prisma migrate deploy` com `options=-c role=omni_owner` (20261029 do checkout da #335; 20261106 do topo) | aplicadas; funções donas `omni_owner`; `migrate status` em dia; `migrate diff` vazio (#315 antes do 9b e topo depois); J10 frações=0, NaN/denormais=0 |
| Venda KG sob a topologia real (runtime só DML, funções SECURITY DEFINER de `omni_owner`) | 0,35 kg + 1,25 kg, replay v1 e 3× v2 paralelos sem duplicar; saldo 3,4; `quantidade` NULL/`quantidadeKg` exato; adulteração direta recusada `MANUAL_KG_COMPATIBLE_WRITER_REQUIRED` |
| `07` × venda/estoque KG (novo, 2026-11-07) | banco vazio → migrations `20261025`/`20261029`/`20261106` → `07` aplicado e validado (5 CHECKs) → suíte KG oficial **79/79** + 35 verificações com os CHECKs ativos; 30 saldos fracionados gravados sem `23514`; os 5 CHECKs continuam `convalidated` ao fim. O `07` não bloqueia nenhum caminho KG legítimo (`_evidence/PADARIA-KG-STACK-RECONCILIATION-FINAL-001/`) |
| "Redeploy" proibido simulado: cliente Int da main com a credencial nova | **com o 07**: recusado pelo banco (`23514`, CHECK `estoque_produtos_stock_kg_milesimos`, valor enviado subnormal — `1.6e-322` no run-06), nada mudou. **Sem o 07**: o banco **aceitou** os valores corrompidos dentro da transação; o Prisma Int só abortou ao ler o retorno (`Could not convert from NaN to Int`) e a transação reverteu. Ou seja, sem o 07 a proteção deste caminho é acidental; caminhos que não releem o valor corrompem (`old-client-WRITE-after-migration.txt`, A6). Reforça: aplicar o 07 e manter o corte |

### 6.2 Itens pedidos × evidência

| Item | Evidência | Situação |
| --- | --- | --- |
| Escritor v1 × v2, `clientSaleId`, idempotência, respostas perdidas | §6.1 + `manual-kg-sale.pg.test.ts` (V2 concorrente) | PASS |
| Fila offline / vendas pendentes | §6.1 (fila → 1º envio) + `rollout-remediation/30-fila-pdv.txt` (trava → 5xx → AUTO_RETRY) | PASS; a fila vive no navegador por origem → checklist |
| Sessões de caixa | `requireCaixaSession` ativo em todas as fases; sessão é por terminal (E2E #335) | PASS; ABERTA=0 no J0 |
| Fechamento financeiro | 1 movimento por venda (§6.1); centavos half-up (#335) | PASS |
| Cancelamento | `f8-venda-kg.pg.test.ts` caso 3 e 4 (cancelamento × 5 devoluções) | PASS (79/79 nesta PR) |
| Vale da F8 | `f8-venda-kg` caso 3; R2-P2 da #336 (vale da fila reconciliado) | PASS |
| Estoque fracionado | boundary em milésimos; `07` | PASS |
| SKU alterado e `Produto.id` | `f8-venda-kg` caso 5; R1-P1 da #336; `PRODUTO_NAO_RESOLVIDO` (#335) | PASS |
| `SALE_SERVER_NUMBERING_ENABLED` | **não alterado**; o writer v1 não deduplica por `clientSaleId` quando a flag muda (achado da #315) | risco conhecido, mitigado por não trocar |

**Limite honesto:** o ensaio usa o servidor de cada versão contra o mesmo banco; o JavaScript do navegador
(PWA com bundle antigo enviando para o servidor novo) foi coberto pelo formato do payload (o mesmo JSON da
fila foi reenviado) e pelo E2E da #335/#336, não por um navegador com bundle `37acc3b`.

### 6.3 Defeito novo encontrado e corrigido: gatilho de título varria a loja inteira

`manual_kg_title_protected` (da `20261029`) avaliava `manual_kg_venda_protected()` para **cada venda da loja**
a cada escrita em `contas_receber_titulos` e a cada movimento financeiro que referencia um título
(baixa/recebimento). Medido com 30.000 vendas sintéticas (sim_eq):

| Escrita | antes | depois (`20261106`) | sem gatilho |
| --- | ---: | ---: | ---: |
| INSERT de título | 517,0 ms | 1,7 ms | 0,05–0,12 ms |
| UPDATE de título | 1.189,2 ms | 1,6 ms | — |
| movimento financeiro → título | 576,9 ms | 1,8 ms | 0,04–0,07 ms |
| movimento financeiro → venda | 0,85 ms | 0,37 ms | — |

(run-06, média de 20 escritas; run-03/04/05 dão a mesma ordem de grandeza — ver `trigger-overhead-and-equivalence` em cada `cross-version-summary.json`.)

O custo crescia linearmente com o histórico; uma venda a prazo com parcelas faz várias escritas de título
na mesma transação (timeout 20 s). A correção é **só o corpo da função**: candidatos resolvidos por índice
(`contaReceberTituloId`, `pedidoId` único por prefixo do `localKey`, `id`/`pedidoId` do `payload.vendas`)
num CTE `MATERIALIZED`, e só eles passam por `manual_kg_venda_protected`. Equivalência **exata** com o corpo
original: 2.304 combinações (lojas, títulos, `localKey` com prefixos colidentes `A1/A10/A100`, maiúsculas,
acentos, `pedidoId` vazio, `doc` não-array/não-objeto/`saleId` nulo), **0 divergências**, 771 verdadeiros.
A suíte oficial KG (79/79) e as 35 verificações de compatibilidade rodaram com a nova função.

## 7. Recuperação / rollback

Fases F0–F4 do runbook valem para o estoque. Acréscimos:

| Fase | Estado | Recuperação |
| --- | --- | --- |
| F2b — falha no 9b (preflight ou migrate) | estoque já Float (pós-J8), venda sem aditiva | trava continua; `20261029` e `20261106` têm `BEGIN/COMMIT` + timeouts: falha não deixa efeito parcial; `migrate resolve --rolled-back` da que falhou; diagnosticar; **reabrir com o binário da #315 é permitido** (não depende da aditiva). Não forçar `GRANT CREATE` nem mudar dono ad hoc. **Caso parcial:** `20261029` aplicada e `20261106` falhou → os gatilhos lentos estão ativos (§6.3); manter a trava até aplicar a `20261106`, ou reabrir só com venda a prazo/recebimento de títulos como NO-GO operacional até lá |
| F5 — falha no W2 (#335 no ar) antes de qualquer venda KG | aditiva aplicada, flag KG ausente | rollback preferido: corrigir para frente. Voltar o código para a #315 (revert do merge da #335) é **tecnicamente compatível** com o int4 preservado; nunca voltar para antes da #315 |
| F6 — falha no W3 (#336) | idem | revert do merge da #336 → binário #335; F8 KG continua bloqueada nos dois |
| F7 — depois da 1ª venda KG (flag ligada) | linhas com `quantidade NULL` | não voltar a clientes com `quantidade Int` obrigatório (falham `P2032` na leitura); desligar flag/allowlist; manter binário atual; não remover `quantidadeKg`, gatilhos ou restaurar NOT NULL |
| Pontos de não-retorno | COMMIT do J8; 1ª entrada fracionária (F4); 1ª venda KG (F7) | só branch do J1, descartando o posterior, com autorização própria |

## 8. Avaliação independente

Revisor de contexto limpo, somente leitura, sobre esta PR (migration `20261106`, runner, harness e este
plano): `docs/ai-execution/_evidence/PADARIA-KG-RELEASE-READINESS-A4-A8-001/INDEPENDENT_REVIEW.md` —
**APPROVE_WITH_LIMITATIONS** na 1ª rodada, sem nenhuma entrada em que os dois corpos da função divirjam; os três
P2 (cadeia intermediária não ensaiada, ordem 9b/J10 com o gate de drift, lacuna de schema W1→W2) e os P3 foram
tratados neste documento e no run-05/06. **Rodada 2 (após as correções): APPROVE**, só P3, também tratados
(run-06 no HEAD limpo). Tabelas de tratamento no arquivo.
A revisão cruzada por outra família de modelo (Codex) **não ocorreu** neste GOAL.

## 9. Ordem final de PRs

1. **#315** — T1/T2 concluídas (docs versionados, main reconciliada, CI do head exato). Merge no **J4**.
2. Migrations `20261029` + `20261106` aplicadas no **9b** (W1), do head aprovado **desta PR**.
3. **#335** — base trocada para `main`, CI verde, merge no **W2**.
4. **#336** — base trocada para `main`, CI verde, merge no **W3**.
5. **Esta PR** — base trocada para `main`, CI verde, merge após W3 (sem efeito de runtime).

**#331 não deve ser mergeada isoladamente na main** (supersedida pela #336 no caminho KG).

## 10. Autorizações humanas necessárias

1. ~~Push de docs/evidências na branch da #315 (T1) e merge da main nela (T2)~~ — concluído em 2026-11-07.
2. Decisão A6 (aplicar o `07`).
3. A7: desligar conectores/sessões; A7b: leitura de `cron.job`.
4. A8: janela W1 com lojas fechadas + congelamento; janelas W2 e W3.
5. Token Vercel de leitura para o inventário de deployments.
6. Branch Neon de recuperação (J1) e eventual custo.
7. Na janela, cada passo de escrita: J2, J3, J4, J6, J8, J9, 9b, J11 (troca de env, merge, scripts).
8. Merges da #335, #336 e desta PR.
9. Separadamente, a habilitação KG por loja (`PDV_MANUAL_KG_*`).

## 11. V1 — inventário de escritores possíveis (somente leitura, 2026-11-08)

Método: `vercel api` GET (metadados; nenhum valor decriptado) e psql RO no Neon de produção. Detalhe e JSON em
`_evidence/PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001/`.

| Caminho até o banco de produção | Estado | Fecha em | Situação |
| --- | --- | --- | --- |
| Production `omni-gestao-pro` atual (`ce9228c`, `dpl_GhyK8L…`, único com alias: `omni-gestao-pro.vercel.app`, `-git-main`, `-rafaelfaria49…`) | cliente Prisma **Int**; `DATABASE_URL`/`DIRECT_URL` Production (`p2OLtFuiyUymtIRA`/`38TkKDEr1OIgsxy0`, sem alteração desde 2026-07-27 → papel antigo, por continuidade) | J3/J4 (env → `omni_runtime_v2` + merge da #315) e J6 (corte do papel antigo) | PASS de inventário |
| 7 deployments Production antigos do `omni-gestao-pro` (`7cac3d8`, `37acc3b`, `8cbd551`, `a07e067`, `4946688`, `aaab275`, `ba010ac`) | **sem alias**, mas URL de deployment **pública** (`ssoProtection=null`); mesma env Production do build → papel antigo | J6 (`04`/`05`: CONNECT revogado + sessões encerradas); J7 sonda `permission denied` | PASS de inventário; não removidos (fora do escopo) |
| Previews `omni-gestao-pro` das 4 branches KG | #315 com override próprio (`VUjVxPk2…`/`BWFYesLF…`, 2026-10-27, Neon de Preview `pr315-kg`); #335/#336/#337 usam o Preview genérico (`CAgFUTJY…`/`WfY0iLLQ…`, atualizado pela última vez em 2026-10-27 = P3, projeto Neon de Preview isolado) | — | PASS por continuidade de metadados (IDs e `updatedAt` iguais aos da P3); o destino em si exige decriptar → **BLOCKED_WITH_REASON** para prova direta |
| Previews de outras branches com override de banco (`codex/omni-print-d05-homologacao-fisica-001`) | override próprio (2026-11-05), frente Omni Print | — | fora da frente KG; registrado |
| Projeto Vercel `omni-gestao` (`prj_IbJi32rh…`) — Production `e9eb984` (2026-10-15, alias `omni-gestao-pi.vercel.app`) + 2 antigos sem alias | `DATABASE_URL`/`DIRECT_URL` só em Production, criadas 2026-05-08 (antes do cutover Neon de 2026-07) e nunca atualizadas; builds Production novos são **ignorados** (`commandForIgnoringBuildStep` sai 0 em production; o de `ce9228c` ficou CANCELED); URLs com `ssoProtection=all_except_custom_domains` | se o destino for o Neon de produção com `neondb_owner`, o J6 também o corta | destino não comprovável sem decriptar → **BLOCKED_WITH_REASON**; recomendação ao dono: confirmar/neutralizar antes da janela |
| Previews do projeto `omni-gestao` (inclui `3ebbd76`, `bc1c3fc`, `7b72223`) | sem `DATABASE_URL`/`DIRECT_URL` para Preview → não alcançam banco | — | PASS (ausência de credencial) |
| `pg_cron` / jobs agendados | extensão não criada nos 4 databases | — | PASS (A7b) |
| Conexões no momento da leitura | só a própria sessão RO (`neondb_owner`, `psql`) | — | retrato pontual; o J5/J7 refaz |
| Sessões de IA/conectores (A7) | não verificável por leitura | presencial/dono | **PENDENTE_AUTORIZACAO** |

Flags (metadados apenas; valores `sensitive`/`encrypted` não lidos):

| Flag | Existência em Production | Conclusão |
| --- | --- | --- |
| `STOCK_WRITES_FROZEN` | **ausente** em todos os ambientes | trava desligada (esperado antes do J2) |
| `MIGRATION_AUTHORITY_ENABLED` | presente (`PzB5wlYj…`, `sensitive`, atualizada 2026-10-16) | valor ilegível → BLOCKED_WITH_REASON; efeito observado: build `ce9228c` = `MIGRATION_SKIPPED` |
| `PDV_MANUAL_KG_RELEASE` / `PDV_MANUAL_KG_STORES` | **ausentes** em todos os ambientes | venda KG desligada (padrão OFF) |
| `SALE_SERVER_NUMBERING_ENABLED` | presente (`c0XM97qF…`, `encrypted`, 2026-08-18, sem alteração) | não alterar; valor não lido |

Ligação com o runbook: Production atual e deployments antigos → J3–J7; Previews → isolamento P1–P5 (sem ação na
janela); projeto `omni-gestao` → decisão do dono antes do J0 (V1 residual); flags → J2/J11 (`STOCK_WRITES_FROZEN`),
J4 (`MIGRATION_SKIPPED`), F1 (`PDV_MANUAL_KG_*`).

Observações fora do escopo KG (relatadas, não corrigidas): o `AUTH_SECRET` genérico `0CDB8CwX…` vale para
`preview+production`; o projeto `omni-gestao` expõe credenciais reais de WhatsApp/Stripe a Previews; Node 20.x no
`omni-gestao-pro` (aviso de depreciação).
