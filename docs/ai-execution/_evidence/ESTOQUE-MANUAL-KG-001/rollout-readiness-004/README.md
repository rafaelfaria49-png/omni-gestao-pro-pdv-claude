# ESTOQUE-KG-PRE-ROLLOUT-READINESS-001 — prontidão do rollout da migration KG (2026-10-28)

> **Atualização (GOAL 005, 2026-10-28):** as correções da §8 A5 e o checklist A/J/P desta auditoria foram incorporados ao `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_RUNBOOK.md`, que passa a ser a versão canônica. Este arquivo fica como registro da auditoria.

**Só leitura e planejamento.** Nenhuma conexão ao banco produtivo, nenhum SQL de alteração, nenhuma migration,
credencial, env, deploy, commit, push ou merge. Leituras feitas: API Vercel (GET, metadados e logs de build),
GitHub (metadados das PRs #315/#318, `git fetch`), arquivos do repositório e classificação local de `.env`
(sem imprimir valores). Registros locais P4 (`fb88ab4`) e P5 (`13-p5-runtime-db.md`, `harness/p5-prova-runtime.cjs`)
preservados como estavam: não commitados, não publicados.

```
ROLLOUT_READINESS=NO-GO
LEGACY_WRITERS_INVENTORIED=YES
ROLE_CUTOVER_READY=NO
QUEUES_AND_CASH_GATES_READY=NO
RECOVERY_PLAN_READY=YES
PRODUCTION_CHANGES=0
```

## 1. Estado de referência

| Item | Valor lido | Fonte |
| --- | --- | --- |
| PR #315 | OPEN, head `2731097`, MERGEABLE/CLEAN, CI 11/11 (P4) | `gh pr view 315` |
| `origin/main` | `34b70a1` (#317), 0 commits além; contida na PR | `git fetch` + `merge-base` |
| Migration | `20261025120000_estoque_quantidade_fracionada`, 1041 bytes, sha256 `f07242c4…a06a47e` (confere) | `git show HEAD:…` |
| Última migration antes dela | `20261022120000_platform_pilot_access` | `prisma/migrations` |
| Production atual | `34b70a1`, build 2026-10-27 01:14Z, log `MIGRATION_SKIPPED` + `PROXY_PRISMA_ARTIFACT_VERIFIED` | `/v3/deployments/…/events` |
| `MIGRATION_AUTHORITY_ENABLED` Production | sensitive (2026-10-16), ilegível; **o efeito** nos 2 últimos builds é `MIGRATION_SKIPPED` | logs de build |
| P5 | PASS: runtime do preview `2731097` lê o `pr315-kg` | `preview-isolation-003/13-p5-runtime-db.md` |

## 2. Escritores legados — inventário atualizado (Vercel, 2026-10-28T09:37Z)

| Projeto | Alvo | READY | Credencial no retrato | Alcança `omnigestao_prod`? |
| --- | --- | ---: | --- | --- |
| `omni-gestao-pro` | production | **15** (2026-10-23 00:21Z → 2026-10-27 01:14Z; o 15º, novo desde 10-25, é `34b70a1`) | `neondb_owner@omnigestao_prod` (env de 2026-07-27, inalterada) | **SIM — escritor `Int`** |
| `omni-gestao-pro` | preview, criados **antes** da P3 (22:05Z de 10-27) | **56** (32 branches; a #315 tem 6; a #318 tem 1; a #317 tem 2) | `neondb_owner@omnigestao_prod_candidate` no endpoint de prod, **mesma senha** | não pelo código; **a credencial sim** |
| `omni-gestao-pro` | preview, criados depois da P3 | 3 | `preview_runtime@omnigestao_preview` (outro projeto Neon) | não |
| `omni-gestao` | production READY | 3 (2026-10-15) | Supabase de 2026-05-08 | não (fora do Neon) |
| `omni-gestao` | preview READY | 57 | sem `DATABASE_URL` | não |

Configuração: `omni-gestao-pro` com `ssoProtection=null` (URLs públicas), 0 crons, região `gru1`, Node 20.x;
`omni-gestao` com Ignored Build Step (13 Production CANCELED).

**Correção ao runbook:** "a retenção de 30 dias os remove depois" **não se sustenta**. A política é
`expirationDays=30`, mas o deployment READY mais antigo do `omni-gestao-pro` é de **2026-08-16** (73 dias). Não
contar com a retenção para nada: o que fecha os escritores é o corte de CONNECT (04+05).

**Fora da Vercel, com credencial que abre o cluster de produção** (classificação local, sem valores):

| Arquivo | Papel / database | Efeito do corte |
| --- | --- | --- |
| `C:\Projetos\secrets\neon-production.env` (`NEON_PROD_*`) | `neondb_owner@omnigestao_prod` | cortado (é o papel antigo) |
| `C:\Projetos\secrets\neon-production.env` (`NEON_PREVIEW_*`), `C:\Projetos\omni-gestao\.env` | `neondb_owner@omnigestao_prod_candidate` | candidate segue acessível; prod cortado |
| `C:\Projetos\secrets\neon-migration.env` | `neondb_owner@neondb` | é o login usado pelos scripts 01 e 05 |
| `C:\Projetos\secrets\neon-candidate-readonly.env` | `omnigestao_candidate_audit_ro@candidate` | sem CONNECT em prod depois do 04 (o 04 recusa se sobrar) |

Nenhuma worktree tem `.env` próprio com URL de produção. Os workflows do GitHub usam PG local; nenhum segredo de
banco no repositório. Não existe fila de vendas no servidor: a fila de pendências vive só no navegador.

**Caminhos humanos/agentes que o corte não distingue de código** (congelar durante a janela): Console Neon
(SQL Editor, reset de senha, dono de database), conector Neon do ChatGPT (usado na P1/P2.0 — confirmar se
alcança a org de produção `org-spring-butterfly-51302013`), outras sessões Claude/Codex/Cursor com
`neon-production.env`, `vercel redeploy`/"Promote"/"Instant Rollback" pelo painel.

## 3. Estratégia B — conferência dos scripts

| Script | Quem / onde | Marcador | Achado da auditoria |
| --- | --- | --- | --- |
| `01-papeis.sql` | `neondb_owner` @ `neondb` | `KG_PAPEIS_OK` | recusa herança de `pg_write_all_data`/`neon_superuser` e SET ROLE; papéis por SQL, nunca pelo Console |
| `02-grants-runtime.sql` | `neondb_owner` @ `omnigestao_prod` | `KG_RUNTIME_GRANTS_OK` | DML tabela a tabela; recusa RLS. Pré-janela, sem efeito nos escritores |
| `03-corte-posse.sql` | `neondb_owner` @ prod, `-1` | `KG_CORTE_POSSE_OK` | `ALTER DATABASE OWNER` antes de `ALTER TABLE`; `lock_timeout` 15 s **por tabela** (≈96 tabelas) — espera vendas em voo |
| `04-corte-conexao.sql` | `omni_migrator` @ prod, `-1` | `KG_CORTE_CONEXAO_OK` | confere `has_database_privilege`; recusa papel extra com CONNECT |
| `05-encerrar-sessoes.sql` | `neondb_owner` @ `neondb` | `KG_SESSOES_ANTIGAS_ZERO` | **imediatamente após o 04** (pooler reaproveita conexão entre os dois — ensaio 002) |
| `06-verificacao.sql` | `omni_migrator` @ prod, READ ONLY | — | rodar antes/depois de cada passo e após 5 min (`maxDuration` máximo no app = **180 s**, conferido: 1 rota 180, 3×120, 7×60, 1×30) |
| `estoque-kg-migration-apply.sql` | `omni_migrator` @ prod direto (5432), `-1` | `KG_MIGRATION_OK` | DDL idêntico à migration (sha confere); retrato md5 por linha sob ACCESS EXCLUSIVE |
| `99-desfazer-corte.sql` | `omni_migrator` @ prod, `-1` | — | recusa se as 5 colunas não forem `int4` (proibido após a migration por construção) |
| `07-guard-check-opcional.sql` | `omni_migrator` @ prod | — | opcional, exige revisão independente própria |

Ensaio em branch Neon real (002) cobriu 01→05, suspend/start e restart do compute, pooler e `omni_runtime_v2`
pelo pooler (UPDATE/INSERT/DELETE com sucesso). **Nada disso foi aplicado no cluster de produção.**

## 4. Credenciais `omni_runtime_v2` e `omni_migrator` — preparo (NÃO executado)

1. Gerar as 2 senhas offline (≥ 32 bytes, `base64url`, sem caracteres que exijam escape na URL) num arquivo novo
   `C:\Projetos\secrets\neon-production-kg\.env` (`KG_MIGRATOR_PASSWORD`, `KG_RUNTIME_V2_PASSWORD`), fora do repositório.
2. `01` lê as senhas só por `\getenv` (nunca argv). Rodar com `PGPASSWORD`/URL vinda de `neon-migration.env`.
3. Montar, a partir do host de produção (`ep-summer-tooth-acltc6wi`):
   - `DATABASE_URL` Production = `omni_runtime_v2@…-pooler…/omnigestao_prod?sslmode=require&pgbouncer=true`
   - `DIRECT_URL` Production = `omni_runtime_v2@…(direto)…/omnigestao_prod?sslmode=require` — **runtime, não migrator**:
     o build faz `MIGRATION_SKIPPED`, e o migrator nunca vai para a Vercel.
   - `MIGRATOR_DIRECT_URL` (só local) = `omni_migrator@…(direto)…/omnigestao_prod`.
4. Validar sem conexão (fase `url` no estilo do `p2-preparo-preview.cjs`): endpoint de prod, usuário, database,
   pooler/`pgbouncer=true`, `sslmode=require`.
5. **Não** gravar nada na Vercel antes da janela: a credencial do runtime só entra no mesmo passo do deploy da #315
   (um build `Int` com ela sobreviveria ao corte — revisão R1, P1).
6. Na janela, o `prisma migrate resolve` roda com `DIRECT_URL`/`DATABASE_URL` **exportados no shell** a partir do
   migrator (variável do processo vence o `.env`; o `.env` da raiz aponta para o candidate).

## 5. Trava, filas, caixas e demais escritores

- `STOCK_WRITES_FROZEN` existe só no código da #315 (`lib/estoque/stock-ledger-service.ts:115-128`, `=== "true"`); o
  erro `STOCK_WRITES_FROZEN` é classificado como `AUTO_RETRY` pela fila (teste em `stock-ledger-service.test.ts:1306`).
  Env é retrato do build: precisa estar em Production **antes** do build do merge, e sair por **Redeploy do mesmo
  commit (ou posterior)**.
- Com o código novo sobre colunas `integer` (entre o deploy e a migration), toda escrita de estoque, inclusive
  `stock: 0` na criação de produto, falha com `22P03` sem gravar — esperado, loja fechada.
- **Caixas abertos e filas: gate não pronto.** O checklist das duas lojas (`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md`)
  não foi devolvido, e a consulta de caixas abertos em produção não foi rodada (exige autorização). Consulta preparada
  (somente leitura, credencial RO ou `default_transaction_read_only=on`):

```sql
BEGIN READ ONLY;
SELECT "storeId", count(*) AS abertas, min("abertaEm") AS mais_antiga FROM sessoes_caixa WHERE status = 'ABERTA' GROUP BY 1;
SELECT usename, application_name, state, count(*), max(now() - xact_start) AS maior_xact
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3 ORDER BY 1, 2;
SELECT datacl FROM pg_database WHERE datname = current_database();
SELECT count(*), sum(stock)::text FROM estoque_produtos;
SELECT count(*), sum(quantidade)::text FROM produto_depositos;
SELECT count(*), pg_size_pretty(pg_total_relation_size('movimentacoes_estoque')) FROM movimentacoes_estoque;
ROLLBACK;
```

- `SALE_SERVER_NUMBERING_ENABLED` (Production, 2026-08-18) **não muda** na janela: o writer v1 não deduplica `clientSaleId`.

## 6. Compatibilidade com a `main` e a PR #318

- #315 contém a `main` (`34b70a1`); hoje não precisa de novo merge.
- #318 (`cc67ad7`, MERGEABLE/CLEAN): `git merge-tree` com a #315 **sem conflito**; não toca `prisma/`; lê
  `ItemVenda.quantidade` (`Int`, fora das 5 colunas) e não usa `$queryRaw` nem as tabelas de estoque. Compatível.
- **Ordem recomendada:** #315 primeiro (na janela); #318 só **depois** da reabertura, com merge da `main` nova.
  - Se a #318 entrar antes: a `main` anda, a #315 precisa de novo merge + CI + revisão R, e o build da #318 vira mais um
    escritor `Int` (coberto pelo corte, porque o retrato dele é `neondb_owner`).
  - **Proibido** qualquer merge na `main` entre a troca das envs de Production e o merge da #315: o build sairia com
    `omni_runtime_v2` e código `Int` e sobreviveria ao corte.
- Pós-merge: o branch main do preview (`br-lively-feather-b6esh64a`, `integer`) precisa receber a migration KG; sem
  isso, previews de toda branch nova (cliente `Float`) falham `22P03` em escrita de estoque. A #318 rebaseada cai aí.

## 7. Recuperação e ponto de não-retorno

| Momento | Volta permitida |
| --- | --- |
| Antes do 03 | tudo reversível: desligar a trava; envs de Production voltam ao valor antigo (sensitive, ilegível: só pela cópia do operador em `neon-production.env`) |
| Entre 03 e o COMMIT da migration | `99-desfazer-corte.sql` + `06`. Se o deploy da #315 tiver de ser revertido: revert na `main` **e** volta das envs para `neondb_owner` **antes** do build do revert; qualquer deployment `Int` que tenha nascido com `omni_runtime_v2` é removido antes de nova tentativa |
| **COMMIT de `estoque-kg-migration-apply.sql` = ponto de não-retorno** | rollback para Prisma `Int` **proibido**; `99` recusa; nenhum deploy anterior à #315 |
| Depois da trava desligada e da 1ª entrada fracionária | descer as colunas a `integer` perde gramas: só o branch de recuperação do passo J1, descartando as movimentações posteriores |

Proibições explícitas depois do COMMIT (acrescentar ao runbook): "Redeploy" pelo painel de qualquer deployment
anterior à #315 (rebuilda código `Int` com as envs atuais = `omni_runtime_v2` → **corrompe**); `git revert` da #315
na `main`; "Promote"/"Instant Rollback" para deployment antigo (falha com `permission denied`, mas derruba a operação);
re-GRANT de CONNECT ao `neondb_owner`.

Corrigir para frente: build com schema `Float` revertendo só comportamento. Corrupção (`6e-323`, `NaN`): trava,
`06` para achar o escritor, 04+05, restaurar pelo livro/branch, `db:backfill-deposito --exec` desta versão.

## 8. Checklist operacional (para autorização posterior)

**Pré-janela (dias antes; cada linha com autorização própria)**

- [ ] A1. Autorizar e rodar as leituras da §5 em produção (credencial RO ou read-only forçado); registrar tamanhos, `datacl`, sessões por `application_name`.
- [ ] A2. Gerar as credenciais (§4, passos 1–4); validar as URLs sem conexão.
- [ ] A3. Rodar `01` e `02` no cluster de produção → `KG_PAPEIS_OK`, `KG_RUNTIME_GRANTS_OK`; `06` antes e depois.
- [ ] A4. Prova de login do `omni_runtime_v2` direto e pelo pooler em `BEGIN READ ONLY` (sem escrita).
- [ ] A5. Ajustes de documento no runbook: retenção não remove deployments; delta esperado do `migrate diff` (só o índice `storeId_idempotencyKey`, 0019, pré-existente); proibições da §7; migration KG no preview main pós-merge.
- [ ] A6. Decidir sobre o `07` (revisão independente) — ou registrar que fica fora.
- [ ] A7. Confirmar que o conector Neon do ChatGPT não alcança a org de produção, ou não usá-lo na janela.
- [ ] A8. Marcar a janela; congelar merges na `main` e pushes em branches com override de preview; avisar outras sessões de IA.

**Janela (loja fechada)**

- [ ] J0. Checklist das duas lojas devolvido completo; caixas `ABERTA` = 0 (consulta da §5); Pendências = 0 em todo terminal ou anotadas.
- [ ] J1. Branch de recuperação no projeto Neon de produção (nome com data/hora); anotar id e LSN.
- [ ] J2. `STOCK_WRITES_FROZEN=true` em Production (`omni-gestao-pro`).
- [ ] J3. `DATABASE_URL`/`DIRECT_URL` de Production → `omni_runtime_v2` (via stdin/API, sem valor em argv).
- [ ] J4. Merge da #315 → build de Production. Log: `MIGRATION_SKIPPED`, `PROXY_PRISMA_ARTIFACT_VERIFIED`. Listar deployments criados depois de J3: todos do commit do merge (ou posterior); outro qualquer → remover antes de J6.
- [ ] J5. Entrada manual de teste no alias → "manutenção programada", sem gravar.
- [ ] J6. `03` → `KG_CORTE_POSSE_OK`; `04` → `KG_CORTE_CONEXAO_OK`; `05` logo em seguida → `KG_SESSOES_ANTIGAS_ZERO`; `06`.
- [ ] J7. Esperar ≥ 5 min; `06` idêntico; nenhuma transação aberta nas 3 tabelas; sondar 1 URL de deployment antigo (`permission denied` esperado).
- [ ] J8. `estoque-kg-migration-apply.sql` pelo migrator (direto) → `KG_MIGRATION_OK`. **Ponto de não-retorno.** `prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`.
- [ ] J9. (Opcional, se aprovado) `07`.
- [ ] J10. Frações = 0 nas 5 colunas; NaN/denormais = 0; `migrate diff` só com o delta 0019 conhecido; `06` mostra as 5 colunas `double precision`.
- [ ] J11. Remover `STOCK_WRITES_FROZEN`; Redeploy **do commit do merge**; filas zerando.
- [ ] J12. Smoke com conta STORE de homologação (Entrada 0,001 kg, histórico, ficha; PDV recusa venda por peso).
- [ ] J13. Reabrir a operação.

**Pós-janela**

- [ ] P1. `omni_migrator` → `NOLOGIN`.
- [ ] P2. Migration KG no preview main (`br-lively-feather-b6esh64a`).
- [ ] P3. Trocar a senha do `neondb_owner` (fecha os 56 previews antigos e o caminho humano do `ADMIN OPTION`); atualizar `.env` local e `neon-*.env`.
- [ ] P4. #318: merge da `main` nova, CI, revisão.
- [ ] P5. Limpezas autorizadas: branch de ensaio `br-wispy-mountain-accw2a7p`, `vercel-production-pull.env`, `.worktrees/p4-baseline-5e1feb9`.

## 9. Bloqueios do GO

1. Autorizações humanas pendentes: A1, A3 (papéis e grants em produção), J3 (envs de Production), janela inteira (J1–J13), pós-janela.
2. Credenciais `omni_runtime_v2`/`omni_migrator` não geradas; `01`/`02` não aplicados em produção → `ROLE_CUTOVER_READY=NO`.
3. Checklist das duas lojas não devolvido; caixas abertos não conferidos → `QUEUES_AND_CASH_GATES_READY=NO`.
4. Leituras de pré-janela em produção (tamanho do lock, `datacl`, sessões) não feitas.
5. Runbook com 4 ajustes de texto (A5) — não bloqueiam tecnicamente, mas a janela não deve rodar com o critério de `migrate diff` que vai falhar pelo drift conhecido.
6. Congelamento de merges/pushes e de outras sessões com credencial de produção não formalizado (A8).

## 10. Pendências de segurança (fora do escopo da #315, relatadas)

- `neondb_owner`: mesma senha em Production, candidate e admin; 56 previews READY públicos carregam a credencial (lado servidor). Fecha com P3.
- Deployment Protection desligada no `omni-gestao-pro`.
- `AUTH_SECRET`, `CONTADOR_*`, `ADMIN_DEFAULT_PASSWORD` e tokens WhatsApp compartilhados entre Preview e Production.
- Senha Supabase registrada como vazada, ainda sem rotação; 3 Production READY do `omni-gestao` com essa credencial.
- Branch de ensaio `br-wispy-mountain-accw2a7p` guarda cópia dos dados de produção.
- Writer v1 sem dedupe de `clientSaleId`.
- Node 20.x no `omni-gestao-pro` (deprecação da Vercel desde 2026-10-01; o build de 10-27 passou): um build que falhe na janela cai no caminho "entre 03 e o COMMIT" da §7.

## 11. Evidências a coletar na janela

Saída integral de cada script (marcadores `KG_*`), `06` antes/depois de cada passo, lista de deployments com
`created` > J3, logs de build de J4/J11, resposta da sonda J5 e da URL antiga em J7, id/LSN do branch J1,
`KG_MIGRATION_OK` com contagens e md5, `migrate diff`, consultas de frações, smoke J12, horários de cada passo.
