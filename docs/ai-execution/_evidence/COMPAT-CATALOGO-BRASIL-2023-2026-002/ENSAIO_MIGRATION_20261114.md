# Ensaio da migration 20261114120000_compat_catalogo_marcas_lancamento

PostgreSQL 17 descartável em 127.0.0.1:55441 (banco `compat_mig_r4`, criado e removido pelo próprio ensaio). Nada remoto.
Roteiro reprodutível: `ensaio-migration-20261114.sh <worktree> <saida>`. Mesmo caminho de baseline do CI (`scripts/aparelhos/prepare-pg.mjs`):
o histórico do repo não roda a partir de banco vazio (a 0005 depende de tabela criada fora das migrations). Por isso: baseline do
`schema.prisma` da main + a seção "fora do modelo Prisma" da 20261113 (3 CHECKs e 2 índices únicos de expressão, conferidos;
qualquer erro aborta) + as 26 migrations da main registradas como aplicadas. Backup e restauração executam LITERALMENTE as
linhas `--@backup` / `--@restaurar` do arquivo de rollback, e o ensaio exige que os arquivos de backup sejam gerados.

Data: 2026-11-14T14:33Z

```
1. baseline do schema da main + 26 migrations da main registradas como aplicadas (última: 20261113120000_compat_profissional); objetos fora do Prisma da 20261113: 3 CHECKs + 2 índices de expressão
2. dados semeados: 500 modelos manuais em 2 lojas + 2 preferências · checksum 0027aead3f6b7f5ddda094a71bfc73e4 7a5a7aa928b5b87fc4144239ab90679d 
3. aplicada: 20261114120000_compat_catalogo_marcas_lancamento
   preservação: checksum das colunas existentes IGUAL
   defaults: lancamento=lancado em 500 · marcasConfig={} em 2
   CHECKs validados: catalogo_aparelhos_loja_modelos_lancamento_check=true, compat_preferencias_loja_marcas_check=true
   CHECK recusou: UPDATE catalogo_aparelhos_loja_modelos SET lancamento='talve…
   CHECK recusou: UPDATE compat_preferencias_loja SET "marcasConfig"='[1]' WHE…
4. reexecução manual do SQL: OK (sem erro); constraints: 2
   migrate deploy de novo: No pending migrations to apply.
5. drift banco × schema.prisma: exit 0 (npm notice run omni-gestao-pro@0.1.0 npx)
6. backup (passo 0 do plano): 2 modelo(s) aguardando + 1 loja(s) com marcas · checksum colunas novas 89f0e94a5bbba33a20cd3abef9a6959f
   rollback: colunas restantes=0 · registro em _prisma_migrations=0
   dados das colunas existentes após rollback: IGUAIS
   rollback reexecutado: OK (idempotente)
7. reaplicada após rollback: OK
   dados existentes após reaplicar: IGUAIS
   restauração do backup (passo 2 do plano): colunas novas IGUAIS ao pré-rollback
   drift final: exit 0
banco descartável compat_mig_r4 removido
```

Leitura: as colunas existentes têm o mesmo checksum antes, depois da migration, depois do rollback e depois de reaplicar;
o rollback só descarta o que difere do default nas duas colunas novas, e o passo 0 do plano o devolve integralmente.
Lock: o deploy roda a migration numa transação; o ACCESS EXCLUSIVE das duas tabelas (pequenas, por loja) dura até o fim dela.
