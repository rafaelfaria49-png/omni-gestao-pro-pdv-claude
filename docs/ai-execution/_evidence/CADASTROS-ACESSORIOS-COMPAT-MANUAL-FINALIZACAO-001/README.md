# CADASTROS-ACESSORIOS-COMPAT-MANUAL-FINALIZACAO-001 — isolamento do Preview e prova em runtime

Data: 2026-11-07. PR: rafaelfaria49-png/omni-gestao-pro-pdv-claude#339 (DRAFT). Autorização do dono no chat: G1–G7.
Nenhum acesso ao Neon Production; nenhuma env de Production/Development/Preview genérico alterada.

Roteiros em `harness/` (`node <arquivo>.cjs.txt <fase>`). Segredos só em `C:\Projetos\secrets\neon-preview-acc\.env`
e `C:\Projetos\secrets\neon-preview\` (fora do Git); nada vai para argv/stdout.

## G1 — Neon Candidate

| Item | Valor |
|---|---|
| Projeto | `nameless-frost-19035275` (omnigestao-preview, org Free, separado de Production `dry-mouse-36002471`) |
| Branch criada | `pr-acc-compat` = `br-ancient-field-b6092x8d`, filha do main `br-lively-feather-b6esh64a` (dados + schema), auto-delete 7 dias |
| Endpoint | `ep-orange-sound-b6kqp78k` · banco `omnigestao_preview` · runtime `preview_runtime` (sem super/createrole/createdb/bypassrls) |
| Não usados | Neon Production, `pr315-kg` (`br-wandering-band-b6ov7vmt`, colunas KG double × cliente Int) |

## G2 — identidade (`acc-candidate identity`, só leitura, trava `neon.project_id/branch_id/endpoint_id/current_database`)

Candidate e main idênticos antes da migration: 23 migrations, 0 tabelas novas, 1 loja `preview-loja-1`,
1 admin `@preview.invalid`, `dados_md5=bb8e84f0…`. Collation `C.UTF-8` (builtin).

## G3 — migration só no Candidate (`acc-candidate migrate`)

- Aplicada por `prisma migrate deploy` depois da trava; única pendente; status "up to date"; `migrate diff` = 0.
- Checksum final `57b3914343f26652fd5269ae9cc4fa09f8faa922153575792850f830911a6e45` (= blob do Git, LF).
  A 1ª aplicação (checksum `ace54450…`) foi revertida pelo rollback oficial com tabelas vazias e reaplicada após a
  correção P2 (CHECK com `COLLATE "C"`).
- `preview_runtime` com SELECT/INSERT/UPDATE/DELETE nas 2 tabelas; CHECKs e FKs presentes; dados sintéticos
  com o mesmo md5; main do preview inalterado (comparação antes/depois).

## G4 — Vercel (`acc-vercel snapshot|apply|nextauth|second-apply|verify`)

- `omni-gestao-pro`: 13 overrides `target=[preview]`, `gitBranch=claude/cadastros-acessorios-compat-manual-001`:
  `DATABASE_URL`/`DIRECT_URL` (Candidate, validados em memória: endpoint, usuário, banco, pgbouncer, sslmode),
  `AUTH_SECRET` próprio, `NEXTAUTH_URL` = alias da branch, e neutralização de `WHATSAPP_*`, `CONTADOR_PIN`,
  `CONTADOR_SESSION_SECRET`, `ADMIN_DEFAULT_PASSWORD`.
- `omni-gestao` (2º projeto; gera Preview, sem banco nem `AUTH_SECRET`, SSO ligado): 7 overrides da branch
  neutralizando `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `WHATSAPP_*`.
- `verify` contra `g4-env-snapshot-antes.json` (só metadados): 0 entradas alteradas/removidas; todas as novas são
  da branch e só Preview. `ssoProtection` do `omni-gestao-pro` = `null` (inalterado; não alterado de propósito por
  afetar as outras frentes) → mitigado: o Preview desta branch só alcança dados sintéticos e não tem segredo produtivo.
- A Vercel só aceita override para branch que já existe no GitHub: push com `git.deploymentEnabled=false` para a
  branch (`569020e`, 0 deployments conferidos), overrides, revert (`bb124d8`). `vercel.json` sem diff líquido.

## G5 — deployments Preview

| SHA | Deployment | Target | Build |
|---|---|---|---|
| `bb124d8` | `dpl_GU2pVqzpCfRiHyYthBrLGHrP6s3Y` | preview | `MIGRATION_SKIPPED` |
| `a1b52ee` | `dpl_GKXB6BSPV7JobJ8LMSguoGNm7dww` | preview | `MIGRATION_SKIPPED`; overrides (DB, AUTH_SECRET, NEXTAUTH_URL) anteriores ao build |

Nenhum deployment de Production criado.

## G6 — prova em runtime (`acc-runtime vercel|seed|app|db|clean`), deployment `a1b52ee`

Seed só no Candidate (trava na mesma transação): marcador `estoque_produtos` (stock 0, loja 1), loja sintética
`preview-loja-2-acc` com 1 modelo manual, e `deviceCatalog` habilitado no `moduleAccess` da `preview-loja-1`.

`G6_APP=PASS (25/25)`: 401 sem sessão (busca e cadastro) · login sintético e redirect no próprio Preview · sessão
ADMIN/`preview-loja-1` · marcador visível em `/api/ops/inventory/lookup` (MISS) · busca global · cadastro 201
(`manual_…`) · duplicidade 409 · busca por nome e alias · modelo da loja 2 invisível · lista sem loja 2 · header
loja 2 → 403 (busca e cadastro) · PATCH de modelo da loja 2 → 404 · `?storeId=loja2` → 403 · película adicionar
e restaurar · editar 200 · versão antiga 409 · desativar some da busca · regressão `/api/auth/session`,
`/api/ops/inventory/lookup`, `/dashboard`.

`db` (só leitura): Candidate com as linhas do nonce e 2 sessões do runtime; **main do preview: 0 tabelas novas,
0 marcador, 0 sessões do runtime**. `clean`: Candidate de volta a 0 modelos, 0 decisões, 0 marcador, 1 loja.

## Revisão independente

1ª rodada APPROVE_WITH_NITS: P2 (CHECK do par dependia da collation; reproduzido em banco ICU pt-BR e no PG
local Windows) + P3 (limite 2000, corpo > 16 KB, chave global órfã) — corrigidos em `a1b52ee` com testes.
Re-verificação: APPROVE.
