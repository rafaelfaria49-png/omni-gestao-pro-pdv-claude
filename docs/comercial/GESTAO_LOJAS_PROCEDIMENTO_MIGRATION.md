# Procedimento — aplicar SOMENTE a migration comercial em Production

GOAL `OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001` · PR #374 · migration
`20261118120000_solicitacoes_teste_comercial` (só `CREATE TABLE` + 4 índices; nenhuma tabela existente).

**Nada aqui foi executado.** Cada passo de escrita exige autorização textual do proprietário.

## Estado medido em 2026-11-19 (somente leitura)

| Item | Valor |
|---|---|
| Sessão | `omnigestao_prod`, `transaction_read_only=on` imposto pelo servidor (`PGOPTIONS`) |
| `_prisma_migrations` | 29 linhas, 29 concluídas, 0 falhas/rollback |
| Repositório (head do PR) × Production | única ausente em Production: `20261118120000_solicitacoes_teste_comercial` |
| Migrations KG / peso / balança | nenhuma, nem no repositório nem em Production |
| `solicitacoes_teste_comercial` | **AUSENTE** |
| Projeto canônico | `omni-gestao-pro` (`prj_wjkH…avuz`, confere com `CANONICAL_VERCEL_PROJECT_ID`) |
| `MIGRATION_AUTHORITY_ENABLED` | existe só em Production (valor criptografado, não lido). Os 3 últimos deploys de Production (16 e 17/11) registraram **`MIGRATION_SKIPPED`** ⇒ autoridade desligada |
| `GESTAO_LOJAS_*` | nenhuma definida ⇒ preços propostos ocultos, download desligado, contatos ocultos |

**Consequência:** o merge **não** aplica a migration. Se o código for publicado antes da tabela, o
pedido de teste responde "Nada foi salvo" (falha honesta) e a caixa da plataforma dá erro. Portanto:
**migration primeiro, merge depois** — na mesma janela.

## Passo a passo

0. **Gates:** CI verde no SHA final do PR; autorização textual do proprietário para (a) aplicar a
   migration e (b) fazer o merge. Não ligar `MIGRATION_AUTHORITY_ENABLED` para isso.
1. **Pré-checagem (somente leitura)** — repetir a consulta abaixo com `PGOPTIONS="-c default_transaction_read_only=on"`
   e credencial por variáveis libpq (nunca na linha de comando). Esperado: `total=29`, `falhas=0`,
   tabela `AUSENTE`. Qualquer diferença ⇒ **parar**.
   ```sql
   SELECT 1 / CASE WHEN current_database()='omnigestao_prod' THEN 1 ELSE 0 END;
   SELECT count(*) FROM _prisma_migrations;
   SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
   SELECT coalesce(to_regclass('public.solicitacoes_teste_comercial')::text, 'AUSENTE');
   ```
2. **Ponto de restauração:** criar um branch Neon (snapshot) de `omnigestao_prod` antes da escrita.
3. **Checkout limpo do SHA final do PR** (worktree própria, sem `.env`), `npm ci`, e com
   `DATABASE_URL`/`DIRECT_URL` = conexão **direta** (porta 5432) de produção só no ambiente do processo:
   - `npx prisma migrate status` → deve listar **exatamente 1** pendente: `20261118120000_solicitacoes_teste_comercial`.
     Se listar outra ⇒ **parar**.
   - `npx prisma migrate deploy` → aplica só essa (é a única pendente) e grava o checksum em `_prisma_migrations`.
4. **Pós-checagem (somente leitura):** `_prisma_migrations` = 30, todas concluídas; tabela presente;
   `SELECT count(*) FROM solicitacoes_teste_comercial` = 0; `npx prisma migrate status` = "up to date".
5. **Merge do PR #374** → acompanhar o deploy de Production do `omni-gestao-pro`: log com
   `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED`; o alias aponta para o deploy novo
   (comparar `created` com o horário do merge).
6. **Verificação pós-deploy (sem escrita):** `GET /gestao-lojas` = 200, sem preço, download desligado;
   `GET /api/platform/solicitacoes-teste` sem sessão = 403; `/` continua o acesso piloto.
   Um pedido de teste de verdade grava uma linha em produção: só com autorização, usando email
   claramente de teste, e marcando-o "Descartar" em seguida.

## Reversão

A tabela é isolada (nenhuma FK, nenhum código antigo a lê). Antes de existir pedido real:
reverter o merge; depois `DROP TABLE solicitacoes_teste_comercial;` e remover a linha
`20261118120000_solicitacoes_teste_comercial` de `_prisma_migrations` — ambos só com autorização.
Com pedidos reais gravados, exportar antes de qualquer remoção.

## O que este procedimento NÃO toca

Planos Bronze/Prata/Ouro/Diamante, Stripe, cadastro público (continua fechado), `/` (acesso piloto),
landing antiga de IA, e qualquer migration de KG, vestuário, relatórios ou aparelhos.
