# Procedimento — migration do SAAS-001A em Production

Migration: `20261124120000_saas_fundacao_comercial` · PR #398 · GOAL de preparo
`OMNI-SAAS-001A-MERGE-MIGRATION-READINESS-002` (2026-11-24).

**Nada aqui foi executado em Production.** Cada passo de escrita exige autorização textual do
proprietário. Este documento foi ensaiado de ponta a ponta em PostgreSQL 17 descartável (§10).

## 1. O que a migration faz

| Objeto | Efeito | Trava (PostgreSQL) | Duração esperada |
|---|---|---|---|
| `ALTER TABLE stores ADD COLUMN "organizationId" TEXT` | coluna anulável, sem default — só metadado | `ACCESS EXCLUSIVE` em `stores` | instantânea |
| `CREATE INDEX stores_organizationId_idx` | índice sobre poucas linhas | `SHARE` em `stores` (bloqueia escrita) | ms |
| FK `stores_organizationId_fkey` | valida linhas existentes — todas NULL | `SHARE ROW EXCLUSIVE` em `stores` e `organizations` | ms |
| 7 `CREATE TABLE` + índices + 16 CHECKs + 4 gatilhos + 1 função | objetos novos, vazios | só nos objetos novos | ms |

- **Nenhuma** linha existente é lida para reescrita, alterada ou apagada. Sem `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`.
- Tudo em **uma transação**: as travas em `stores` ficam até o `COMMIT`. `stores` é lida em toda resolução do login (callback `jwt`). No ensaio, a aplicação inteira levou < 1 s.
- **Risco operacional único:** fila de travas. Se uma transação longa estiver lendo `stores`, o `ALTER` espera por ela e, enquanto espera, **bloqueia os logins que chegarem depois**. Mitigação: `lock_timeout = 3s`, ou seja, desiste e não aplica nada; repete-se depois. Rodar em horário de pouco movimento (madrugada BRT).

## 2. Gates antes de começar

1. CI integralmente verde no SHA final da PR #398.
2. Autorização textual do proprietário para (a) aplicar esta migration e (b) fazer o merge, na mesma janela.
3. Confirmar no painel da Vercel (projeto `omni-gestao-pro`, ambiente Production) o estado de `MIGRATION_AUTHORITY_ENABLED`, pelo log do último deploy: `MIGRATION_SKIPPED` = desligado.
   - Se estiver **ligado** (`MIGRATION_RUN`), o merge executa `prisma migrate deploy` e aplica **todas** as pendentes. Não fazer o merge sem antes conferir a lista do §4.
4. Decidir sobre `CRON_SECRET` em Production. Sem ele, o cron diário responde 503, o que é inofensivo; com ele (≥ 16 caracteres), processa a outbox em modo registro, que hoje está vazia.
5. Nenhuma flag `SAAS_*` deve ser definida em Production.

## 3. Identificar o banco certo sem expor credencial

