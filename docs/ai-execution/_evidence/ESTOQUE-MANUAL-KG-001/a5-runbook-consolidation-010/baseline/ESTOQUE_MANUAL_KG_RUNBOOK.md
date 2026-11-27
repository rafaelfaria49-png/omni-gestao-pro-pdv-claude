# Runbook — rollout da migration de estoque fracionado (KG)

**Status: NO-GO.** Nada deste runbook foi executado em produção. Cada passo (A, J, P) exige autorização
humana específica. `MIGRATION_AUTHORITY_ENABLED=false` permanece: a Vercel não aplica migrations.
Esta é a sequência canônica; `ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md` explica o mecanismo da estratégia B e
`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-readiness-004/` traz a auditoria de prontidão.

| Item | Valor |
| --- | --- |
| Migration | `prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql` |
| sha256 (LF, 1041 bytes) | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` |
| Efeito | `estoque_produtos.stock`, `produto_depositos.quantidade`, `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois`: `integer` → `double precision`. Sem UPDATE/backfill. |
| Lock | `ALTER COLUMN TYPE` reescreve as 3 tabelas sob `ACCESS EXCLUSIVE` |
| Trava de escrita | `STOCK_WRITES_FROZEN=true` (env): o boundary lança antes de travar a linha; venda responde 5xx e fica na fila do PDV com reenvio automático. **Só existe no código desta PR** — não protege deployment, preview ou script antigo |
| Isolamento dos escritores antigos | **Estratégia B**: Production passa a usar o papel `omni_runtime_v2`; na janela o papel antigo (`neondb_owner`) perde `CONNECT` em `omnigestao_prod` e tem as sessões encerradas. Scripts em `rollout/` |
| Ponto de não-retorno | **COMMIT de `estoque-kg-migration-apply.sql` (J8)** — ver §5 |

## 1. Por que a ordem importa (provado em PG 17 descartável)

| Cliente Prisma × colunas | Leitura | Escrita |
| --- | --- | --- |
| **novo (`Float`) × `integer`** (código antes da migration) | correta | **falha fechada**: erro `22P03 incorrect binary data format`, nada gravado |
| **antigo (`Int`) × `double precision`** (migration antes do código, deployment antigo, preview de outra branch, script da `main`) | inteiros corretos; fração **truncada** (3,96 → 3) | **corrupção silenciosa**: 13 vira `6e-323`, −1 vira `NaN` (`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/old-client-WRITE-after-migration.txt`); o backfill da `main` zerou todos os depósitos assim (`backfill-main-vs-branch.txt`) |

Logo: **depois da migration, nenhum código anterior a esta PR pode alcançar o banco**. Controle de
acesso (Deployment Protection) não basta: usuário autenticado em URL antiga, aba aberta com
fila de vendas, preview de outra branch ou script local continuariam gravando.

Hoje Production, Preview/candidate e o admin de migração usam o **mesmo papel `neondb_owner`, com a
mesma senha** (só o database muda), e esse papel herda `pg_write_all_data` via `neon_superuser`. Por isso
nem excluir deployments nem trocar a senha nem tirar posse/GRANT de tabela resolvem; o que corta é
`CONNECT` no database + encerrar as sessões, conferido no catálogo (provado em PG 17 com a mesma
topologia: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/`).

## 2. Escritores legados e o que os fecha

Inventário de 2026-10-28 (`rollout-readiness-004` §2; refazer no J0 pelo mesmo método, só GET na API da Vercel):

| Origem | Quantidade | Credencial no retrato | Alcança `omnigestao_prod` |
| --- | ---: | --- | --- |
| Production do `omni-gestao-pro`, READY (2026-10-23 → 2026-10-27, todos `Int`) | **15** | `neondb_owner@omnigestao_prod` | **sim, pelo código** |
| Previews do `omni-gestao-pro` criados antes da P3 (2026-10-27 22:05Z) | **56** | `neondb_owner@omnigestao_prod_candidate`, mesmo endpoint e mesma senha | o código vai ao candidate; **a credencial abre produção** |
| Previews criados depois da P3 | 3 | `preview_runtime@omnigestao_preview` (outro projeto Neon) | não |
| `neon-production.env` (`NEON_PROD_*`), `neon-migration.env`, `.env` da raiz, `NEON_PREVIEW_*` | — | `neondb_owner` em `omnigestao_prod`, `neondb`, candidate | sim, pela credencial |
| `omni-gestao` (3 Production Supabase, 57 previews sem banco) | — | fora do Neon | não |

