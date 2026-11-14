# COMPAT-PROFISSIONAL-001 — evidências

Branch `claude/compat-profissional-001` (worktree isolada sobre `main` `bec341d`).
Nada foi aplicado em Production: sem acesso ao banco produtivo, sem deploy, sem migration fora de banco local descartável.

## Banco local descartável (PostgreSQL 17, `127.0.0.1:55441`, cluster no scratchpad, já apagado)

1. Baseline = `prisma migrate diff --from-empty --to-schema-datamodel <schema da main>` + CHECKs da `20261107120000`.
2. Aplicada a migration `20261113120000_compat_profissional` **exatamente como no repo** (`psql -1 -v ON_ERROR_STOP=1`): OK.
3. Drift banco × `prisma/schema.prisma` depois da migration: `-- This is an empty migration.` (zero).

## Testes

| Suíte | Resultado |
|---|---|
| Vitest catálogo/acessórios/compat/rotas (`lib/catalogo-aparelhos lib/acessorios lib/compat lib/catalog app/api/catalogo`) | 280 passed, 0 failed |
| Integração PostgreSQL real (`compat-store.integration` + `loja-catalogo-store.integration`) | 24/24 |
| Autorização/isolamento das rotas novas (gates reais) | 11/11 |
| Vitest completo | 87 arquivos falham — **os mesmos 87 falham na `main`** (583 falhas lá × 582 aqui; ambiente: Node 26/jsdom, xmllint, bancos `*_TEST_DATABASE_URL` ausentes). Nenhuma falha nova. |

## Verificação visual (app real, `next dev` local + login NextAuth com conta sintética)

`screenshots/` — Películas (consulta embutida), Capinhas (consulta com "onde está", mesma capinha
por status, estoque por modelo × estoque geral), vínculos com confirmação física, painéis/fileiras
(duplicidade por grafia recusada), cores (paleta + cores da loja; "PRETO" recusado), cadastro de
modelo com Fabricante › Marca › Linha e nome padronizado, preferências, relatórios, celular 390 px
(overflow horizontal = 0 px).

Vendas do relatório são linhas sintéticas inseridas no banco local descartável (não passaram pelo
PDV). O fluxo de venda no PDV é coberto pelo E2E `e2e/cadastros-ramos/11` (CI).