- Usar a conexão **direta** de Production do Neon (não o pooler), com credencial só em variáveis libpq do processo (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE=require`), nunca na linha de comando nem em arquivo versionado. `PGCLIENTENCODING=UTF8`, porque a migration tem acentos em comentários e numa mensagem.
- Trabalhar num checkout limpo do SHA final, numa worktree própria e sem `.env`.
- Primeira consulta, em sessão somente leitura:
  ```bash
  PGOPTIONS="-c default_transaction_read_only=on" psql -X -v ON_ERROR_STOP=1 -f scripts/saas/production-migration-checks.sql | tee pre.txt
  ```
  Conferir em `== 0`: `banco` = nome do banco de Production, `somente_leitura = on`. Qualquer outro nome ⇒ **parar**.

## 4. Verificar migrations pendentes

```bash
DATABASE_URL=<direta> DIRECT_URL=<direta> npx prisma migrate status
```

- **Esperado:** apenas `20261124120000_saas_fundacao_comercial` pendente.
- **Se aparecerem outras** (ex.: `20261114120000_compat_catalogo_marcas_lancamento`, `20261115120000_vestuario_p02_grades_catalogo` ou futuras): **não usar `prisma migrate deploy`**, porque ele aplicaria todas. Seguir o §6, que aplica só esta. As demais ficam pendentes e dependem das autorizações próprias. O ensaio reproduziu exatamente esse cenário (§9).
- Em `pre.txt`, esperado: `falhas_ou_rollback = 0`, `saas_registrada = 0`, as 7 tabelas `AUSENTE`, `coluna_stores_organizationId = 0`, `funcao_somente_insercao = 0`. Qualquer diferença ⇒ **parar**.
- Guardar os hashes de `== 3` (`stores`, `admin_users`, `admin_user_stores`) para comparar depois.

## 5. Backup e recuperação (Neon)

1. Criar um **branch Neon** de Production imediatamente antes (ponto de restauração nomeado, ex.: `pre-saas-001a-AAAAMMDD-HHMM`) e anotar o id. Conferir que o branch abre e que `SELECT count(*) FROM stores` bate com `pre.txt`.
2. A restauração do Neon é **último recurso**: voltar ao branch descarta tudo o que foi gravado depois, inclusive vendas e caixa. O caminho normal de reversão é o rollback por DDL (§9), que não toca nenhum dado de cliente.

## 6. Aplicação (somente esta migration)

```bash
# 1) checagem de concorrência no instante — ver "== 4" de pre.txt (refazer agora):
PGOPTIONS="-c default_transaction_read_only=on" psql -X -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()"
#    > 0 ⇒ esperar ou escolher outro horário.

# 2) aplicar em transação única, desistindo se a trava não vier em 3 s:
PGOPTIONS="-c lock_timeout=3s -c statement_timeout=60s" \
  psql -X -1 -v ON_ERROR_STOP=1 -f prisma/migrations/20261124120000_saas_fundacao_comercial/migration.sql

# 3) registrar SÓ esta migration no histórico do Prisma (checksum do próprio arquivo):
DATABASE_URL=<direta> DIRECT_URL=<direta> npx prisma migrate resolve --applied 20261124120000_saas_fundacao_comercial
```

- Erro `cancelando comando por causa do tempo de espera (timeout) do bloqueio` / `lock timeout`: **nada foi aplicado**, porque a transação inteira desfaz. Repetir o passo 1 e tentar de novo mais tarde. Não aumentar o `lock_timeout` sem avaliar.
- Qualquer outro erro: a transação desfaz. **Parar** e analisar antes de repetir.

## 7. Validação depois

```bash
PGOPTIONS="-c default_transaction_read_only=on" psql -X -v ON_ERROR_STOP=1 -f scripts/saas/production-migration-checks.sql | tee post.txt
DATABASE_URL=<direta> DIRECT_URL=<direta> npx prisma migrate status        # SaaS não pode mais aparecer
DATABASE_URL=<direta> DIRECT_URL=<direta> npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Esperado:
- `saas_registrada = 1`, as 7 tabelas presentes, `coluna_stores_organizationId = 1`, `funcao_somente_insercao = 1`;
- `lojas_com_organizacao = 0`; as 7 tabelas com 0 linhas; `checks = 16`; `gatilhos = 4`;
- os hashes de `stores`, `admin_users` e `admin_user_stores` **idênticos** aos de `pre.txt`, o que prova que os registros existentes foram preservados;
- `migrate diff`: sem comandos, ou só comandos de migrations **de outras frentes** ainda pendentes (conferir um a um).

## 8. Ordem e smoke test

1. **Migration** (§6 e §7) →
2. **Merge** da PR #398 →
3. **Deploy** de Production do `omni-gestao-pro`: no log, `MIGRATION_SKIPPED` (ou `MIGRATION_RUN` sem nada pendente do SaaS) e `PROXY_PRISMA_ARTIFACT_VERIFIED`; o alias deve apontar para o deploy novo (comparar o horário com o do merge) →
4. **Smoke test**, sem escrita:
   - login de um usuário existente (RAFACELL) abre o painel e a loja normalmente;
   - `/dashboard` carrega PDV, Caixa e Estoque como antes;
   - `GET /api/cron/saas` sem cabeçalho: **503** (sem `CRON_SECRET`) ou **401** (com ele);
   - logs da Vercel na primeira hora: zero `saas_entitlement_shadow_failed`, zero `saas_entitlement_shadow` (nenhuma loja tem organização) e zero 500 em `/api/stores*`;
   - Vercel → Cron Jobs lista `/api/cron/saas` (diário, 09:00 UTC).

**A ordem é obrigatória.** Código publicado sem a coluna faz responderem 500 as rotas que leem a loja inteira (`/api/stores`, `/api/stores/[id]`, `/api/settings/perfil-loja`). O login sobrevive.

## 9. Reversão segura

| Situação | Ação |
|---|---|
| Migration aplicada, merge **não** feito | Pode ficar como está: nenhum código antigo lê os objetos novos. Reverter só se o proprietário quiser (passo de schema abaixo). |
| Merge feito, problema no código | Reverter o merge e publicar. O schema pode ficar, porque as tabelas vazias não têm efeito. |
| Reverter também o schema | **Depois** de o código revertido estar no ar: `PGOPTIONS="-c lock_timeout=3s" psql -X -1 -v ON_ERROR_STOP=1 -f scripts/saas/rollback-001a.sql`. O script **recusa** se houver qualquer organização, assinatura, loja vinculada, notificação ou auditoria. Remove os objetos e a linha de `_prisma_migrations` na mesma transação. |
| Dado comercial já existe | Exportar antes e decidir à parte (o rollback recusa sozinho). |
| Catástrofe (não esperada) | Branch Neon do §5. Perde tudo o que foi gravado depois; exige decisão explícita do proprietário. |

`prisma migrate resolve --rolled-back` **não** serve aqui: só se aplica a migration com falha (erro P3012). Por isso o script de rollback remove o registro diretamente.

## 10. Ensaio (PG 17 descartável, loopback, 2026-11-24)

Cenário: schema da `origin/main` + `_prisma_migrations` com o histórico da main **menos duas** migrations, para simular "outras pendentes", e lojas e usuários legados.

| Passo | Resultado |
|---|---|
| `migrate status` | listou 3 pendentes (compat, vestuário e SaaS), o que prova que `migrate deploy` aplicaria as três |
| checagens PRÉ (sessão read-only) | 7 tabelas `AUSENTE`; hashes do legado gravados |
| aplicação com transação concorrente lendo `stores` por 12 s | **abortou em 3 s** (`lock timeout`), exit 3; `organizations` AUSENTE e coluna ausente, ou seja, nada aplicado |
| aplicação limpa (`psql -1`) | exit 0 em ~0,9 s (incluindo o arranque do psql) |
| `migrate resolve --applied` | registrou só o SaaS; compat e vestuário continuaram pendentes |
| checagens PÓS | **hashes do legado idênticos**; 0 lojas vinculadas; 7 tabelas com 0 linhas; 16 CHECKs; 4 gatilhos |
| rollback com 1 organização gravada | **recusado** (`ROLLBACK_SAAS_RECUSADO`), nada removido |
| rollback com tabelas vazias | exit 0; drift contra o schema da main = **0 comandos**; lojas preservadas; registro removido e migration de novo pendente |
| reaplicar depois do rollback | exit 0; drift contra o schema da branch = **0 comandos** |

Sem credencial real, sem rede e sem Production. Saída completa:
`docs/ai-execution/_evidence/OMNI-SAAS-001A-MERGE-MIGRATION-READINESS-002/ensaio-migration.txt`.