**A retenção da Vercel não remove esses deployments e não entra em nenhum gate.** A política declarada é
`expirationDays=30`, mas o deployment READY mais antigo do `omni-gestao-pro` é de 2026-08-16 (73 dias em
2026-10-28); a leitura contrária em `rollout-remediation/50-vercel-inventario.md` foi refutada pela auditoria 004.
Os 15 de Production e os 56 previews legados **só deixam de alcançar `omnigestao_prod` pelo corte efetivo de
conexão** — `04` (REVOKE CONNECT de PUBLIC e do papel antigo) seguido **imediatamente** do `05` (encerrar
sessões), conferido pelo `06` e pela sonda de URL antiga no J7. Exclusão de deployment, Deployment Protection
ou espera não substituem o corte. O acesso dos 56 previews ao candidate só termina com a troca de senha (P3).

Caminhos humanos que o corte **não** distingue de código estão no §3 (congelamento).

## 3. Congelamento

Declarado no A8, conferido no J0 e mantido até o fim indicado. Quebra de congelamento durante a janela =
parar no passo em que está e seguir a recuperação da fase (§7).

| O que fica congelado | De | Até | Por quê |
| --- | --- | --- | --- |
| Merge ou push na `main` (qualquer PR, inclusive #318), exceto o merge da #315 no J4, a correção para frente do J4 e o revert do F1 | J0 | J13 | build entre J3 e J4 sai com código `Int` e credencial `omni_runtime_v2`, que **sobrevive ao corte** e corrompe depois do J8 |
| Push em qualquer outra branch (cria preview; 4 branches têm override de banco com destino ilegível) | J0 | P2 PASS | preview novo cairia no banco Preview ainda `integer` com cliente `Float` (§6.2) ou num destino desconhecido |
| `vercel --prod`, `vercel deploy`/`redeploy` de checkout local, "Redeploy", "Promote", "Instant Rollback" no painel | J0 | J13 (depois do J8, proibição permanente para código anterior à #315 — §5) | rebuild usa as envs atuais: código `Int` + `omni_runtime_v2` |
| Qualquer env da Vercel além de J2, J3 e J11 (inclusive `SALE_SERVER_NUMBERING_ENABLED`, `MIGRATION_AUTHORITY_ENABLED`, overrides de branch) | J0 | J13 | troca de writer duplica venda (`30-fila-pdv.txt`); migration pela Vercel fora do controle |
| Outras sessões de IA (Claude Code/Desktop e worktrees, Codex, Cursor, Antigravity, ChatGPT) e tarefas agendadas | A8 (aviso) / J0 (encerradas) | J13 | qualquer uma com `neon-production.env`, `neon-migration.env`, `.env` da raiz, token da Vercel ou conector age como o operador e o corte não a distingue |
| Conectores com alcance a Neon, Vercel ou GitHub (conector Neon do ChatGPT usado na P1/P2.0; MCPs de qualquer cliente) | J0 | J13 | mesmo motivo; o do ChatGPT pode alcançar a org de produção (`org-spring-butterfly-51302013`) — A7 |
| Scripts locais contra produção: `npm run db:*`, `prisma migrate`/`db push`/`studio`, `scripts/backfill-deposito*.mjs`, `merge-produtos-duplicados.mjs`, `caixa-test.mjs` | J0 | J13 (depois, só desta versão e com credencial nova) | escrevem nas 5 colunas ou no schema; antes do corte com o papel antigo, depois com o código errado |
| Console Neon do projeto de produção (SQL Editor, papéis, reset de senha, dono de database, restore) | J0 | J13 | caminho humano que desfaz o corte (`ADMIN OPTION` do papel antigo); únicas exceções: J1 e a recuperação do §7 |

Durante a janela, o único caminho de escrita autorizado no banco é o operador rodando os scripts deste
runbook. Evidência do congelamento (A8/J0): lista das sessões de IA encerradas, estado dos conectores, horário
do aviso, `vercel ls`/API sem deployment novo desde o J0.

## 4. Sequência com gates

Cada passo só começa com o gate anterior cumprido e registrado (saída integral do script, marcador `KG_*`,
horário). "Se falhar" aponta a fase de recuperação do §7.

### Já cumprido (não repetir)

PR #315 revisada (R4 APPROVE `cdb1d19`, R5 APPROVE da resolução do merge), CI 11/11 em `2731097`; ensaio completo
num branch Neon de produção (002: 01→05, suspend/start e restart do compute, pooler, `99`, migration, `07`);
Preview fora do cluster de produção (P1–P3 do isolamento) e prova de destino do runtime (P5).

### Pré-janela (dias antes)

- **A1. Leituras de produção, só leitura.** Sessão forçada read-only (`BEGIN READ ONLY` /
  `default_transaction_read_only=on`). Confirma o banco canônico (fingerprint do Neon de produção, não o
  candidate), dimensiona o lock, acha dependências e grava a **linha de base do drift** (§6.1):
  ```sql
  SELECT current_setting('neon.project_id'), current_setting('neon.endpoint_id'), current_database();
  SELECT count(*), sum(stock)::text FROM estoque_produtos;
  SELECT count(*), sum(quantidade)::text FROM produto_depositos;
  SELECT count(*), sum(quantidade)::text, sum("estoqueDepois")::text FROM movimentacoes_estoque;
  SELECT DISTINCT c.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class c ON c.oid = r.ev_class
   WHERE d.refobjid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);
  SELECT pg_size_pretty(pg_total_relation_size('movimentacoes_estoque'));
  SELECT datacl FROM pg_database WHERE datname = current_database();
  SELECT "storeId", count(*), min("abertaEm") FROM sessoes_caixa WHERE status = 'ABERTA' GROUP BY 1;
  SELECT usename, application_name, state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3;
  ```
  mais `prisma migrate status` e `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma`
  (schema da #315). **Gate:** fingerprint = projeto de produção; nenhuma view/regra dependente; diff = as 5
  alterações de tipo nas 3 tabelas **+ só** a renomeação do índice da 0019 (§6.1). Qualquer outra linha = drift
  novo → NO-GO até explicar.
- **A2. Credenciais, sem conexão.** Gerar offline as senhas de `omni_migrator` e `omni_runtime_v2` em arquivo
  fora do repositório; montar `DATABASE_URL` (pooler, `pgbouncer=true`) e `DIRECT_URL` (direto) de Production
  com **`omni_runtime_v2`**, e `MIGRATOR_DIRECT_URL` só local. **Gate:** validação das URLs sem conectar
  (endpoint de produção, usuário, database, `sslmode=require`); nada gravado na Vercel (um build `Int` com a
  credencial nova sobreviveria ao corte — revisão R1, P1).
- **A3. Papéis e grants em produção.** `rollout/01-papeis.sql` (papel antigo, `neondb`) e
  `rollout/02-grants-runtime.sql` (papel antigo, `omnigestao_prod`); `06` antes e depois. **Gate:** `KG_PAPEIS_OK`,
  `KG_RUNTIME_GRANTS_OK`, nenhum papel novo herdando `pg_write_all_data`/`neon_superuser`. Papéis só por SQL,
  nunca pelo Console. Sem efeito nos escritores atuais.
- **A4. Login do runtime**, direto e pelo pooler, em `BEGIN READ ONLY` (sem escrita). **Gate:** login aceito nos
  dois caminhos; `has_table_privilege` de DML em todas as tabelas.
- **A5. Documentação endurecida revisada** (este runbook, GOAL 005) e a decisão de que a janela usa esta versão.
- **A6. Decidir o `07`** (CHECK "finito em milésimos") com revisão independente, ou registrar que fica fora.
  É a única barreira **de banco** contra o caminho humano do §5 (build `Int` com credencial nova).
- **A7. Conectores.** Confirmar que o conector Neon do ChatGPT não alcança a org de produção, ou desligá-lo para a
  janela. Mesmo para qualquer MCP com Neon/Vercel/GitHub.
- **A8. Marcar a janela e declarar o congelamento do §3** (aviso às pessoas e às sessões de IA). **Gate do A:**
  A1–A4 com saída registrada, A6 decidido, A7 confirmado.

### Janela (loja fechada)

- **J0. Abertura.** Checklist das duas lojas devolvido completo (`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md`); caixas
  `ABERTA` = 0 (consulta do A1, read-only); Pendências = 0 em todo terminal ou registradas (pedido, itens,
  pagamentos, `clientSaleId`) para lançamento posterior com a mesma identidade; congelamento do §3 em vigor;
  inventário de deployments refeito (§2). **Gate:** todos os itens marcados; nenhum terminal em URL de
  deployment com fila; gate falho = a janela não começa. A fila vive no navegador, por origem: aba numa URL de deployment só reenvia para ela, e
  depois do corte a venda fica presa lá.
- **J1. Ponto de recuperação:** branch no projeto Neon de produção, nome com data/hora. **Gate:** id do branch e
  LSN anotados.
- **J2. Trava:** `STOCK_WRITES_FROZEN=true` em Production do `omni-gestao-pro` (env é retrato do build: precisa
  existir **antes** do build do J4). **Gate:** env listada. Se falhar: F0.
- **J3. Envs de Production** `DATABASE_URL`/`DIRECT_URL` → `omni_runtime_v2` (via stdin/API, nunca valor em argv).
  **Gate:** envs atualizadas; nenhum deployment criado desde o J0. A partir daqui vale F1.
- **J4. Merge da #315 → build de Production**, na mesma sequência do J3. **Gate:** build READY; log com
  `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED`; **todo** deployment criado depois do J3 é do commit do
  merge (ou posterior) — qualquer outro é removido antes do J6. Build falhou: não seguir; corrigir para frente
  num commit novo sobre o merge (única exceção ao congelamento da `main`, com o mesmo gate do J4) ou F1.
- **J5. Trava no ar:** entrada manual de teste no alias responde "manutenção programada" sem gravar. Vendas de
  abas abertas no domínio canônico recebem 5xx e ficam na fila local. **Gate:** resposta registrada.
- **J6. Corte do papel antigo**, lendo a saída de cada script — exit code não basta (REVOKE de quem não é dono sai
  com WARNING e exit 0):
  - `rollout/03-corte-posse.sql` (papel antigo, `-1`) → `KG_CORTE_POSSE_OK`. Espera vendas em voo, que ainda
    gravam no regime `integer`; `lock_timeout` estourado não altera nada, repetir;
  - `rollout/04-corte-conexao.sql` (`omni_migrator`, `-1`) → `KG_CORTE_CONEXAO_OK`;
  - `rollout/05-encerrar-sessoes.sql` (papel antigo, database `neondb`) → `KG_SESSOES_ANTIGAS_ZERO`, **logo depois
    do 04**: entre os dois, um cold start pelo pooler ainda entra, porque reaproveita uma conexão de servidor já
    aberta (ensaio Neon 002);
  - `rollout/06-verificacao.sql` → papel antigo `connect=false`, nenhuma sessão dele, CONNECT só para
    `omni_runtime_v2` e `omni_migrator`.

  **Gate:** os três marcadores e o `06` como descrito. A partir daqui vale F2 (`99` reabre).
- **J7. Conferir de novo após ≥ 5 min** (maior `maxDuration` explícito do app = 180 s): `06` idêntico; nenhuma
  transação aberta tocando as 3 tabelas; sonda numa URL de deployment antigo responde `permission denied`;
  **lista de deployments refeita** — ainda só o commit do merge (ou posterior) desde o J3. O tempo não substitui a
  conferência:
  ```sql
  SELECT pid, usename, application_name, state, now() - xact_start AS idade, left(query, 80)
    FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL;
  ```
  **Gate:** as quatro conferências. Deployment estranho: removê-lo, repetir o J7.
- **J8. Migration verificada** com a credencial do `omni_migrator`, pela conexão direta (5432):
  `psql -v ON_ERROR_STOP=1 -1 -f docs/padaria/pesagem/estoque-kg-migration-apply.sql`.
  O script trava as 3 tabelas, tira um **retrato por linha** (md5 de `id:valores`), roda o DDL exato da migration
  e compara o retrato depois; qualquer diferença levanta `KG_MIGRATION_RETRATO_DIVERGENTE` e desfaz tudo. Como o
  retrato e o DDL acontecem sob o mesmo lock, criação de produto, exclusão ou reenvio não se intercalam (provado em
  PG 17: `migration-apply-verificada.txt`, `migration-apply-prova-negativa.txt`; e no ensaio 002).
  Depois: `prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`, com
  `DATABASE_URL`/`DIRECT_URL` do migrator **exportadas no shell** (o `.env` da raiz aponta para o candidate).
  **Gate:** `KG_MIGRATION_OK` com contagens e md5; `_prisma_migrations.checksum` = sha256 acima.
  **O COMMIT deste script é o ponto de não-retorno (§5).** Falha por `lock_timeout` ou retrato divergente não
  altera nada: segue F2, repetir J7–J8.
- **J9. (Opcional, só se aprovado no A6)** `rollout/07-guard-check-opcional.sql`.
- **J10. Conferir com a trava ainda ligada:**
  - frações = 0 nas 5 colunas (`count(*) WHERE <col> <> trunc(<col>)`);
  - NaN/denormais = 0 nas 5 colunas (`count(*) WHERE <col> = 'NaN' OR (<col> <> 0 AND abs(<col>) < 2.2250738585072014e-308)`);
  - `06` mostra as 5 colunas `double precision`;
  - `prisma migrate status` = "Database schema is up to date!";
  - `prisma migrate diff` = **só** o drift conhecido da 0019 (§6.1).

  **Gate:** os cinco itens. Qualquer falha: trava segue ligada, **não reabrir**, F3.
- **J11. Trava desligada:** remover `STOCK_WRITES_FROZEN` e fazer Redeploy **do deployment do commit do merge**
  (conferir o SHA antes; env só vale em build novo). As filas locais do PDV reenviam sozinhas. **Gate:**
  deployment novo READY do mesmo commit; pendências zerando.
- **J12. Smoke** com conta STORE da padaria de homologação (produto KG sintético, nunca o real "PAO FRANCES"):
  Entrada 0,001 kg, histórico, ficha reaberta; PDV recusa venda por peso. **Gate:** os quatro itens.
- **J13. Reabrir a operação** e encerrar o congelamento de produção do §3 (o de push em branches segue até P2).

### Pós-janela

- **P1.** `omni_migrator` → `NOLOGIN` fora de janelas.
- **P2.** Migration KG no branch `main` do Neon Preview (procedimento no §6.2).
- **P3.** Trocar a senha do `neondb_owner` quando Preview e máquinas locais não dependerem mais dele (fecha os 56
  previews legados no candidate e o caminho humano do `ADMIN OPTION`); atualizar `.env` local e `neon-*.env`.
- **P4.** #318 (e qualquer PR aberta): merge da `main` nova, CI, revisão — só depois do J13 e do P2.
- **P5.** Limpezas, cada uma com autorização: branch de ensaio `br-wispy-mountain-accw2a7p` (cópia dos dados de
  produção), branch de recuperação do J1 (depois do prazo combinado), `pr315-kg` e o override de Preview da branch
  da #315, `vercel-production-pull.env`, `.worktrees/p4-baseline-5e1feb9`. Decisão à parte: remover os deployments
  de Production anteriores à #315, que deixam de servir (sem banco) e são o alvo do "Redeploy" proibido no §5.

## 5. Ponto de não-retorno

O **COMMIT de `estoque-kg-migration-apply.sql` no J8** muda as 5 colunas para `double precision`. Desse instante
em diante, qualquer cliente Prisma `Int` que alcance o banco corrompe em silêncio (§1), e nenhum mecanismo deste
runbook devolve o estado anterior sem perda. Ficam **proibidos**, sem prazo, até um plano novo revisado:

1. **Redeploy de código Prisma `Int`**: "Redeploy", "Promote" ou "Instant Rollback" para qualquer deployment
   anterior ao merge da #315; `vercel --prod`/`vercel deploy` de checkout anterior; build de qualquer commit sem a
   #315. "Redeploy" e "Promote" **reconstroem com as envs atuais** (`omni_runtime_v2`), então o build `Int`
   ganha CONNECT e corrompe; "Instant Rollback" usa o retrato antigo e só derruba a operação (`permission
   denied`) — também proibido. O `07`, se aplicado, transforma essa corrupção em erro, mas não a autoriza.
2. **Revert da PR #315**: `git revert` do merge na `main`, ou revert parcial que devolva `Int` às 5 colunas no
   `prisma/schema.prisma` ou remova a migration `20261025120000`. Problema no código novo se corrige para frente,
   mantendo schema `Float` e a migration (§7, F3).
3. **Restauração de CONNECT ao papel antigo**: `99-desfazer-corte.sql` (recusa por construção depois da migration),
   `GRANT CONNECT` manual a `neondb_owner` ou PUBLIC, troca de dono do database ou de papéis pelo Console Neon.
   Privilégio faltando no app novo se resolve com GRANT pelo `omni_migrator` ao `omni_runtime_v2`, nunca voltando
   Production para `neondb_owner`.
4. Rodar contra produção script ou cliente gerado de checkout anterior à #315 (backfills, `db:*`).

Voltar as colunas a `integer` **não é rollback deste runbook**: exige que nenhuma das 5 colunas tenha fração, um
plano novo (migration reversa revisada, nova janela, trava, novo corte) e o app em `Int` na mesma janela. Depois da
primeira entrada fracionária, é proibido (perde gramas); a única volta é o branch do J1, descartando as
movimentações posteriores.

## 6. Drift conhecido e banco Preview

### 6.1 Índice da migration 0019 — drift conhecido, não corrigir na janela

A `0019_movimentacao_estoque_idempotency` cria a constraint com o nome `storeId_idempotencyKey`; o
`schema.prisma` declara `@@unique([storeId, idempotencyKey], name: "storeId_idempotencyKey")` — `name` é o nome
do campo no client, não `map` —, então o Prisma espera o nome padrão. Por isso o `migrate diff` de produção
contra o schema acusa, desde antes da #315 e igual na `main`:

```
[*] Changed the `movimentacoes_estoque` table
  [*] Renamed index `storeId_idempotencyKey` to `movimentacoes_estoque_storeId_idempotencyKey_key`
```

Observado no ensaio 002 (clone de produção de 2026-10-26, `neon-rehearsal-002/06-fase-d-99-recorte-migration.txt`),
a confirmar em produção no A1. Regras:

- **A1:** diff esperado = as 5 alterações de tipo + essa renomeação. **J10:** só essa renomeação.
- Qualquer outra linha é **drift novo**: parar com a trava ligada, registrar a saída e investigar; não reabrir.
- **Não corrigir automaticamente**: nada de `prisma db push`, `migrate dev`, `migrate diff --script` aplicado nem
  `ALTER INDEX … RENAME` na janela. A renomeação é assunto de uma migration própria, revisada, fora da #315.
- O banco Preview foi criado a partir do schema (`migrate diff --from-empty`), então lá o diff esperado é **vazio**.

### 6.2 Branch `main` do Neon Preview (P2)

Projeto `nameless-frost-19035275`, branch `main` = `br-lively-feather-b6esh64a`, database `omnigestao_preview`:
hoje `integer`, servindo o `DATABASE_URL`/`DIRECT_URL` genérico de Preview. O `pr315-kg`
(`br-wandering-band-b6ov7vmt`) já é `double` e só atende a branch da #315 por override. Depois do merge, todo
preview novo nasce com cliente `Float`; contra o `main` ainda `integer`, escritas de estoque falham com `22P03`.
O inverso também vale: depois do P2, um preview com cliente `Int` corrompe os dados sintéticos do Preview.

Procedimento (autorização própria; nunca antes do merge da #315):

1. **Pré-condição:** J13 cumprido; congelamento de push em branches (§3) ainda em vigor, para não nascer preview
   `Float` sobre o `main` `integer` entre o merge e o P2.
2. **Inventário:** deployments de Preview READY criados depois da P3 que usam o banco genérico e cujo commit não
   contém a #315 (clientes `Int`). Decidir e registrar: removê-los, ou aceitar o risco sobre dados sintéticos (sem
   alcance a produção) e rodar a conferência de NaN/denormais do J10 depois.
3. **Ponto de recuperação:** branch do `main` do Preview com data/hora.
4. **Migration:** `prisma migrate deploy` pelo `omnigestao_preview_owner` (direto), com o prisma da `main` já com a
   #315, conferindo antes identidade no servidor (`neon.project_id`/`branch_id`/`endpoint_id`), checksum do arquivo
   = sha256 do topo e pendente única `20261025120000_estoque_quantidade_fracionada`. O roteiro da P2.3
   (`preview-isolation-003/harness/p2-preparo-preview.cjs`, fase `kg`) **recusa o `main` por construção**: usar uma
   fase nova revisada com as mesmas travas, ou os mesmos passos à mão.
5. **Gate:** 5 colunas `double precision`; `migrate status` em dia; `migrate diff` vazio; contagem e md5 dos saldos
   iguais antes e depois.
6. **Encerrar o isolamento da #315:** remover o override de Preview da branch `claude/estoque-manual-kg-001` →
   `pr315-kg` e, com autorização, excluir o `pr315-kg` (P5).
7. **Prova:** um preview novo de branch cortada da `main` grava 3,96 kg no banco genérico. Só então liberar push em
   branches.

## 7. Recuperação por fase

| Fase | Estado | Recuperação |
| --- | --- | --- |
| **F0** — até J2 | só a env da trava foi criada; o deployment no ar nem a lê | remover `STOCK_WRITES_FROZEN`; reabrir |
| **F1** — J3 a J5 | envs de Production em `omni_runtime_v2`, #315 em Production, colunas `integer`, sem corte | abortar nesta ordem: (1) envs de Production de volta a `neondb_owner` (cópia do operador; valor atual é sensitive); (2) `git revert` do merge da #315 na `main` → build `Int` com o papel antigo (permitido **só antes do J8**); (3) listar deployments criados desde o J3: qualquer build `Int` com `omni_runtime_v2` é removido; (4) remover a trava; `06`; reabrir. Reabrir com a #315 sem a migration não serve: escrita de estoque falha `22P03` e as vendas ficam na fila |
| **F2** — J6 até antes do COMMIT do J8 | corte feito, colunas `integer` | `rollout/99-desfazer-corte.sql` (recusa se a migration já tiver sido aplicada) + `06`; depois F1. Migration que falhou (`lock_timeout`, retrato divergente) não alterou nada: pode-se repetir J7–J8 em vez de abortar. Divergência de retrato = escritor vivo: `06` para achá-lo antes de repetir |
| **F3** — depois do COMMIT do J8 | ponto de não-retorno (§5) | só para frente, trava ligada até resolver. Código novo com problema: build com schema `Float` revertendo só comportamento. Privilégio faltando: GRANT pelo `omni_migrator`. Drift novo ou frações/NaN no J10: investigar sem reabrir. Corrupção (`6e-323`, `NaN`, denormais): achar o escritor pelo `06` (CONNECT, sessões, `application_name`), cortá-lo (04+05), restaurar as linhas pelo livro encadeado (`movimentacoes_estoque`) ou pelo branch do J1, rodar `db:backfill-deposito --exec` **desta** versão (confere a invariante por produto em milésimos), desligar a trava |
| **F4** — depois da 1ª entrada fracionária | dados novos só existem em `double` | igual a F3; descer a `integer` é proibido; só o branch do J1, descartando as movimentações posteriores, com autorização própria e o congelamento do §3 refeito |

Evidência a coletar em todas as fases: saída integral de cada script (marcadores `KG_*`), `06` antes e depois de
cada passo, lista de deployments com `created` posterior ao J3, logs de build do J4/J11, respostas das sondas do
J5/J7, id/LSN do branch do J1, `KG_MIGRATION_OK` com contagens e md5, `migrate status`/`migrate diff`, consultas do
J10, smoke do J12, horário de cada passo.

## Fora deste rollout

Venda por peso (continua bloqueada), Ajuste/contagem de inventário em KG e balança física
seguem fechados. Ver `ESTOQUE_MANUAL_KG.md`. Renomeação do índice da 0019 (§6.1) e dedupe de `clientSaleId` no
writer v1 ficam para entregas próprias.
